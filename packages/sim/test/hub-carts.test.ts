import { describe, expect, it } from 'vitest';
import {
  CART_HALF_DEPTH,
  CART_HALF_LENGTH,
  CART_PUSH_CAP,
  CART_PUSH_FORCE,
  CART_RESTITUTION,
  CART_ROLLING_DECEL,
  CART_RUN_PUSH_CAP,
  DEFAULT_PLAZA,
  FIXED_DT,
  HUB_BEAN_MASS_KG,
  HUB_BEAN_RADIUS_M,
  Sim,
  createHubScenario,
  createRng,
  rngNext,
  type HubCommand,
  type HubOptions,
  type HubState,
  type RailCart,
} from '../src';

const newHub = (options: HubOptions = {}) => new Sim<HubState, HubCommand>(createHubScenario(options), 1);
const run = (sim: Sim<HubState, HubCommand>, n: number) => {
  for (let i = 0; i < n; i++) sim.step();
};
const move = (x: number, y: number, running = false): HubCommand => ({ type: 'move', x, y, run: running });
const rail = DEFAULT_PLAZA.rail!;
const cart = (sim: Sim<HubState, HubCommand>, id: string) => sim.state.rail!.carts.find((c) => c.id === id) as RailCart;
const LIGHT_X = rail.carts[0]!.x;
const HEAVY_X = rail.carts[1]!.x;

/** Start west of the light cart on the rail line, walk east until the push starts. */
function pushLightEast(running = false) {
  const sim = newHub({ start: { x: LIGHT_X - 1.2, y: rail.y } });
  sim.enqueue(move(1, 0, running));
  let n = 0;
  while (sim.state.bean.act.kind !== 'pushing' && n < 120) {
    sim.step();
    n += 1;
  }
  expect(sim.state.bean.act).toEqual({ kind: 'pushing', cart: 'light', dir: 1, run: running });
  return sim;
}

describe('hub carts', () => {
  it('has the D19 rail: 5 kg (ridable) and 20 kg carts on a 7.36 m rail', () => {
    const sim = newHub();
    expect(sim.state.rail!.carts.map((c) => [c.id, c.mass, c.v])).toEqual([
      ['light', 5, 0],
      ['heavy', 20, 0],
    ]);
    expect(rail.maxX - rail.minX).toBeCloseTo(7.36, 12);
    expect(rail.carts.map((c) => c.ridable)).toEqual([true, false]);
  });

  it('walking into a cart’s end pushes it at F/m − 0.26 m/s², up to the cap', () => {
    const sim = pushLightEast();
    const v0 = cart(sim, 'light').v;
    const a = CART_PUSH_FORCE / 5 - CART_ROLLING_DECEL;
    expect(v0).toBeCloseTo(a * FIXED_DT, 12);
    run(sim, 10);
    expect(cart(sim, 'light').v).toBeCloseTo(a * 11 * FIXED_DT, 12);
    run(sim, 30);
    expect(cart(sim, 'light').v).toBe(CART_PUSH_CAP);
    // The bean stays against the cart's west end and faces east (side view).
    const b = sim.state.bean;
    expect(b.x).toBeCloseTo(cart(sim, 'light').x - CART_HALF_LENGTH - HUB_BEAN_RADIUS_M, 12);
    expect([b.facingX, b.facingY]).toEqual([1, 0]);
  });

  it('running pushes harder, up to the running cap', () => {
    const sim = pushLightEast(true);
    expect(cart(sim, 'light').v).toBeCloseTo((63 / 5 - CART_ROLLING_DECEL) * FIXED_DT, 12);
    run(sim, 20);
    expect(cart(sim, 'light').v).toBe(CART_RUN_PUSH_CAP);
  });

  it('a cart keeps rolling after the push stops, slowed only by rolling friction', () => {
    const sim = pushLightEast();
    run(sim, 30);
    sim.enqueue(move(0, 0));
    sim.step();
    const v = cart(sim, 'light').v;
    run(sim, 30);
    expect(sim.state.bean.act.kind).toBe('free');
    expect(cart(sim, 'light').v).toBeCloseTo(v - CART_ROLLING_DECEL * 0.5, 12);
  });

  it.each([
    ['north', 1],
    ['south', -1],
  ])('approaching from the %s is blocked, and the cart does not move', (_name, side) => {
    // The rail is 0.9 m from the plaza's south edge, so start closer on that side.
    const sim = newHub({ start: { x: LIGHT_X, y: rail.y + side * (side > 0 ? 1.2 : 0.6) } });
    sim.enqueue(move(0, -side));
    run(sim, 90);
    const b = sim.state.bean;
    expect(Math.abs(b.y - rail.y)).toBeGreaterThan(CART_HALF_DEPTH + HUB_BEAN_RADIUS_M - 0.01);
    expect(Math.abs(b.y - rail.y)).toBeLessThan(CART_HALF_DEPTH + HUB_BEAN_RADIUS_M + 0.03);
    expect(b.act.kind).toBe('free');
    expect(cart(sim, 'light')).toMatchObject({ x: LIGHT_X, v: 0 });
  });

  it('a diagonal into the end still pushes; a move mostly along the cart’s side does not', () => {
    const sim = pushLightEast();
    expect(sim.state.bean.act).toMatchObject({ kind: 'pushing', cart: 'light' });
    const side = newHub({ start: { x: LIGHT_X - 1.2, y: rail.y } });
    side.enqueue(move(0.2, 1));
    run(side, 60);
    expect(cart(side, 'light').v).toBe(0);
  });

  it('a cart rolling into a bean standing on the rail stops against it; the bean is not carried', () => {
    // The review's case: run-push the light cart west into the bumper; it bounces back east
    // into the bean, which stands still.
    const sim = newHub({ start: { x: LIGHT_X + 1.2, y: rail.y } });
    sim.enqueue(move(-1, 0, true));
    run(sim, 21);
    sim.enqueue(move(0, 0));
    run(sim, 240);
    const hit = sim.state.rail!.collisions.find((c) => c.kind === 'bean');
    expect(hit?.carts[0]).toMatchObject({ id: 'light', vAfter: 0 });
    expect(sim.state.rail!.collisions.some((c) => c.kind === 'bumper')).toBe(true);
    const b = sim.state.bean;
    expect(cart(sim, 'light').v).toBe(0);
    // Touching, within Planck's contact skin.
    expect(Math.abs(cart(sim, 'light').x - (b.x - HUB_BEAN_RADIUS_M - CART_HALF_LENGTH))).toBeLessThan(0.01);
    expect(b.vx).toBeCloseTo(0, 9);
  });

  it('E gets into the 5 kg cart and out again; Space also gets out', () => {
    const sim = newHub({ start: { x: LIGHT_X - 0.9, y: rail.y - 0.6 } });
    sim.enqueue({ type: 'action' });
    sim.step();
    expect(sim.state.bean.act).toEqual({ kind: 'riding', cart: 'light' });
    expect(cart(sim, 'light').riderMass).toBe(HUB_BEAN_MASS_KG);
    expect([sim.state.bean.x, sim.state.bean.y]).toEqual([LIGHT_X, rail.y]);
    // Movement input does not walk out of the cart.
    sim.enqueue(move(1, 0));
    run(sim, 30);
    expect(sim.state.bean.x).toBe(LIGHT_X);
    sim.enqueue({ type: 'action' });
    sim.step();
    expect(sim.state.bean.act.kind).toBe('free');
    expect(cart(sim, 'light').riderMass).toBe(0);
    expect(sim.state.bean.y).toBeLessThan(rail.y - CART_HALF_DEPTH - HUB_BEAN_RADIUS_M);

    const again = newHub({ start: { x: LIGHT_X, y: rail.y - 0.7 } });
    again.enqueue({ type: 'action' });
    again.step();
    again.enqueue({ type: 'jump' });
    again.step();
    expect(again.state.bean.act.kind).toBe('free');
    expect(again.state.bean.jumps).toBe(0);
  });

  it('a rider faces the camera while the cart is still and the way it travels while it moves', () => {
    const still = newHub({ start: { x: LIGHT_X - 0.9, y: rail.y - 0.6 } });
    still.enqueue(move(1, 0));
    still.step();
    still.enqueue({ type: 'action' });
    still.step();
    expect(still.state.bean.act).toEqual({ kind: 'riding', cart: 'light' });
    expect([still.state.bean.facingX, still.state.bean.facingY]).toEqual([0, -1]);

    // Pushed to 1.9 m/s, then boarded: 0.38 m/s east, so it faces east; it keeps that facing
    // while slowing through 0.3..0.1 m/s, and turns to the camera below 0.1 m/s.
    const sim = pushLightEast();
    run(sim, 40);
    sim.enqueue(move(0, 0));
    sim.enqueue({ type: 'action' });
    sim.step();
    expect([sim.state.bean.facingX, sim.state.bean.facingY]).toEqual([1, 0]);
    const speedAfter = (s: number) => Math.round(((cart(sim, 'light').v - s) / CART_ROLLING_DECEL) * 60);
    run(sim, speedAfter(0.2));
    expect(cart(sim, 'light').v).toBeLessThan(0.3);
    expect([sim.state.bean.facingX, sim.state.bean.facingY]).toEqual([1, 0]);
    run(sim, speedAfter(0.05));
    expect(cart(sim, 'light').v).toBeLessThan(0.1);
    expect([sim.state.bean.facingX, sim.state.bean.facingY]).toEqual([0, -1]);
  });

  it('a rider in a cart moving west faces west', () => {
    const sim = newHub({ start: { x: LIGHT_X + 1.2, y: rail.y } });
    sim.enqueue(move(-1, 0));
    run(sim, 40);
    expect(sim.state.bean.act).toMatchObject({ kind: 'pushing', dir: -1 });
    sim.enqueue(move(0, 0));
    sim.enqueue({ type: 'action' });
    sim.step();
    expect(sim.state.bean.act).toEqual({ kind: 'riding', cart: 'light' });
    expect(cart(sim, 'light').v).toBeLessThan(-0.3);
    expect([sim.state.bean.facingX, sim.state.bean.facingY]).toEqual([-1, 0]);
  });

  it('E does nothing far from the cart or next to the 20 kg cart', () => {
    const far = newHub({ start: { x: LIGHT_X, y: rail.y + 1.5 } });
    far.enqueue({ type: 'action' });
    far.step();
    expect(far.state.bean.act.kind).toBe('free');
    const heavy = newHub({ start: { x: HEAVY_X, y: rail.y - 0.7 } });
    heavy.enqueue({ type: 'action' });
    heavy.step();
    expect(heavy.state.bean.act.kind).toBe('free');
  });

  it('riding changes the cart’s speed by m/(m+20) getting in and back getting out', () => {
    const sim = pushLightEast();
    run(sim, 40);
    const v = cart(sim, 'light').v;
    expect(v).toBe(CART_PUSH_CAP);
    sim.enqueue(move(0, 0));
    sim.enqueue({ type: 'action' });
    sim.step();
    const f = CART_ROLLING_DECEL * FIXED_DT;
    expect(sim.state.bean.act).toEqual({ kind: 'riding', cart: 'light' });
    const vIn = cart(sim, 'light').v;
    expect(vIn).toBeCloseTo((v * 5) / 25 - f, 12);
    sim.enqueue({ type: 'action' });
    sim.step();
    expect(cart(sim, 'light').v).toBeCloseTo(((vIn * 25) / 5) - f, 12);
  });

  it('pushing the 5 kg cart into the 20 kg cart conserves momentum with e = 0.5', () => {
    const sim = pushLightEast();
    run(sim, 40);
    sim.enqueue(move(0, 0));
    run(sim, 120);
    const hit = sim.state.rail!.collisions.find((c) => c.kind === 'carts');
    expect(hit).toBeDefined();
    const [a, b] = hit!.carts as [RailCart & { vBefore: number; vAfter: number }, RailCart & { vBefore: number; vAfter: number }];
    expect([a.id, b.id]).toEqual(['light', 'heavy']);
    expect(a.mass * a.vAfter + b.mass * b.vAfter).toBeCloseTo(a.mass * a.vBefore + b.mass * b.vBefore, 12);
    expect(b.vAfter - a.vAfter).toBeCloseTo(CART_RESTITUTION * (a.vBefore - b.vBefore), 12);
  });

  it('is deterministic over 10,000 steps with scripted pushes, rides and jumps', () => {
    const play = () => {
      const sim = newHub();
      const rng = createRng(7);
      for (let i = 0; i < 10_000; i++) {
        if (i % 45 === 0) {
          const r = rngNext(rng);
          if (r < 0.35) sim.enqueue(move(r < 0.2 ? 1 : -1, 0, r < 0.1));
          else if (r < 0.5) sim.enqueue(move(0, r < 0.42 ? 1 : -1));
          else if (r < 0.62) sim.enqueue({ type: 'moveTo', x: (r - 0.56) * 60, y: rail.y });
          else if (r < 0.75) sim.enqueue({ type: 'action' });
          else if (r < 0.85) sim.enqueue({ type: 'jump' });
          else sim.enqueue(move(0, 0));
        }
        sim.step();
      }
      return sim.snapshot();
    };
    const first = play();
    expect(play()).toEqual(first);
    expect(first.rail!.collisions.length).toBeGreaterThan(0);
  });
});
