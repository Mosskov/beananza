/**
 * Placement of effect particles that vary per start (sparkles, stars; D26). Drawn effects get
 * their spread from this small integer hash of the reaction's start tick and the particle's
 * index, never of the current tick or `Math.random`: the same reaction then draws the same
 * sparkles on every frame, on every client, and in a paused or scripted shot. Pure; nothing uses
 * it yet (the effects that will are the art lane's).
 */

/** An integer in [0, 2³²) from the reaction's start tick (`bean.reaction.since`) and the particle index. */
export function effectSeed(since: number, index: number): number {
  let h = Math.imul(since | 0, 0x9e3779b1) ^ Math.imul((index | 0) + 0x7f4a7c15, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** The same seed as a number in [0, 1), for picking an angle or an offset. */
export const seedUnit = (seed: number): number => seed / 2 ** 32;
