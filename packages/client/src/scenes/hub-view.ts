import { PIXELS_PER_METER } from '@beananza/shared';
import type { Rect } from '@beananza/sim';

/**
 * Distance between the two rails (m), drawn at ±half of it from the rail's centre line. A cart's
 * drawing stands on the near (south) rail, where its visible wheels run.
 */
export const RAIL_GAUGE_M = 0.2;

/**
 * The hub's ¾ top-down projection (D1, D15). The sim has a ground plane (x east, y north)
 * plus a height z; the client draws north as up the screen and height as up the screen too.
 * v0 has no foreshortening: 1 m north moves 100 px up, the same as the prototype.
 */
export function toScreen(x: number, y: number, z = 0): { x: number; y: number } {
  return { x: x * PIXELS_PER_METER, y: -(y + z) * PIXELS_PER_METER };
}

/**
 * Where a character's feet draw: its height z shrinks with the same depth scale as its body
 * (D18), so a jump is always the same share of the character's drawn height.
 */
export function characterScreen(x: number, y: number, z: number, scale: number): { x: number; y: number } {
  return toScreen(x, y, z * scale);
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

/**
 * How far (m, signed along x) to draw a character away from the carts on its rail so its body
 * does not overlap a cart's end. The sim keeps the narrower footprint; this moves the drawing
 * only. `reachWest`/`reachEast` are how far the drawn body reaches each way (m, already scaled).
 */
export function cartStandOff(x: number, cartXs: readonly number[], cartHalfLength: number, reachWest: number, reachEast: number): number {
  let best = 0;
  for (const cx of cartXs) {
    const west = x < cx; // the character is west of this cart
    const needed = cartHalfLength + (west ? reachEast : reachWest);
    const have = Math.abs(x - cx);
    if (have < needed && needed - have > Math.abs(best)) best = (west ? -1 : 1) * (needed - have);
  }
  return best;
}
