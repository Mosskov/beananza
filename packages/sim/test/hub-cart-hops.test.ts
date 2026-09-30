import { describe, expect, it } from 'vitest';
import {
  BOARD_ARC_M,
  BOARD_ARC_PER_M,
  BOARD_CROUCH_S,
  BOARD_HOP_PER_M_S,
  BOARD_HOP_S,
  CART_FLOOR_M,
  DEFAULT_PLAZA,
  LEAVE_ARC_M,
  LEAVE_HOP_S,
  Sim,
  createHubScenario,
  type HubAct,
  type HubCommand,
  type HubOptions,
  type HubState,
} from '../src';

const newHub = (options: HubOptions = {}) => new Sim<HubState, HubCommand>(createHubScenario(options), 1);
const rail = DEFAULT_PLAZA.rail!;
const LIGHT_X = rail.carts[0]!.x;
const cartX = (sim: Sim<HubState, HubCommand>) => sim.state.rail!.carts[0]!.x;
const hopZ = (p: number, from: number, to: number, arc: number) => from + (to - from) * p + 4 * arc * p * (1 - p);
type Boarding = Extract<HubAct, { kind: 'boarding' }>;
type Leaving = Extract<HubAct, { kind: 'leaving' }>;

/** A bean south-west of the still light cart, pressing E once. */
function boardFrom(dx: number, dy: number) {
  const sim = newHub({ start: { x: LIGHT_X + dx, y: rail.y + dy } });
  sim.enqueue({ type: 'action' });
  sim.step();
  return sim;
}

describe('hopping into and out of a cart (D23)', () => {
  it('times the hop in: a 0.12 s crouch, then 0.32 s + 0.111 s per metre, arc 0.30 m + 0.3 per metre', () => {
    const sim = boardFrom(-0.9, -0.6);
    const d = Math.hypot(0.9, 0.6);
    const act = sim.state.beans[0]!.act as Boarding;
    expect(act).toMatchObject({ kind: 'boarding', cart: 'light', startTick: 0, fromX: LIGHT_X - 0.9, fromY: rail.y - 0.6 });
    expect(act.hopTick).toBe(Math.round(BOARD_CROUCH_S * 60)); // 7 steps
    expect(act.endTick - act.hopTick).toBe(Math.round((BOARD_HOP_S + d * BOARD_HOP_PER_M_S) * 60)); // 26 steps
    expect(act.arc).toBeCloseTo(BOARD_ARC_M + BOARD_ARC_PER_M * d, 12);
    // More than 0.4 m along the rail from the cart: the bean faces it sideways.
    expect([sim.state.beans[0]!.facingX, sim.state.beans[0]!.facingY]).toEqual([1, 0]);
  });

  it('crouches in place, then follows the arc and lands on the floor at exactly the end tick', () => {
    const sim = boardFrom(-0.9, -0.6);
    const act = sim.state.beans[0]!.act as Boarding;
    while (sim.tick < act.hopTick) {
      expect([sim.state.beans[0]!.x, sim.state.beans[0]!.y, sim.state.beans[0]!.z]).toEqual([act.fromX, act.fromY, 0]);
      sim.step();
    }
    let peak = 0;
    while (sim.tick < act.endTick) {
      sim.step();
      const p = (sim.tick - act.hopTick) / (act.endTick - act.hopTick);
      if (p < 1) {
        expect(sim.state.beans[0]!.act.kind).toBe('boarding');
        expect(sim.state.beans[0]!.z).toBeCloseTo(hopZ(p, 0, CART_FLOOR_M, act.arc), 12);
        expect(sim.state.beans[0]!.x).toBeCloseTo(act.fromX + (cartX(sim) - act.fromX) * p, 12);
        peak = Math.max(peak, sim.state.beans[0]!.z);
      }
    }
    expect(peak).toBeGreaterThan(act.arc);
    expect(sim.state.beans[0]!.act).toEqual({ kind: 'riding', cart: 'light', since: act.endTick });
    expect([sim.state.beans[0]!.x, sim.state.beans[0]!.y, sim.state.beans[0]!.z]).toEqual([LIGHT_X, rail.y, CART_FLOOR_M]);
    expect(sim.state.rail!.carts[0]!.riderMass).toBe(20);
  });

  it('faces the camera when hopping in from 0.4 m or less along the rail', () => {
    const sim = boardFrom(0.3, -0.7);
    expect((sim.state.beans[0]!.act as Boarding).facingX).toBe(0);
    expect([sim.state.beans[0]!.facingX, sim.state.beans[0]!.facingY]).toEqual([0, -1]);
  });

  it('hops out in 0.38 s with a 0.40 m arc, to 0.5 m south of the rail, facing the camera', () => {
    const sim = boardFrom(-0.9, -0.6);
    sim.stepTo(1);
    expect(sim.state.beans[0]!.act.kind).toBe('riding');
    sim.enqueue({ type: 'jump' });
    sim.step();
    const act = sim.state.beans[0]!.act as Leaving;
    expect(act).toMatchObject({ kind: 'leaving', cart: 'light', fromX: LIGHT_X, fromY: rail.y, toX: LIGHT_X, arc: LEAVE_ARC_M });
    expect(act.toY).toBeCloseTo(rail.y - 0.5, 12);
    expect(act.endTick - act.startTick).toBe(Math.round(LEAVE_HOP_S * 60)); // 23 steps
    expect(sim.state.rail!.carts[0]!.riderMass).toBe(0);
    while (sim.tick < act.endTick - 1) {
      const p = (sim.tick - act.startTick) / (act.endTick - act.startTick);
      expect(sim.state.beans[0]!.z).toBeCloseTo(hopZ(p, CART_FLOOR_M, 0, act.arc), 12);
      expect([sim.state.beans[0]!.facingX, sim.state.beans[0]!.facingY]).toEqual([0, -1]);
      sim.step();
    }
    sim.step();
    expect(sim.state.beans[0]!.act.kind).toBe('free');
    expect(sim.state.beans[0]!.z).toBe(0);
    expect(sim.state.beans[0]!.y).toBeCloseTo(rail.y - 0.5, 12);
  });

  it('ignores E, Space and taps mid-hop; held keys walk on after landing', () => {
    const plain = boardFrom(-0.9, -0.6);
    const busy = boardFrom(-0.9, -0.6);
    for (let i = 0; i < 20; i++) {
      busy.enqueue(i % 3 === 0 ? { type: 'action' } : i % 3 === 1 ? { type: 'jump' } : { type: 'moveTo', x: 3, y: 1 });
      busy.step();
      plain.step();
    }
    expect(busy.state).toEqual(plain.state);

    const sim = boardFrom(-0.9, -0.6);
    sim.stepTo(1);
    sim.enqueue({ type: 'action' });
    sim.step();
    sim.enqueue({ type: 'move', x: 1, y: 0, run: false });
    sim.step();
    expect(sim.state.beans[0]!.act.kind).toBe('leaving');
    const x0 = sim.state.beans[0]!.x;
    sim.stepTo(2);
    expect(sim.state.beans[0]!.act.kind).toBe('free');
    expect(sim.state.beans[0]!.x).toBeGreaterThan(x0 + 0.5);
  });

  it('restores a mid-hop snapshot into a fresh scenario and carries on identically', () => {
    const sim = boardFrom(-0.9, -0.6);
    sim.stepTo(0.25);
    expect(sim.state.beans[0]!.act.kind).toBe('boarding');
    const restored = newHub({ start: { x: LIGHT_X - 0.9, y: rail.y - 0.6 } });
    restored.state = sim.snapshot();
    for (const s of [sim, restored]) {
      s.stepTo(1);
      s.enqueue({ type: 'action' });
      s.stepTo(1.2);
      s.enqueue({ type: 'move', x: -1, y: -1, run: true });
      s.stepTo(3);
    }
    expect(restored.state).toEqual(sim.state);
    expect(sim.state.beans[0]!.act.kind).toBe('free');
  });
});
