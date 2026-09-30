import { describe, expect, it } from 'vitest';
import {
  BUMPER_RESTITUTION,
  CART_HALF_LENGTH,
  CART_PUSH_CAP,
  CART_PUSH_FORCE,
  CART_RESTITUTION,
  CART_ROLLING_DECEL,
  CART_RUN_PUSH_CAP,
  CART_RUN_PUSH_FORCE,
  FIXED_DT,
  boardCart,
  leaveCart,
  stepRail,
  totalMass,
  type Rail,
  type RailCart,
  type RailCollision,
  type RailPush,
} from '../src';

const RAIL: Rail = { y: 0, minX: -10, maxX: 10 };
const cart = (id: string, mass: number, x: number, v = 0): RailCart => ({ id, mass, riderMass: 0, x, v });
const f = CART_ROLLING_DECEL;

/** Step the rail n fixed steps; returns every collision. */
function run(carts: RailCart[], n: number, push: RailPush | null = null, rail = RAIL): RailCollision[] {
  const out: RailCollision[] = [];
  for (let i = 0; i < n; i++) out.push(...stepRail(rail, carts, push, i * FIXED_DT, FIXED_DT));
  return out;
}

describe('cart numbers (D19)', () => {
  it('are the prototype values at 100 px = 1 m', () => {
    expect([CART_PUSH_FORCE, CART_RUN_PUSH_FORCE]).toEqual([42, 63]);
    expect([CART_PUSH_CAP, CART_RUN_PUSH_CAP]).toEqual([1.9, 2.8]);
    expect(CART_ROLLING_DECEL).toBe(0.26);
    expect([BUMPER_RESTITUTION, CART_RESTITUTION]).toEqual([0.45, 0.5]);
    expect(CART_HALF_LENGTH * 2).toBe(0.8);
  });
});

describe('pushing', () => {
  it.each([
    [5, false],
    [20, false],
    [5, true],
    [20, true],
  ])('accelerates a %i kg cart at F/m minus rolling friction, up to the cap (running: %s)', (mass, running) => {
    const F = running ? CART_RUN_PUSH_FORCE : CART_PUSH_FORCE;
    const cap = running ? CART_RUN_PUSH_CAP : CART_PUSH_CAP;
    const a = F / mass - f;
    const c = cart('c', mass, -8);
    const push: RailPush = { cart: 'c', dir: 1, run: running };
    const tCap = cap / a;
    const before = Math.floor(tCap / FIXED_DT) - 1;
    run([c], before, push);
    const t = before * FIXED_DT;
    expect(c.v).toBeCloseTo(a * t, 12);
    expect(c.x).toBeCloseTo(-8 + 0.5 * a * t * t, 12);
    // Reaches the cap exactly and holds it (the push balances friction).
    run([c], 3, push);
    expect(c.v).toBe(cap);
    const x = c.x;
    run([c], 30, push);
    expect(c.v).toBe(cap);
    expect(c.x).toBeCloseTo(x + 30 * FIXED_DT * cap, 12);
  });

  it('pushes west as well as east', () => {
    const c = cart('c', 5, 0);
    run([c], 6, { cart: 'c', dir: -1, run: false });
    expect(c.v).toBeCloseTo(-(CART_PUSH_FORCE / 5 - f) * 0.1, 12);
  });

  it('pushing against the motion slows the cart with push and friction together', () => {
    const c = cart('c', 20, 0, 1);
    run([c], 6, { cart: 'c', dir: -1, run: false });
    expect(c.v).toBeCloseTo(1 - (CART_PUSH_FORCE / 20 + f) * 0.1, 12);
  });

  it('pushes a cart into another as one body of both masses', () => {
    const a = cart('a', 5, 0);
    const b = cart('b', 20, 2 * CART_HALF_LENGTH); // touching
    run([a, b], 30, { cart: 'a', dir: 1, run: false });
    const acc = CART_PUSH_FORCE / 25 - f;
    expect(a.v).toBeCloseTo(acc * 0.5, 12);
    expect(b.v).toBeCloseTo(acc * 0.5, 12);
    expect(b.x - a.x).toBeCloseTo(2 * CART_HALF_LENGTH, 12);
  });

  it('cannot push a cart through a bumper', () => {
    const c = cart('c', 5, RAIL.maxX - CART_HALF_LENGTH);
    run([c], 30, { cart: 'c', dir: 1, run: false });
    expect(c.v).toBe(0);
    expect(c.x).toBe(RAIL.maxX - CART_HALF_LENGTH);
  });
});

describe('rolling friction', () => {
  it('decelerates at 0.26 m/s² whatever the mass, and stops at v²/(2·0.26)', () => {
    for (const mass of [5, 20]) {
      const c = cart('c', mass, -8, 1.9);
      run([c], 60);
      expect(c.v).toBeCloseTo(1.9 - f * 1, 12);
      expect(c.x).toBeCloseTo(-8 + 1.9 - 0.5 * f, 12);
      run([c], 60 * 7);
      expect(c.v).toBe(0);
      expect(c.x).toBeCloseTo(-8 + (1.9 * 1.9) / (2 * f), 12);
    }
  });
});

describe('collisions', () => {
  it('bounces off a bumper with restitution 0.45, solved inside the step', () => {
    // 0.35 m from the bumper at 2 m/s: hits it at t where 0.35 = 2t − ½·0.26·t².
    const c = cart('c', 5, RAIL.maxX - CART_HALF_LENGTH - 0.35, 2);
    const hits = run([c], 30);
    const tHit = (2 - Math.sqrt(4 - 2 * f * 0.35)) / f;
    expect(hits).toHaveLength(1);
    const hit = hits[0] as RailCollision;
    expect(hit.kind).toBe('bumper');
    expect(hit.time).toBeCloseTo(tHit, 12);
    const vHit = 2 - f * tHit;
    expect(hit.carts[0]?.vBefore).toBeCloseTo(vHit, 12);
    expect(hit.carts[0]?.vAfter).toBeCloseTo(-BUMPER_RESTITUTION * vHit, 12);
    // After the bounce it rolls back west, still under friction.
    const t = 30 * FIXED_DT;
    expect(c.v).toBeCloseTo(-BUMPER_RESTITUTION * vHit + f * (t - tHit), 12);
  });

  it.each([
    [5, 1.9, 20, 0],
    [20, 1.9, 5, 0],
    [5, 2.8, 20, -1],
    [20, 1, 5, 0.3],
  ])('conserves momentum with restitution 0.5 (%i kg at %f m/s into %i kg at %f m/s)', (m1, v1, m2, v2) => {
    const a = cart('a', m1, -1, v1);
    const b = cart('b', m2, 1, v2);
    const hits = run([a, b], 300).filter((h) => h.kind === 'carts');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const hit = hits[0] as RailCollision;
    const [ha, hb] = hit.carts as [RailCollision['carts'][0], RailCollision['carts'][0]];
    const pBefore = ha.mass * ha.vBefore + hb.mass * hb.vBefore;
    const pAfter = ha.mass * ha.vAfter + hb.mass * hb.vAfter;
    expect(pAfter).toBeCloseTo(pBefore, 12);
    expect(hb.vAfter - ha.vAfter).toBeCloseTo(CART_RESTITUTION * (ha.vBefore - hb.vBefore), 12);
    expect([ha.mass, hb.mass]).toEqual([m1, m2]);
  });

  it('logs each cart with its own mass when a group of touching carts hits another', () => {
    // Pushing the 5 kg cart drives the 7 kg cart it touches as one group into the 20 kg cart.
    const a = cart('a', 5, -2);
    const b = cart('b', 7, -2 + 2 * CART_HALF_LENGTH);
    const c = cart('c', 20, 1);
    const hits = run([a, b, c], 120, { cart: 'a', dir: 1, run: false }).filter((h) => h.kind === 'carts');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const hit = hits[0] as RailCollision;
    expect(hit.carts.map((k) => [k.id, k.mass])).toEqual([['a', 5], ['b', 7], ['c', 20]]);
    // Summing the logged carts gives the momentum of the impact, before and after.
    const p = (key: 'vBefore' | 'vAfter') => hit.carts.reduce((s, k) => s + k.mass * k[key], 0);
    expect(p('vBefore')).toBeCloseTo(12 * (hit.carts[0]?.vBefore ?? NaN), 12);
    expect(p('vAfter')).toBeCloseTo(p('vBefore'), 12);
  });

  it('solves the impact time exactly', () => {
    // A cart at rest feels no friction, so the 1.2 m gap (centres 2 m apart) closes as
    // 1.9·t − ½·0.26·t².
    const hits = run([cart('a', 5, -1, 1.9), cart('b', 20, 1, 0)], 60);
    expect(hits[0]?.time).toBeCloseTo((1.9 - Math.sqrt(1.9 * 1.9 - 2 * f * 1.2)) / f, 12);
  });

  it('keeps carts apart and on the rail', () => {
    const a = cart('a', 5, -9, -2.8);
    const b = cart('b', 20, -7.5, -2.8);
    run([a, b], 600);
    expect(a.x - CART_HALF_LENGTH).toBeGreaterThanOrEqual(RAIL.minX - 1e-9);
    expect(b.x - a.x).toBeGreaterThanOrEqual(2 * CART_HALF_LENGTH - 1e-9);
  });
});

describe('a bean standing on the rail', () => {
  it('stops a cart that rolls into it (restitution 0) and is logged', () => {
    const c = cart('c', 5, 0, 1.9);
    const hits: RailCollision[] = [];
    for (let i = 0; i < 60; i++) hits.push(...stepRail(RAIL, [c], null, i * FIXED_DT, FIXED_DT, { lo: 1, hi: 1.5 }));
    expect(c.v).toBe(0);
    expect(c.x).toBe(1 - CART_HALF_LENGTH);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kind: 'bean', carts: [{ id: 'c', vAfter: 0 }] });
  });

  it('splits the rail: carts on either side stop against it and never meet', () => {
    const a = cart('a', 5, -2, 1.5);
    const b = cart('b', 20, 2, -1.5);
    run([a, b], 0);
    for (let i = 0; i < 120; i++) stepRail(RAIL, [a, b], null, i * FIXED_DT, FIXED_DT, { lo: -0.25, hi: 0.25 });
    expect(a.x + CART_HALF_LENGTH).toBeLessThanOrEqual(-0.25 + 1e-12);
    expect(b.x - CART_HALF_LENGTH).toBeGreaterThanOrEqual(0.25 - 1e-12);
    expect([a.v, b.v]).toEqual([0, 0]);
  });
});

describe('riding', () => {
  it('hopping in gives v·m/(m+M), hopping out reverses it (momentum conserved)', () => {
    const c = cart('c', 5, 0, 1.9);
    boardCart(c, 20);
    expect(totalMass(c)).toBe(25);
    expect(c.v).toBeCloseTo((1.9 * 5) / 25, 12);
    leaveCart(c);
    expect(c.riderMass).toBe(0);
    expect(c.v).toBeCloseTo(1.9, 12);
  });

  it('a ridden cart collides with its rider’s mass included', () => {
    const a = cart('a', 5, -1, 5);
    boardCart(a, 20); // 1 m/s with the rider
    const hit = run([a, cart('b', 20, 1, 0)], 120).find((h) => h.kind === 'carts');
    expect(hit?.carts[0]?.mass).toBe(25);
  });
});

describe('determinism', () => {
  it('gives identical carts after 10,000 steps with scripted pushes', () => {
    const once = () => {
      const carts = [cart('a', 5, -3), cart('b', 20, 2)];
      const log: RailCollision[] = [];
      for (let i = 0; i < 10_000; i++) {
        const phase = Math.floor(i / 97) % 4;
        const push: RailPush | null = phase === 0 ? { cart: 'a', dir: 1, run: i % 2 === 0 } : phase === 2 ? { cart: 'b', dir: -1, run: false } : null;
        log.push(...stepRail(RAIL, carts, push, i * FIXED_DT, FIXED_DT));
      }
      return JSON.stringify({ carts, log });
    };
    const first = once();
    expect(once()).toBe(first);
    expect(JSON.parse(first).log.length).toBeGreaterThan(10);
  });
});
