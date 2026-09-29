import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAZA } from '@beananza/sim';
import { cartStandOff, characterScreen, depthKey, depthScale, groundFromScreen, toScreen } from '../src/scenes/hub-view';

const walk = DEFAULT_PLAZA.walkable;

describe('hub view projection', () => {
  it('draws north and height as up the screen, 100 px per metre', () => {
    expect(toScreen(1, 0)).toEqual({ x: 100, y: -0 });
    expect(toScreen(0, 1).y).toBe(-100);
    expect(toScreen(0, 1, 0.5).y).toBe(-150);
  });

  it("scales a character's drawn height by its depth scale (D18)", () => {
    // The jump apex (0.768 m) stays 0.768 / 1.14 ≈ 0.67 of the bean's drawn height at any depth.
    expect(characterScreen(1, 2, 0.768, 0.62)).toEqual(toScreen(1, 2, 0.768 * 0.62));
    expect(characterScreen(1, 2, 0, 0.62)).toEqual(toScreen(1, 2));
    expect(-characterScreen(0, 0, 0.768, 0.92).y / (114 * 0.92)).toBeCloseTo(0.768 / 1.14, 12);
  });

  it('draws a character back from a cart end its body would overlap, only as far as needed', () => {
    // Cart at x = 0 (half-length 0.4); body reaches 0.44 m each way.
    expect(cartStandOff(-0.65, [0], 0.4, 0.44, 0.44)).toBeCloseTo(-0.19, 12);
    expect(cartStandOff(0.65, [0], 0.4, 0.44, 0.44)).toBeCloseTo(0.19, 12);
    expect(cartStandOff(-1, [0], 0.4, 0.44, 0.44)).toBe(0);
    // The nearest overlapping cart wins; reach towards that cart is what counts.
    expect(cartStandOff(1.3, [0, 2], 0.4, 0.1, 0.44)).toBeCloseTo(-(0.84 - 0.7), 12);
  });

  it('maps a ground point back from the screen', () => {
    const s = toScreen(2.2, -1.3);
    const g = groundFromScreen(s.x, s.y);
    expect(g.x).toBeCloseTo(2.2, 12);
    expect(g.y).toBeCloseTo(-1.3, 12);
  });

  it('scales characters 0.62 at the north edge to 0.92 at the south edge, clamped', () => {
    expect(depthScale(walk.maxY, walk)).toBeCloseTo(0.62, 12);
    expect(depthScale(walk.minY, walk)).toBeCloseTo(0.92, 12);
    expect(depthScale((walk.minY + walk.maxY) / 2, walk)).toBeCloseTo(0.77, 12);
    expect(depthScale(walk.maxY + 5, walk)).toBeCloseTo(0.62, 12);
    expect(depthScale(walk.minY - 5, walk)).toBeCloseTo(0.92, 12);
  });

  it('sorts things further south in front', () => {
    expect(depthKey(-1)).toBeGreaterThan(depthKey(0));
    expect(depthKey(0.65)).toBeLessThan(depthKey(0.2));
  });
});
