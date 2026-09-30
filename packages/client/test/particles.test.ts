import { describe, expect, it } from 'vitest';
import { EFFECTS } from '../src/art/effects';
import { STAR_BACK_SCALE, STAR_ORBIT, STAR_PARTS, clipParticles, particleOffsets, starOffsets } from '../src/rig/particles';

const angle = (o: { x: number; y: number }) => Math.atan2(o.y / STAR_ORBIT.ry, o.x / STAR_ORBIT.rx);
const turn = (a: number) => ((a / (2 * Math.PI)) % 1 + 1) % 1;

describe('effect particles (D26): the dizzy stars', () => {
  it('are the parts of the stars effect, on the head slot', () => {
    expect(EFFECTS['dizzy-stars']).toEqual({ slot: 'fxHead', parts: [...STAR_PARTS] });
  });

  it('sit on the showcase orbit (24 by 7 units), smaller at the back', () => {
    for (const t of [0, 0.13, 0.5, 0.91]) {
      for (const o of Object.values(starOffsets(t, 1234, false))) {
        expect((o.x / STAR_ORBIT.rx) ** 2 + (o.y / STAR_ORBIT.ry) ** 2).toBeCloseTo(1, 9);
        expect(o.scale).toBeGreaterThanOrEqual(STAR_BACK_SCALE - 1e-9);
        expect(o.scale).toBeLessThanOrEqual(1 + 1e-9);
        expect(o.scale > (1 + STAR_BACK_SCALE) / 2).toBe(o.y > 0); // the front of the orbit is lower on screen
      }
    }
  });

  it('go round once a second, about a third apart, from a start that the start tick picks', () => {
    const a = starOffsets(0, 1234, false);
    const b = starOffsets(0.25, 1234, false);
    for (const id of STAR_PARTS) expect(turn(angle(b[id]!) - angle(a[id]!))).toBeCloseTo(0.25, 9);
    const gaps = [0, 1, 2].map((i) => turn(angle(a[STAR_PARTS[(i + 1) % 3]!]!) - angle(a[STAR_PARTS[i]!]!)));
    for (const g of gaps.slice(0, 2)) expect(Math.abs(g - 1 / 3)).toBeLessThan(0.09);
    expect(starOffsets(0, 1235, false)).not.toEqual(a);
    expect(starOffsets(0, 1234, false)).toEqual(a); // the same frame every time: no Math.random, no clock
  });

  it('hold still at their start under reduced motion', () => {
    expect(starOffsets(0.7, 1234, true)).toEqual(starOffsets(0, 1234, false));
  });

  it('show for dizzy and Oops only, and only while the act lets the effect play', () => {
    expect(Object.keys(particleOffsets({ kind: 'dizzy', t: 0.3, groups: ['effect'], since: 9 }, false))).toEqual([...STAR_PARTS]);
    expect(Object.keys(particleOffsets({ kind: 'oops', t: 0.3, groups: ['face', 'effect'] }, false))).toEqual([...STAR_PARTS]);
    expect(particleOffsets({ kind: 'oops', t: 0.3, groups: ['face'] }, false)).toEqual({});
    expect(particleOffsets({ kind: 'eureka', t: 0.3, groups: ['effect'] }, false)).toEqual({});
    expect(particleOffsets(null, false)).toEqual({});
    expect(clipParticles('dizzy', 0.3, false)).toEqual(starOffsets(0.3, 0, false));
    expect(clipParticles('walk', 0.3, false)).toEqual({});
  });
});
