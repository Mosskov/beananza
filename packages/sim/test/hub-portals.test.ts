import { describe, expect, it } from 'vitest';
import {
  ENTER_S,
  HUB_BEAN_RADIUS_M,
  HUB_LAYOUTS,
  ISLAND,
  PORTAL_REACH_M,
  REFUSED_S,
  SIM_HZ,
  Sim,
  containsPoint,
  createHubScenario,
  insetConvex,
  portalExit,
  type HubCommand,
  type HubState,
} from '../src';

const yard = HUB_LAYOUTS.portals!;
const open = yard.portals.find((p) => !p.locked)!;
const locked = yard.portals.find((p) => p.locked)!;
const newHub = (start: { x: number; y: number }) => new Sim<HubState, HubCommand>(createHubScenario({ layout: yard, start }), 1);
const run = (sim: Sim<HubState, HubCommand>, n: number) => {
  for (let i = 0; i < n; i++) sim.step();
};
/** Step until the act kind is `kind` (at most `max` steps); returns the steps taken or -1. */
const until = (sim: Sim<HubState, HubCommand>, kind: string, max = 600) => {
  for (let i = 0; i < max; i++) {
    if (sim.state.beans[0]!.act.kind === kind) return i;
    sim.step();
  }
  return -1;
};

describe('region portals (D2)', () => {
  it('walking into an open portal floats the bean in, then it is gone to that region', () => {
    const sim = newHub({ x: open.x, y: open.y - 1.5 });
    sim.enqueue({ type: 'move', x: 0, y: 1, run: false });
    expect(until(sim, 'entering')).toBeGreaterThan(0);
    const act = sim.state.beans[0]!.act;
    if (act.kind !== 'entering') throw new Error('expected entering');
    expect(act.endTick - act.startTick).toBe(Math.round(ENTER_S * SIM_HZ));
    // Held keys do not steer it any more.
    sim.enqueue({ type: 'move', x: 1, y: 0, run: true });
    expect(until(sim, 'gone')).toBeGreaterThan(0);
    const gone = sim.state.beans[0]!.act;
    expect(gone).toMatchObject({ kind: 'gone', portal: open.id, region: 'mechanics' });
    expect(sim.state.beans[0]!.x).toBe(open.x);
    expect(sim.state.beans[0]!.y).toBe(open.y);
    // Gone: nothing moves it.
    sim.enqueue({ type: 'jump' });
    sim.enqueue({ type: 'moveTo', x: -3, y: -2 });
    run(sim, 60);
    expect(sim.state.beans[0]!.act.kind).toBe('gone');
    expect(sim.state.beans[0]!.x).toBe(open.x);
  });

  it('a tap on a portal walks over and goes in', () => {
    const sim = newHub({ x: -1, y: -1.5 });
    sim.enqueue({ type: 'use', id: open.id });
    sim.step();
    expect(sim.state.beans[0]!.target).toEqual({ x: open.x, y: open.y });
    expect(until(sim, 'gone')).toBeGreaterThan(0);
  });

  it('E heads for a portal within reach, and does nothing further away', () => {
    const near = newHub({ x: open.x + PORTAL_REACH_M - 0.1, y: open.y });
    near.enqueue({ type: 'action' });
    near.step();
    expect(near.state.beans[0]!.target).toEqual({ x: open.x, y: open.y });
    const far = newHub({ x: open.x, y: open.y - PORTAL_REACH_M - 0.2 });
    far.enqueue({ type: 'action' });
    far.step();
    expect(far.state.beans[0]!.target).toBeNull();
  });

  it('a locked portal bounces the bean back out, facing the camera, and it never leaves', () => {
    const sim = newHub({ x: locked.x, y: locked.y - 1.2 });
    sim.enqueue({ type: 'move', x: 0, y: 1, run: false });
    expect(until(sim, 'refused')).toBeGreaterThan(0);
    sim.enqueue({ type: 'move', x: 0, y: 0, run: false });
    const act = sim.state.beans[0]!.act;
    if (act.kind !== 'refused') throw new Error('expected refused');
    expect(act.endTick - act.startTick).toBe(Math.round(REFUSED_S * SIM_HZ));
    run(sim, 1);
    expect(sim.state.beans[0]!.facingY).toBe(-1);
    expect(until(sim, 'free')).toBeGreaterThan(0);
    expect(sim.state.beans[0]!.y).toBeLessThan(locked.y - 0.5);
    expect(sim.state.beans[0]!.z).toBe(0);
    run(sim, 120);
    expect(sim.state.beans[0]!.act.kind).toBe('free');
  });

  it('two runs of the same commands end in the same state', () => {
    const play = () => {
      const sim = newHub({ x: 0, y: -1 });
      sim.enqueue({ type: 'use', id: locked.id });
      run(sim, 150);
      sim.enqueue({ type: 'use', id: open.id });
      run(sim, 200);
      return sim.snapshot();
    };
    expect(play()).toEqual(play());
  });

  it('every island portal has an exit spot on the island, clear of every footprint', () => {
    const centres = insetConvex(ISLAND.walkable, HUB_BEAN_RADIUS_M);
    expect(ISLAND.portals.map((p) => p.region)).toEqual(['mechanics', 'waves', 'storm', 'crystal']);
    expect(ISLAND.portals.filter((p) => p.locked).map((p) => p.region)).toEqual(['crystal']);
    for (const portal of ISLAND.portals) {
      const exit = portalExit(portal);
      expect(containsPoint(centres, exit), portal.id).toBe(true);
      for (const p of [...ISLAND.props, ...ISLAND.benches]) {
        const clear = Math.abs(exit.x - p.x) > p.halfWidth + HUB_BEAN_RADIUS_M || Math.abs(exit.y - p.y) > p.halfDepth + HUB_BEAN_RADIUS_M;
        expect(clear, `${portal.id} exit inside ${p.id}`).toBe(true);
      }
      // Coming back, the bean stands outside the ring, so it does not walk straight back in.
      const sim = new Sim<HubState, HubCommand>(createHubScenario({ layout: ISLAND, start: exit }), 1);
      run(sim, 30);
      expect(sim.state.beans[0]!.act.kind).toBe('free');
    }
  });
});
