// Checks the cart scripts' logs (run the scripts first):
//   pnpm shot --script tools/shot/scripts/hub-carts-push.json --script tools/shot/scripts/hub-carts-heavy.json --script tools/shot/scripts/hub-carts-ride.json
//   pnpm shot:check-carts [<shots dir>]
// Every number is recomputed from the logged masses, velocities and sim times.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CART_PUSH_CAP, CART_PUSH_FORCE, CART_RESTITUTION, CART_ROLLING_DECEL, HUB_BEAN_MASS_KG, type HubState } from '@beananza/sim';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** The scripts whose logs this checks. */
export const CART_SCRIPTS = ['hub-carts-push', 'hub-carts-heavy', 'hub-carts-ride'] as const;

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

/** Check the cart scripts' logs under `shots`. */
export function checkCarts(shots: string): { failures: number; lines: string[] } {
  const load = (script: string, shot: string): Log => JSON.parse(readFileSync(join(shots, script, `${shot}.json`), 'utf8')) as Log;
  const cart = (log: Log, id: string) => {
    const c = log.sceneState.view.carts.find((k) => k.id === id);
    if (!c) throw new Error(`no cart ${id}`);
    return c;
  };
  const lines: string[] = [];
  let failures = 0;
  const check = (name: string, got: number, want: number, tol = 1e-9): void => {
    const ok = Math.abs(got - want) <= tol;
    if (!ok) failures += 1;
    lines.push(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got} (expected ${want} ± ${tol})`);
  };

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
    lines.push('FAIL hub-carts-push: no cart-cart collision logged');
  } else {
    // West group first, east group last; every cart is logged with its own mass.
    const [p, q] = [hit.carts[0], hit.carts[hit.carts.length - 1]] as [(typeof hit.carts)[0], (typeof hit.carts)[0]];
    const before = hit.carts.reduce((s, k) => s + k.mass * k.vBefore, 0);
    const after = hit.carts.reduce((s, k) => s + k.mass * k.vAfter, 0);
    lines.push(`     collision at t = ${hit.time} s: ${p.mass} kg ${p.vBefore} → ${p.vAfter} m/s, ${q.mass} kg ${q.vBefore} → ${q.vAfter} m/s`);
    check('hub-carts-push: momentum after − before (kg·m/s)', after - before, 0);
    check('hub-carts-push: restitution', (q.vAfter - p.vAfter) / (p.vBefore - q.vBefore), CART_RESTITUTION);
  }

  // 3. Riding (D23): the bean lands in the cart after a crouch and a hop, and takes off to get
  //    out. The logged rider events give the moments; in between the cart only rolls under
  //    friction. In: v·m/(m+M) at touchdown; out: v·(m+M)/m at take-off.
  const f = CART_ROLLING_DECEL;
  const capLog = load('hub-carts-ride', 'at-cap');
  const inLog = load('hub-carts-ride', 'got-in');
  const ridingLog = load('hub-carts-ride', 'riding');
  const outLog = load('hub-carts-ride', 'got-out');
  const events = load('hub-carts-ride', 'rolling-on').sceneState.state.rail?.riders ?? [];
  const into = events.find((e) => e.kind === 'in');
  const outOf = events.find((e) => e.kind === 'out');
  if (!into || !outOf) {
    failures += 1;
    lines.push('FAIL hub-carts-ride: the rider events (in and out) are not both logged');
  } else {
    const m = cart(capLog, 'light').mass;
    lines.push(`     in at t = ${into.time} s: ${into.vBefore} → ${into.vAfter} m/s; out at t = ${outOf.time} s: ${outOf.vBefore} → ${outOf.vAfter} m/s`);
    check('hub-carts-ride: rider mass added (kg)', into.massAfter - into.massBefore, HUB_BEAN_MASS_KG, 0);
    check('hub-carts-ride: coasting from the cap until touchdown (m/s)', into.vBefore, cart(capLog, 'light').v - f * (into.time - capLog.simTime));
    check('hub-carts-ride: speed getting in (m/s)', into.vAfter, (into.vBefore * m) / (m + HUB_BEAN_MASS_KG));
    check('hub-carts-ride: logged speed after getting in (m/s)', cart(inLog, 'light').v, into.vAfter - f * (inLog.simTime - into.time));
    check('hub-carts-ride: speed at take-off (m/s)', outOf.vBefore, cart(ridingLog, 'light').v - f * (outOf.time - ridingLog.simTime));
    check('hub-carts-ride: speed getting out (m/s)', outOf.vAfter, (outOf.vBefore * (m + HUB_BEAN_MASS_KG)) / m);
    check('hub-carts-ride: logged speed after getting out (m/s)', cart(outLog, 'light').v, outOf.vAfter - f * (outLog.simTime - outOf.time));
  }

  // 4. Every readout shows the logged speed in m/s.
  for (const [script, shots] of [
    ['hub-carts-push', ['pushing-a', 'pushing-b', 'at-cap', 'coasting', 'after-collision', 'later']],
    ['hub-carts-heavy', ['pushing-a', 'pushing-b', 'at-cap', 'coasting']],
    ['hub-carts-ride', ['at-cap', 'crouch', 'hop-up', 'hop-down', 'got-in', 'riding', 'hopping-out', 'got-out', 'rolling-on']],
  ] as const) {
    for (const shot of shots) {
      for (const c of load(script, shot).sceneState.view.carts) {
        const ok = c.readout === `${Math.abs(c.v).toFixed(2)} m/s` && c.readout === c.expectedReadout;
        if (!ok) {
          failures += 1;
          lines.push(`FAIL ${script}/${shot}: ${c.id} readout "${c.readout}" for v = ${c.v}`);
        }
      }
    }
  }
  lines.push(failures === 0 ? 'all cart checks passed (readouts included)' : `${failures} cart check(s) failed`);
  return { failures, lines };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { failures, lines } = checkCarts(join(REPO, process.argv[2] ?? 'artifacts/shots'));
  for (const line of lines) console.log(line);
  process.exitCode = failures === 0 ? 0 : 1;
}
