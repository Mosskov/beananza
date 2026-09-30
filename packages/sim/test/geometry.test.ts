import { describe, expect, it } from 'vitest';
import { closestPointInConvex, containsPoint, hexagon, insetConvex, polygonBounds, polygonFromRect, type Rect } from '../src';

const rect: Rect = { minX: -5.8, maxX: 5.8, minY: -3, maxY: 2 };
const r = 0.25;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

describe('convex polygons on the ground', () => {
  it('builds a flat-top hexagon: corners east and west, flat edges north and south', () => {
    const hex = hexagon(12);
    expect(hex.points).toHaveLength(6);
    expect(hex.points[0]).toEqual({ x: 12, y: 0 });
    expect(hex.points[3]).toEqual({ x: -12, y: 0 });
    const b = polygonBounds(hex);
    expect(b.minX).toBe(-12);
    expect(b.maxX).toBe(12);
    expect(b.maxY).toBeCloseTo(6 * Math.sqrt(3), 12);
    expect(b.minY).toBeCloseTo(-6 * Math.sqrt(3), 12);
    // The north edge is flat.
    expect(hex.points[1]!.y).toBe(hex.points[2]!.y);
  });

  it('insets a rectangle to exactly the per-axis inset', () => {
    const inset = polygonBounds(insetConvex(polygonFromRect(rect), r));
    expect(inset).toEqual({ minX: rect.minX + r, maxX: rect.maxX - r, minY: rect.minY + r, maxY: rect.maxY - r });
  });

  it('on a rectangle, the closest point is bit-identical to clamping each axis', () => {
    const inset = insetConvex(polygonFromRect(rect), r);
    const points = [
      { x: 50, y: -50 },
      { x: -50, y: 0.3 },
      { x: 1.234, y: 9 },
      { x: 5.6, y: -2.8 },
      { x: 0, y: 0 },
      { x: -5.55, y: 1.75 },
    ];
    for (const p of points) {
      expect(closestPointInConvex(inset, p)).toEqual({ x: clamp(p.x, rect.minX + r, rect.maxX - r), y: clamp(p.y, rect.minY + r, rect.maxY - r) });
    }
  });

  it('insets a hexagon by the same distance on every edge', () => {
    const hex = hexagon(12);
    const inset = insetConvex(hex, 1);
    // A regular hexagon's inradius is R·√3/2; the inset one's is 1 m less.
    const inradius = (p: { x: number; y: number }[]) => Math.min(...p.map((a, i) => {
      const b = p[(i + 1) % p.length]!;
      return Math.abs(a.x * b.y - a.y * b.x) / Math.hypot(b.x - a.x, b.y - a.y);
    }));
    expect(inradius(inset.points)).toBeCloseTo(inradius(hex.points) - 1, 12);
  });

  it('keeps inside points and moves outside points to the nearest edge or corner of a hexagon', () => {
    const hex = hexagon(12);
    expect(closestPointInConvex(hex, { x: 3, y: -4 })).toEqual({ x: 3, y: -4 });
    // Far north: onto the flat north edge.
    const north = closestPointInConvex(hex, { x: 1, y: 40 });
    expect(north.x).toBe(1);
    expect(north.y).toBeCloseTo(6 * Math.sqrt(3), 12);
    // Far east: onto the east corner.
    expect(closestPointInConvex(hex, { x: 40, y: 0 })).toEqual({ x: 12, y: 0 });
    // Off the north-east edge, square to it: onto that edge, and inside within rounding.
    // 10 m straight out from the middle of the north-east edge lands back on that middle.
    const mid = { x: 9, y: 3 * Math.sqrt(3) };
    const ne = closestPointInConvex(hex, { x: mid.x + 10 * (Math.sqrt(3) / 2), y: mid.y + 10 * 0.5 });
    expect(ne.x).toBeCloseTo(mid.x, 9);
    expect(ne.y).toBeCloseTo(mid.y, 9);
    expect(containsPoint(hex, ne, 1e-9)).toBe(true);
    expect(containsPoint(hex, { x: ne.x * 1.001, y: ne.y * 1.001 })).toBe(false);
  });
});
