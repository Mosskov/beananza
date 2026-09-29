// Checks the cart scripts' logs (run the scripts first):
//   pnpm shot --script tools/shot/scripts/hub-carts-push.json --script tools/shot/scripts/hub-carts-heavy.json --script tools/shot/scripts/hub-carts-ride.json
//   pnpm shot:check-carts
// Every number is recomputed from the logged masses, velocities and sim times.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CART_PUSH_CAP, CART_PUSH_FORCE, CART_RESTITUTION, CART_ROLLING_DECEL, FIXED_DT, HUB_BEAN_MASS_KG, type HubState } from '@beananza/sim';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SHOTS = join(REPO, process.argv[2] ?? 'artifacts/shots');

interface CartView {
  id: string;
  mass: number;
  v: number;
  readout: string | null;
  expectedReadout: string;
}
interface Log {
  simTime: number;
  sceneState: { state: HubState; view: { carts: CartView[] } };
}

const load = (script: string, shot: string): Log => JSON.parse(readFileSync(join(SHOTS, script, `${shot}.json`), 'utf8')) as Log;
const cart = (log: Log, id: string) => {
  const c = log.sceneState.view.carts.find((k) => k.id === id);
  if (!c) throw new Error(`no cart ${id}`);
  return c;
};

let failures = 0;
function check(name: string, got: number, want: number, tol = 1e-9): void {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got} (expected ${want} ± ${tol})`);
}

// 1. Pushing accelerates at F/m − rolling friction, up to the cap.
for (const [script, id, sign] of [
  ['hub-carts-push', 'light', 1],
  ['hub-carts-heavy', 'heavy', -1],
] as const) {
  const a = load(script, 'pushing-a');
  const b = load(script, 'pushing-b');
  const m = cart(a, id).mass;
  check(`${script}: acceleration of the ${m} kg cart (m/s²)`, (sign * (cart(b, id).v - cart(a, id).v)) / (b.simTime - a.simTime), CART_PUSH_FORCE / m - CART_ROLLING_DECEL);
  check(`${script}: speed at the cap (m/s)`, sign * cart(load(script, 'at-cap'), id).v, CART_PUSH_CAP, 0);
}

// 2. The cart-cart collision conserves momentum, with restitution 0.5.
const collisions = load('hub-carts-push', 'later').sceneState.state.rail?.collisions ?? [];
const hit = collisions.find((c) => c.kind === 'carts');
if (!hit) {
  failures += 1;
  console.log('FAIL hub-carts-push: no cart-cart collision logged');
} else {
  const [p, q] = hit.carts as [(typeof hit.carts)[0], (typeof hit.carts)[0]];
  const before = p.mass * p.vBefore + q.mass * q.vBefore;
  const after = p.mass * p.vAfter + q.mass * q.vAfter;
  console.log(`     collision at t = ${hit.time} s: ${p.mass} kg ${p.vBefore} → ${p.vAfter} m/s, ${q.mass} kg ${q.vBefore} → ${q.vAfter} m/s`);
  check('hub-carts-push: momentum after − before (kg·m/s)', after - before, 0);
  check('hub-carts-push: restitution', (q.vAfter - p.vAfter) / (p.vBefore - q.vBefore), CART_RESTITUTION);
}

// 3. Riding: in, v·m/(m+M); out, v·(m+M)/m (the command applies at the start of the step, then
//    one step of rolling friction).
const f = CART_ROLLING_DECEL * FIXED_DT;
const capLog = load('hub-carts-ride', 'at-cap');
const inLog = load('hub-carts-ride', 'got-in');
const ridingLog = load('hub-carts-ride', 'riding');
const outLog = load('hub-carts-ride', 'got-out');
const m = cart(capLog, 'light').mass;
check('hub-carts-ride: rider mass added (kg)', cart(inLog, 'light').mass - m, HUB_BEAN_MASS_KG, 0);
check('hub-carts-ride: speed getting in (m/s)', cart(inLog, 'light').v, (cart(capLog, 'light').v * m) / (m + HUB_BEAN_MASS_KG) - f);
check('hub-carts-ride: speed getting out (m/s)', cart(outLog, 'light').v, (cart(ridingLog, 'light').v * (m + HUB_BEAN_MASS_KG)) / m - f);

// 4. Every readout shows the logged speed in m/s.
for (const [script, shots] of [
  ['hub-carts-push', ['pushing-a', 'pushing-b', 'at-cap', 'coasting', 'after-collision', 'later']],
  ['hub-carts-heavy', ['pushing-a', 'pushing-b', 'at-cap', 'coasting']],
  ['hub-carts-ride', ['at-cap', 'got-in', 'riding', 'got-out', 'rolling-on']],
] as const) {
  for (const shot of shots) {
    for (const c of load(script, shot).sceneState.view.carts) {
      const ok = c.readout === `${Math.abs(c.v).toFixed(2)} m/s` && c.readout === c.expectedReadout;
      if (!ok) {
        failures += 1;
        console.log(`FAIL ${script}/${shot}: ${c.id} readout "${c.readout}" for v = ${c.v}`);
      }
    }
  }
}
console.log(failures === 0 ? 'all cart checks passed (readouts included)' : `${failures} cart check(s) failed`);
process.exitCode = failures === 0 ? 0 : 1;
