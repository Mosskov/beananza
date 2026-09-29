import { describe, expect, it } from 'vitest';
import { DROP_HEIGHT_M, EARTH_GRAVITY, FIXED_DT, Sim, createDropScenario, type DropState } from '../src';

const EXPECTED_FALL_TIME = Math.sqrt((2 * DROP_HEIGHT_M) / EARTH_GRAVITY); // ≈ 1.428 s

function newDrop(seed = 1) {
  return new Sim(createDropScenario(), seed);
}

function ball(state: DropState, id: string) {
  const b = state.balls.find((x) => x.id === id);
  if (!b) throw new Error(`no ball ${id}`);
  return b;
}

describe('drop scenario', () => {
  it('releases a 1 kg and a 10 kg ball from 10 m', () => {
    const sim = newDrop();
    expect(sim.state.balls.map((b) => [b.massKg, b.y])).toEqual([
      [1, 10],
      [10, 10],
    ]);
    expect(EXPECTED_FALL_TIME).toBeCloseTo(1.428, 3);
  });

  it.each([
    ['light', 1],
    ['heavy', 10],
  ])('the %s ball (%i kg) lands at sqrt(2h/g) within one step', (id) => {
    const sim = newDrop();
    let landedTick: number | null = null;
    while (sim.tick < 600 && landedTick === null) {
      sim.step();
      if (ball(sim.state, id).landedAt !== null) landedTick = sim.tick;
    }
    expect(landedTick).not.toBeNull();
    // The step in which contact is detected ends within one step of the true time...
    expect(Math.abs((landedTick as number) * FIXED_DT - EXPECTED_FALL_TIME)).toBeLessThanOrEqual(FIXED_DT);
    // ...and the contact time solved inside that step is exact.
    const landedAt = ball(sim.state, id).landedAt as number;
    expect(Math.abs(landedAt - EXPECTED_FALL_TIME)).toBeLessThanOrEqual(FIXED_DT);
    expect(landedAt).toBeCloseTo(EXPECTED_FALL_TIME, 9);
  });

  it('both balls are at the same height at every step and land together', () => {
    const sim = newDrop();
    for (let i = 0; i < 120; i++) {
      sim.step();
      expect(ball(sim.state, 'light').y).toBe(ball(sim.state, 'heavy').y);
    }
    expect(ball(sim.state, 'light').landedAt).toBe(ball(sim.state, 'heavy').landedAt);
  });

  it('matches y = h − ½gt² at t = 1.0 s and has both balls down at t = 1.5 s', () => {
    const sim = newDrop();
    sim.stepTo(1.0);
    expect(sim.tick).toBe(60);
    for (const b of sim.state.balls) {
      expect(b.y).toBeCloseTo(DROP_HEIGHT_M - 0.5 * EARTH_GRAVITY * 1.0 ** 2, 9); // 5.095 m
      expect(b.landedAt).toBeNull();
    }
    sim.stepTo(1.5);
    expect(sim.tick).toBe(90);
    for (const b of sim.state.balls) {
      expect(b.y).toBe(0);
      expect(b.landedAt).not.toBeNull();
    }
  });

  it('reset starts the drop again from t = 0', () => {
    const sim = newDrop();
    sim.stepTo(2);
    sim.enqueue({ type: 'reset' });
    sim.step();
    expect(sim.tick).toBe(1);
    const fresh = newDrop();
    fresh.step();
    expect(sim.state.balls).toEqual(fresh.state.balls);
  });

  it('same seed and inputs give an identical state after 10,000 steps', () => {
    const run = () => {
      const sim = newDrop(2024);
      for (let i = 0; i < 10_000; i++) {
        if (i % 250 === 0) sim.enqueue({ type: 'reset' });
        sim.step();
      }
      return JSON.stringify(sim.snapshot());
    };
    expect(run()).toBe(run());
  });
});
