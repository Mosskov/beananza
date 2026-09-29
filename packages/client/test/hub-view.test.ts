import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAZA } from '@beananza/sim';
import { depthKey, depthScale, groundFromScreen, toScreen } from '../src/scenes/hub-view';

const walk = DEFAULT_PLAZA.walkable;

describe('hub view projection', () => {
  it('draws north and height as up the screen, 100 px per metre', () => {
    expect(toScreen(1, 0)).toEqual({ x: 100, y: -0 });
    expect(toScreen(0, 1).y).toBe(-100);
    expect(toScreen(0, 1, 0.5).y).toBe(-150);
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
