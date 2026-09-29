import { PIXELS_PER_METER } from '@beananza/shared';
import type { Rect } from '@beananza/sim';

/**
 * The hub's ¾ top-down projection (D1, D15). The sim has a ground plane (x east, y north)
 * plus a height z; the client draws north as up the screen and height as up the screen too.
 * v0 has no foreshortening: 1 m north moves 100 px up, the same as the prototype.
 */
export function toScreen(x: number, y: number, z = 0): { x: number; y: number } {
  return { x: x * PIXELS_PER_METER, y: -(y + z) * PIXELS_PER_METER };
}

/** Inverse of `toScreen` for a point on the ground (z = 0), e.g. a tap. */
export function groundFromScreen(sx: number, sy: number): { x: number; y: number } {
  return { x: sx / PIXELS_PER_METER, y: -sy / PIXELS_PER_METER };
}

/**
 * Character scale by depth (DESIGN.md §4): 0.62 + 0.30·clamp((y − y_top) / depth_range, 0, 1)
 * in screen terms, where y_top is the north edge of the walkable area and depth_range its
 * north-south size. The formula spans 0.62 (north edge) to 0.92 (south edge); a bean, whose centre
 * stays one footprint radius inside the edges, reaches about 0.635 to 0.905.
 */
export function depthScale(groundY: number, walkable: Rect): number {
  const t = (walkable.maxY - groundY) / (walkable.maxY - walkable.minY);
  return 0.62 + 0.3 * Math.min(Math.max(t, 0), 1);
}

/**
 * Draw order: things further south (nearer the camera) draw later. Uses the ground position
 * only, so a jumping bean keeps its place in the order.
 */
export function depthKey(groundY: number): number {
  return -groundY * PIXELS_PER_METER;
}
