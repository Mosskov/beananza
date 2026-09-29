import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAZA,
  EARTH_GRAVITY,
  FIXED_DT,
  HUB_BEAN_RADIUS_M,
  HUB_JUMP_APEX_M,
  HUB_JUMP_SPEED,
  HUB_RUN_SPEED,
  HUB_STUCK_STEPS,
  HUB_WALK_SPEED,
  Sim,
  createHubScenario,
  createRng,
  rngInt,
  rngNext,
  rngRange,
  type HubCommand,
  type HubOptions,
  type HubState,
} from '../src';

const newHub = (options: HubOptions = {}) => new Sim<HubState, HubCommand>(createHubScenario(options), 1);
const steps = (seconds: number) => Math.round(seconds / FIXED_DT);
const run = (sim: Sim<HubState, HubCommand>, n: number) => {
  for (let i = 0; i < n; i++) sim.step();
};
const move = (x: number, y: number, running = false): HubCommand => ({ type: 'move', x, y, run: running });

// Contact solving lets a body sit up to Planck's linear slop (0.005 m) inside a surface, and
// polygons and chains carry a 0.01 m skin (Planck's polygon radius), so a resting bean stops
// between SLOP inside and SKIN + SLOP short of the drawn edge.
const SLOP = 0.006;
const SKIN = 0.01;
/** Expect `gap` (centre to surface) to be a resting contact at radius `r`. */
const expectResting = (gap: number, r: number) => {
  expect(gap).toBeGreaterThanOrEqual(r - SLOP);
  expect(gap).toBeLessThanOrEqual(r + SKIN + SLOP);
};
const walk = DEFAULT_PLAZA.walkable;
const tree = DEFAULT_PLAZA.props[0]!;

describe('hub movement: tuned numbers', () => {
  it('uses the prototype speeds re-derived at 100 px = 1 m, and the confirmed jump (D16)', () => {
    expect(HUB_WALK_SPEED).toBe(2.4);
    expect(HUB_RUN_SPEED).toBe(4.2);
    expect(HUB_JUMP_APEX_M).toBe(0.768);
    expect(HUB_JUMP_SPEED).toBeCloseTo(Math.sqrt(2 * 9.81 * 0.768), 12);
    expect(HUB_JUMP_SPEED).toBeCloseTo(3.8818, 4);
    expect(HUB_STUCK_STEPS).toBe(21); // 0.35 s at 60 Hz
  });

  it('holding right for 1.0 s walks 2.4 m', () => {
    const sim = newHub({ start: { x: -3, y: -1 } });
    sim.enqueue(move(1, 0));
    run(sim, steps(1));
    expect(sim.state.bean.x - -3).toBeCloseTo(2.4, 9);
    expect(sim.state.bean.y).toBeCloseTo(-1, 12);
    expect(sim.state.bean.vx).toBeCloseTo(2.4, 9);
  });

  it('running for 1.0 s covers 4.2 m', () => {
    const sim = newHub({ start: { x: -3, y: -1 } });
    sim.enqueue(move(1, 0, true));
    run(sim, steps(1));
    expect(sim.state.bean.x - -3).toBeCloseTo(4.2, 9);
  });

  it('moving diagonally is no faster than moving straight', () => {
    for (const running of [false, true]) {
      const sim = newHub({ start: { x: -3, y: -1.5 } });
      sim.enqueue(move(1, 1, running));
      run(sim, steps(0.5));
      const { x, y, vx, vy } = sim.state.bean;
      const speed = running ? HUB_RUN_SPEED : HUB_WALK_SPEED;
      expect(Math.hypot(vx, vy)).toBeCloseTo(speed, 9);
      expect(Math.hypot(x - -3, y - -1.5)).toBeCloseTo(speed * 0.5, 9);
      expect(x - -3).toBeCloseTo(y - -1.5, 12);
    }
  });

  it('clamps oversized analog input to full speed', () => {
    const sim = newHub({ start: { x: -3, y: -1 } });
    sim.enqueue(move(5, 0));
    run(sim, 1);
    expect(sim.state.bean.vx).toBeCloseTo(HUB_WALK_SPEED, 12);
  });

  it('stops when the direction is released', () => {
    const sim = newHub({ start: { x: -3, y: -1 } });
    sim.enqueue(move(1, 0));
    run(sim, 10);
    sim.enqueue(move(0, 0));
    run(sim, 1);
    const x = sim.state.bean.x;
    run(sim, 30);
    expect(sim.state.bean.x).toBe(x);
    expect(sim.state.bean.vx).toBe(0);
  });

  it('keeps the last facing direction when idle', () => {
    const sim = newHub({ start: { x: -3, y: -1 } });
    sim.enqueue(move(-1, 1));
    run(sim, 5);
    sim.enqueue(move(0, 0));
    run(sim, 5);
    expect(sim.state.bean.facingX).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(sim.state.bean.facingY).toBeCloseTo(Math.SQRT1_2, 12);
  });
});

describe('hub jump', () => {
  const g = EARTH_GRAVITY;
  const airTime = (2 * HUB_JUMP_SPEED) / g;

  it('rises to the apex and lands after 2·v0/g (about 0.791 s)', () => {
    const sim = newHub({ start: { x: -3, y: -1 } });
    sim.enqueue({ type: 'jump' });
    let peak = 0;
    let airSteps = 0;
    sim.step();
    while (!sim.state.bean.grounded) {
      peak = Math.max(peak, sim.state.bean.z);
      airSteps += 1;
      sim.step();
      expect(airSteps).toBeLessThan(100);
    }
    const jump = sim.state.bean.lastJump!;
    expect(airTime).toBeCloseTo(0.7914, 4);
    expect(jump.landedAt! - jump.startedAt).toBeCloseTo(airTime, 9);
    // Sampled at 60 Hz, the highest step is within ½·g·(dt/2)² of the true apex.
    expect(peak).toBeLessThanOrEqual(HUB_JUMP_APEX_M + 1e-12);
    expect(peak).toBeGreaterThan(HUB_JUMP_APEX_M - 0.5 * g * (FIXED_DT / 2) ** 2 - 1e-12);
    expect(jump.peakZ).toBeCloseTo(peak, 12);
    expect(Math.abs((airSteps + 1) * FIXED_DT - airTime)).toBeLessThanOrEqual(FIXED_DT);
    expect(sim.state.bean.z).toBe(0);
    expect(sim.state.bean.vz).toBe(0);
  });

  it('follows z = v0·t − ½·g·t² exactly', () => {
    const sim = newHub({ start: { x: -3, y: -1 } });
    sim.enqueue({ type: 'jump' });
    run(sim, 24); // 0.4 s
    const t = 24 * FIXED_DT;
    expect(sim.state.bean.z).toBeCloseTo(HUB_JUMP_SPEED * t - 0.5 * g * t * t, 12);
  });

  it('cannot jump again while in the air', () => {
    const sim = newHub({ start: { x: -3, y: -1 } });
    sim.enqueue({ type: 'jump' });
    run(sim, 10);
    const vz = sim.state.bean.vz;
    sim.enqueue({ type: 'jump' });
    run(sim, 1);
    expect(sim.state.bean.vz).toBeCloseTo(vz - g * FIXED_DT, 12);
    expect(sim.state.bean.jumps).toBe(1);
  });

  it('has full air control', () => {
    const sim = newHub({ start: { x: -3, y: -1 } });
    sim.enqueue({ type: 'jump' });
    run(sim, 6);
    sim.enqueue(move(1, 0));
    run(sim, 30);
    expect(sim.state.bean.grounded).toBe(false);
    expect(sim.state.bean.x - -3).toBeCloseTo(HUB_WALK_SPEED * 0.5, 9);
  });
});

describe('hub bounds and props', () => {
  const r = HUB_BEAN_RADIUS_M;
  const directions: [string, number, number][] = [
    ['west', -1, 0],
    ['east', 1, 0],
    ['north', 0, 1],
    ['south', 0, -1],
    ['north-east', 1, 1],
    ['south-west', -1, -1],
  ];

  it.each(directions)('running %s for 10 s stays inside the walkable area', (_name, dx, dy) => {
    // Only the edges matter here: the plaza without its bench (running north would meet it).
    const sim = newHub({ layout: { ...DEFAULT_PLAZA, benches: [] }, start: { x: -3, y: -1 } });
    sim.enqueue(move(dx, dy, true));
    for (let i = 0; i < steps(10); i++) {
      sim.step();
      const { x, y } = sim.state.bean;
      expect(x).toBeGreaterThanOrEqual(walk.minX + r - SLOP);
      expect(x).toBeLessThanOrEqual(walk.maxX - r + SLOP);
      expect(y).toBeGreaterThanOrEqual(walk.minY + r - SLOP);
      expect(y).toBeLessThanOrEqual(walk.maxY - r + SLOP);
    }
    // It ends up pressed against the edge it ran into.
    const { x, y } = sim.state.bean;
    if (dx < 0) expectResting(x - walk.minX, r);
    if (dx > 0) expectResting(walk.maxX - x, r);
    if (dy < 0) expectResting(y - walk.minY, r);
    if (dy > 0) expectResting(walk.maxY - y, r);
  });

  it('cannot walk through the prop', () => {
    const sim = newHub({ start: { x: tree.x - 2, y: tree.y } });
    sim.enqueue(move(1, 0));
    run(sim, steps(3));
    expect(sim.state.bean.x).toBeLessThanOrEqual(tree.x - tree.halfWidth - r + SLOP);
    expectResting(tree.x - tree.halfWidth - sim.state.bean.x, r);
  });

  it('can stand just north and just south of the prop (behind and in front of it)', () => {
    for (const side of [1, -1]) {
      const sim = newHub({ start: { x: tree.x, y: tree.y + side * 1.5 } });
      sim.enqueue(move(0, -side));
      run(sim, steps(2));
      const gap = side * (sim.state.bean.y - tree.y);
      expectResting(gap - tree.halfDepth, r);
    }
  });
});

describe('hub tap-to-move', () => {
  const r = HUB_BEAN_RADIUS_M;

  it('walks to the tapped point, arrives exactly and stops', () => {
    const sim = newHub({ start: { x: -3, y: -1 } });
    sim.enqueue({ type: 'moveTo', x: -1, y: -2 });
    const distance = Math.hypot(2, -1);
    run(sim, steps(distance / HUB_WALK_SPEED) + 1);
    expect(sim.state.bean.x).toBeCloseTo(-1, 9);
    expect(sim.state.bean.y).toBeCloseTo(-2, 9);
    expect(sim.state.bean.target).toBeNull();
    run(sim, 10);
    expect(sim.state.bean.vx).toBe(0);
  });

  it('takes distance / speed to get there, within one step', () => {
    const sim = newHub({ start: { x: -3, y: -1 } });
    sim.enqueue({ type: 'moveTo', x: 1, y: -1 });
    let n = 0;
    do {
      sim.step();
      n += 1;
    } while (sim.state.bean.target !== null && n < 1000);
    expect(Math.abs(n * FIXED_DT - 4 / HUB_WALK_SPEED)).toBeLessThanOrEqual(FIXED_DT);
  });

  it('runs to the target while run is held', () => {
    const sim = newHub({ start: { x: -3, y: -1 } });
    sim.enqueue(move(0, 0, true));
    sim.enqueue({ type: 'moveTo', x: 1, y: -1 });
    run(sim, 10);
    expect(sim.state.bean.vx).toBeCloseTo(HUB_RUN_SPEED, 9);
  });

  it('clamps targets to the walkable area', () => {
    const sim = newHub({ start: { x: 0, y: -1 } });
    sim.enqueue({ type: 'moveTo', x: 50, y: -50 });
    sim.step();
    expect(sim.state.bean.target).toEqual({ x: walk.maxX - r, y: walk.minY + r });
  });

  it('cancels the target after being stuck for 0.35 s', () => {
    // Straight at the middle of the prop's west face: no way to slide around it.
    const sim = newHub({ start: { x: tree.x - 2, y: tree.y } });
    sim.enqueue({ type: 'moveTo', x: tree.x + 1.5, y: tree.y });
    let stuckFrom: number | null = null;
    let cancelledAt: number | null = null;
    for (let i = 0; i < steps(5) && cancelledAt === null; i++) {
      sim.step();
      if (stuckFrom === null && sim.state.bean.stuckSteps === 1) stuckFrom = sim.tick;
      if (sim.state.bean.target === null) cancelledAt = sim.tick;
    }
    expect(stuckFrom).not.toBeNull();
    expect(cancelledAt).not.toBeNull();
    expect(cancelledAt! - stuckFrom! + 1).toBe(HUB_STUCK_STEPS);
    expect(sim.state.bean.x).toBeLessThan(tree.x - tree.halfWidth - r + SLOP);
  });

  it('keeps the target while it slides along an obstacle', () => {
    // Glancing the prop's corner: blocked at first, but it slides past and still arrives.
    const sim = newHub({ start: { x: tree.x - 2, y: tree.y + tree.halfDepth + r - 0.05 } });
    sim.enqueue({ type: 'moveTo', x: tree.x + 2, y: tree.y + tree.halfDepth + r - 0.05 });
    run(sim, steps(4));
    expect(sim.state.bean.x).toBeGreaterThan(tree.x + tree.halfWidth);
  });

  it('arrives at a corner target without waiting out the stuck timer', () => {
    const sim = newHub({ start: { x: 0, y: -1 } });
    sim.enqueue({ type: 'moveTo', x: 50, y: -50 });
    const ideal = Math.hypot(walk.maxX - r, walk.minY + r + 1) / HUB_WALK_SPEED;
    let n = 0;
    do {
      sim.step();
      n += 1;
    } while (sim.state.bean.target !== null && n < 1000);
    expect(n).toBeLessThanOrEqual(steps(ideal) + 2);
    expect(Math.hypot(sim.state.bean.x - (walk.maxX - r), sim.state.bean.y - (walk.minY + r))).toBeLessThan(0.02);
  });

  it('ignores commands with non-finite numbers', () => {
    const sim = newHub({ start: { x: -3, y: -1 } });
    sim.enqueue({ type: 'moveTo', x: Number.NaN, y: 0 });
    sim.enqueue(move(Number.POSITIVE_INFINITY, 0));
    run(sim, 5);
    expect(sim.state.bean.target).toBeNull();
    expect(sim.state.input).toEqual({ x: 0, y: 0, run: false });
    expect(sim.state.bean.x).toBe(-3);
  });

  it('a movement key cancels the target', () => {
    const sim = newHub({ start: { x: -3, y: -1 } });
    sim.enqueue({ type: 'moveTo', x: 1, y: -1 });
    run(sim, 10);
    sim.enqueue(move(0, 1));
    run(sim, 1);
    expect(sim.state.bean.target).toBeNull();
    expect(sim.state.bean.vx).toBe(0);
    expect(sim.state.bean.vy).toBeCloseTo(HUB_WALK_SPEED, 9);
  });
});

describe('hub determinism', () => {
  /** A scripted but varied input stream: keys, runs, jumps and taps, from a fixed seed. */
  function playthrough(seed: number, total: number): HubState {
    const sim = newHub();
    const rng = createRng(seed);
    for (let i = 0; i < total; i++) {
      if (i % 15 === 0) {
        const roll = rngNext(rng);
        if (roll < 0.45) sim.enqueue(move(rngInt(rng, -1, 1), rngInt(rng, -1, 1), rngNext(rng) < 0.4));
        else if (roll < 0.7) sim.enqueue({ type: 'moveTo', x: rngRange(rng, -7, 7), y: rngRange(rng, -4, 3) });
        else if (roll < 0.85) sim.enqueue({ type: 'jump' });
        else sim.enqueue(move(0, 0));
      }
      sim.step();
    }
    return sim.snapshot();
  }

  it('the same inputs give an identical state after 10,000 steps', () => {
    const a = playthrough(42, 10_000);
    const b = playthrough(42, 10_000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.tick).toBe(10_000);
    expect(a.bean.jumps).toBeGreaterThan(10);
  });

  it('different inputs give a different state', () => {
    expect(JSON.stringify(playthrough(42, 2_000))).not.toBe(JSON.stringify(playthrough(43, 2_000)));
  });

  it('two sims stepping interleaved do not affect each other', () => {
    const a = newHub();
    const b = newHub();
    a.enqueue(move(1, 0));
    b.enqueue(move(0, -1));
    for (let i = 0; i < 120; i++) {
      a.step();
      b.step();
    }
    const solo = newHub();
    solo.enqueue(move(1, 0));
    run(solo, 120);
    expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(solo.snapshot()));
  });
});
