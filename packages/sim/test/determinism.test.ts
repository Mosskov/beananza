import { describe, expect, it } from 'vitest';
import {
  FIXED_DT,
  FixedStepper,
  Sim,
  createRng,
  rngNext,
  rngRange,
  type RngState,
  type Scenario,
  type SimStateBase,
} from '../src';

// Test-only scenario that leans on everything determinism depends on: seeded randomness
// every step, commands, and float integration. Not game content.
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface JitterState extends SimStateBase {
  particles: Particle[];
  kicks: number;
}
type JitterCommand = { type: 'kick'; strength: number };

const jitter: Scenario<JitterState, JitterCommand> = {
  name: 'jitter-fixture',
  init(rng: RngState) {
    const particles: Particle[] = [];
    for (let i = 0; i < 16; i++) {
      particles.push({ x: rngRange(rng, -5, 5), y: rngRange(rng, 0, 10), vx: 0, vy: 0 });
    }
    return { particles, kicks: 0 };
  },
  step(state, commands) {
    for (const c of commands) {
      state.kicks += 1;
      for (const p of state.particles) p.vy += c.strength;
    }
    for (const p of state.particles) {
      p.vx += rngRange(state.rng, -1, 1) * FIXED_DT;
      p.vy -= 9.81 * FIXED_DT;
      p.x += p.vx * FIXED_DT;
      p.y += p.vy * FIXED_DT;
      if (p.y < 0) {
        p.y = -p.y;
        p.vy = -p.vy * 0.8;
      }
    }
  },
};

/** The same "player input" every run: a kick on a fixed schedule. */
function inputFor(tick: number): JitterCommand | null {
  return tick % 337 === 0 ? { type: 'kick', strength: 3 + (tick % 5) } : null;
}

function run(seed: number, steps: number): JitterState {
  const sim = new Sim(jitter, seed);
  for (let i = 0; i < steps; i++) {
    const input = inputFor(sim.tick);
    if (input) sim.enqueue(input);
    sim.step();
  }
  return sim.snapshot();
}

describe('determinism', () => {
  it('same seed and inputs give an identical state after 10,000 steps', () => {
    const a = run(1234, 10_000);
    const b = run(1234, 10_000);
    expect(a.tick).toBe(10_000);
    expect(a.kicks).toBeGreaterThan(0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a different seed gives a different state (the seed is actually used)', () => {
    expect(JSON.stringify(run(1234, 10_000))).not.toBe(JSON.stringify(run(4321, 10_000)));
  });

  it('frame timing does not change the state, only the step count does', () => {
    const direct = run(99, 10_000);

    // Drive the same sim through the accumulator with irregular frame times.
    const sim = new Sim(jitter, 99);
    const stepper = new FixedStepper();
    const frameRng = createRng(7);
    while (sim.tick < 10_000) {
      stepper.advance(rngRange(frameRng, 0.004, 0.05), () => {
        if (sim.tick >= 10_000) return;
        const input = inputFor(sim.tick);
        if (input) sim.enqueue(input);
        sim.step();
      });
    }
    expect(JSON.stringify(sim.snapshot())).toBe(JSON.stringify(direct));
  });

  it('seeded RNG repeats its sequence and stays in [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const x = rngNext(a);
      expect(x).toBe(rngNext(b));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
