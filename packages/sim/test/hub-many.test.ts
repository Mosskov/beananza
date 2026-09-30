import { describe, expect, it } from 'vitest';
import {
  CART_HALF_LENGTH,
  CART_PUSH_FORCE,
  CART_ROLLING_DECEL,
  FIXED_DT,
  HUB_BEAN_MASS_KG,
  HUB_BEAN_RADIUS_M,
  HUB_LAYOUTS,
  HUB_WALK_SPEED,
  ISLAND,
  LOCAL_PLAYER,
  Sim,
  createHubScenario,
  createRng,
  rngInt,
  rngNext,
  standSpot,
  type HubCommand,
  type HubOptions,
  type HubState,
} from '../src';

/** A hub with no local bean, like the M2 server; players join by id. */
const server = (options: HubOptions = {}) => new Sim<HubState, HubCommand>(createHubScenario({ local: false, ...options }), 1);
const run = (sim: Sim<HubState, HubCommand>, n: number) => {
  for (let i = 0; i < n; i++) sim.step();
};
const bean = (sim: Sim<HubState, HubCommand>, id: string) => {
  const b = sim.state.beans.find((q) => q.id === id);
  if (!b) throw new Error(`no bean ${id}`);
  return b;
};

describe('many beans in one hub (M2)', () => {
  it('starts with the local bean offline and with nobody on the server', () => {
    expect(new Sim<HubState, HubCommand>(createHubScenario(), 1).state.beans.map((b) => b.id)).toEqual([LOCAL_PLAYER]);
    expect(server().state.beans).toEqual([]);
  });

  it('adds beans on join (clamped to the island) and drops them on leave', () => {
    const sim = server({ layout: ISLAND });
    sim.enqueue({ type: 'join', player: 'a' });
    sim.enqueue({ type: 'join', player: 'b', at: { x: 100, y: 0 } });
    sim.enqueue({ type: 'join', player: 'a' }); // already here: ignored
    sim.enqueue({ type: 'join', player: 'no spaces' }); // not a valid id: ignored
    sim.step();
    expect(sim.state.beans.map((b) => b.id)).toEqual(['a', 'b']);
    expect(bean(sim, 'a')).toMatchObject({ x: ISLAND.start.x, y: ISLAND.start.y });
    // Clamped into the east corner (then Planck's 0.01 m contact skin nudges it in a little).
    expect(Math.abs(bean(sim, 'b').x - (12 - HUB_BEAN_RADIUS_M / (Math.sqrt(3) / 2)))).toBeLessThan(0.01);
    sim.enqueue({ type: 'leave', player: 'a' });
    sim.enqueue({ type: 'move', x: 1, y: 0, run: false, player: 'a' }); // gone: ignored
    sim.step();
    expect(sim.state.beans.map((b) => b.id)).toEqual(['b']);
  });

  it('moves each bean by its own input', () => {
    const sim = server({ layout: { ...ISLAND, portals: [] } });
    sim.enqueue({ type: 'join', player: 'a', at: { x: -2, y: 0 } });
    sim.enqueue({ type: 'join', player: 'b', at: { x: 2, y: 0 } });
    sim.step();
    sim.enqueue({ type: 'move', x: 1, y: 0, run: false, player: 'a' });
    sim.enqueue({ type: 'move', x: 0, y: 1, run: false, player: 'b' });
    run(sim, 60);
    expect(bean(sim, 'a').x).toBeCloseTo(-2 + HUB_WALK_SPEED, 6);
    expect(bean(sim, 'a').y).toBeCloseTo(0, 9);
    expect(bean(sim, 'b').x).toBeCloseTo(2, 9);
    expect(bean(sim, 'b').y).toBeCloseTo(HUB_WALK_SPEED, 6);
  });

  it('lets beans walk through each other, so a crowd never blocks the way', () => {
    const sim = server({ layout: { ...ISLAND, portals: [] } });
    sim.enqueue({ type: 'join', player: 'a', at: { x: -2, y: 0 } });
    sim.enqueue({ type: 'join', player: 'still', at: { x: 0, y: 0 } });
    sim.step();
    sim.enqueue({ type: 'move', x: 1, y: 0, run: false, player: 'a' });
    run(sim, 120);
    expect(bean(sim, 'a').x).toBeCloseTo(-2 + 2 * HUB_WALK_SPEED, 6);
    expect(bean(sim, 'still')).toMatchObject({ x: 0, y: 0 });
  });

  it('adds the pushes of two beans on the same cart end', () => {
    const carts = HUB_LAYOUTS.carts!;
    const rail = carts.rail!;
    const light = rail.carts.find((c) => c.id === 'light')!;
    // Against the cart's west end (within the push reach), so both push from the first step.
    const west = light.x - CART_HALF_LENGTH - HUB_BEAN_RADIUS_M - 0.02;
    const speedAfter = (pushers: string[]) => {
      const sim = server({ layout: carts });
      for (const p of pushers) sim.enqueue({ type: 'join', player: p, at: { x: west, y: rail.y } });
      sim.step();
      for (const p of pushers) sim.enqueue({ type: 'move', x: 1, y: 0, run: false, player: p });
      run(sim, 4); // well under the 1.9 m/s push cap, even with two

      return sim.state.rail!.carts.find((c) => c.id === 'light')!.v;
    };
    const one = speedAfter(['a']);
    const two = speedAfter(['a', 'b']);
    expect(one).toBeGreaterThan(0);
    // Same pushing time: the extra acceleration is exactly one more push force on the cart.
    const pushSteps = one / (CART_PUSH_FORCE / light.mass - CART_ROLLING_DECEL);
    expect(two).toBeCloseTo(pushSteps * (2 * CART_PUSH_FORCE / light.mass - CART_ROLLING_DECEL), 9);
  });

  it('takes one rider per cart', () => {
    const carts = HUB_LAYOUTS.carts!;
    const rail = carts.rail!;
    const light = rail.carts.find((c) => c.id === 'light')!;
    const sim = server({ layout: carts });
    sim.enqueue({ type: 'join', player: 'a', at: { x: light.x, y: rail.y - 0.8 } });
    sim.enqueue({ type: 'join', player: 'b', at: { x: light.x + 0.3, y: rail.y - 0.8 } });
    sim.step();
    sim.enqueue({ type: 'action', player: 'a' });
    sim.step();
    sim.enqueue({ type: 'action', player: 'b' });
    run(sim, 60);
    expect(bean(sim, 'a').act.kind).toBe('riding');
    expect(bean(sim, 'b').act.kind).toBe('free');
    expect(sim.state.rail!.carts.find((c) => c.id === 'light')!.riderMass).toBe(HUB_BEAN_MASS_KG);
  });

  it('a rider that leaves the hub leaves the cart as if it hopped out (momentum conserved)', () => {
    const carts = HUB_LAYOUTS.carts!;
    const rail = carts.rail!;
    const spec = rail.carts.find((c) => c.id === 'light')!;
    const sim = server({ layout: carts });
    sim.enqueue({ type: 'join', player: 'a', at: { x: spec.x, y: rail.y - 0.8 } });
    sim.step();
    sim.enqueue({ type: 'action', player: 'a' });
    run(sim, 60);
    expect(bean(sim, 'a').act.kind).toBe('riding');
    const cart = sim.state.rail!.carts.find((c) => c.id === 'light')!;
    cart.v = 1; // set rolling, as if pushed
    const p = (cart.mass + cart.riderMass) * cart.v;
    sim.enqueue({ type: 'leave', player: 'a' });
    sim.step();
    expect(cart.riderMass).toBe(0);
    // The leave happens before the step's own rolling: undo one step of friction.
    expect(cart.mass * (cart.v + CART_ROLLING_DECEL * FIXED_DT)).toBeCloseTo(p, 9);
  });

  it('keeps a seat for the bean on it: another bean cannot sit there', () => {
    const yard = HUB_LAYOUTS.bench!;
    const benchSpec = yard.benches[0]!;
    const free = benchSpec.seats.find((q) => !q.taken)!;
    const spot = standSpot(benchSpec, free);
    const sim = server({ layout: yard });
    sim.enqueue({ type: 'join', player: 'a', at: { x: spot.x, y: spot.y - 0.3 } });
    sim.enqueue({ type: 'join', player: 'b', at: { x: spot.x + 0.4, y: spot.y - 0.5 } });
    sim.step();
    sim.enqueue({ type: 'use', id: benchSpec.id, player: 'a' });
    run(sim, 120);
    expect(bean(sim, 'a').act.kind).toBe('sitting');
    sim.enqueue({ type: 'use', id: benchSpec.id, player: 'b' });
    sim.enqueue({ type: 'action', player: 'b' });
    run(sim, 120);
    expect(bean(sim, 'b').act.kind).toBe('free');
  });

  it('30 beans playing at random for 60 s give the same state twice', () => {
    const play = () => {
      const sim = server({ layout: ISLAND });
      const rng = createRng(7);
      const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);
      for (const id of ids) sim.enqueue({ type: 'join', player: id, at: { x: rngNext(rng) * 16 - 8, y: rngNext(rng) * 12 - 6 } });
      const started = performance.now();
      for (let t = 0; t < 3600; t++) {
        if (t % 20 === 0) {
          for (const id of ids) {
            const r = rngInt(rng, 0, 9);
            if (r < 6) sim.enqueue({ type: 'move', x: rngInt(rng, -1, 1), y: rngInt(rng, -1, 1), run: r === 0, player: id });
            else if (r === 6) sim.enqueue({ type: 'jump', player: id });
            else if (r === 7) sim.enqueue({ type: 'action', player: id });
            else sim.enqueue({ type: 'moveTo', x: rngNext(rng) * 20 - 10, y: rngNext(rng) * 16 - 8, player: id });
          }
        }
        sim.step();
      }
      return { state: sim.snapshot(), msPerStep: (performance.now() - started) / 3600 };
    };
    const a = play();
    const b = play();
    expect(a.state).toEqual(b.state);
    expect(a.state.beans.length).toBeGreaterThan(0);
    // Informational: the server steps this 60 times a second.
    console.info(`hub with 30 beans: ${a.msPerStep.toFixed(3)} ms per step`);
    expect(a.msPerStep).toBeLessThan(16);
  });
});
