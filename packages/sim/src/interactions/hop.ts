import { SIM_HZ } from '../time';

/**
 * Timed hops (getting into and out of a cart, onto and off a bench): sim states with a start and
 * end tick, fixed when the hop starts. Everything about a hop is a pure function of the tick,
 * so a paused shot, a replay and (M2) the server all agree. The height is a parabola, the shape
 * of a real hop, using only exactly specified arithmetic (no Math.sin).
 */

/** Whole steps for a duration (s), at least one. */
export function ticksFor(seconds: number): number {
  return Math.max(1, Math.round(seconds * SIM_HZ));
}

/** How far through [startTick, endTick] the state is once the step at `tick` is done: 0..1. */
export function hopProgress(tick: number, startTick: number, endTick: number): number {
  const p = (tick + 1 - startTick) / (endTick - startTick);
  return Math.min(Math.max(p, 0), 1);
}

/** Height (m) at progress p: from `fromZ` to `toZ`, plus an arc that peaks `arc` above the line. */
export function hopHeight(p: number, fromZ: number, toZ: number, arc: number): number {
  return fromZ + (toZ - fromZ) * p + 4 * arc * p * (1 - p);
}

export const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
