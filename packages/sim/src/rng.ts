/**
 * Seeded pseudo-random numbers (mulberry32). The only source of randomness in the sim.
 * The state is a plain object so it is part of the sim state and can be snapshotted,
 * compared and sent over the network.
 */
export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** Uniform float in [0, 1). Advances the state. */
export function rngNext(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform float in [min, max). */
export function rngRange(rng: RngState, min: number, max: number): number {
  return min + (max - min) * rngNext(rng);
}

/** Uniform integer in [min, max] (inclusive). */
export function rngInt(rng: RngState, min: number, max: number): number {
  return min + Math.floor(rngNext(rng) * (max - min + 1));
}
