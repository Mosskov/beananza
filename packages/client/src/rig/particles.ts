import type { ReactionKind } from '@beananza/sim';
import { effectSeed, seedUnit } from './effect-seed';
import type { ReactionLayer } from './player';

/**
 * Effect particles that each move on their own (D26): an offset per effect part, added to its
 * slot's transform by the rig (`BeanRig.applyPose`). Pure functions of the reaction's time and
 * start tick, so a paused or scripted shot always draws the same frame, on every client.
 */
export interface ParticleOffset {
  x: number;
  y: number;
  scale: number;
}

/** The stars' orbit over the head (showcase `orbit`: 24 by 7 units, once a second). */
export const STAR_ORBIT = { rx: 24, ry: 7, period: 1 } as const;
/** The parts of `art/effects/dizzy-stars.svg`, evenly spaced round the orbit. */
export const STAR_PARTS = ['dizzy-star-1', 'dizzy-star-2', 'dizzy-star-3'] as const;
/** A star at the back of the orbit draws this much smaller, so the ring reads as going round the head. */
export const STAR_BACK_SCALE = 0.75;
/** How far (a share of the orbit) each star may sit off even spacing, from its seed. */
const STAR_JITTER = 0.08;

/** The reactions that show the stars (dizzy; Oops as in the prototype, DESIGN.md §6). */
export const STAR_REACTIONS: ReadonlySet<ReactionKind> = new Set(['dizzy', 'oops']);

/**
 * Each star's offset from the orbit's centre at `t` seconds into the reaction. Where the ring
 * starts, and each star's small step off even spacing, come from `effectSeed(since, index)`;
 * under reduced motion the ring holds at its start.
 */
export function starOffsets(t: number, since: number, reducedMotion: boolean): Record<string, ParticleOffset> {
  const start = seedUnit(effectSeed(since, 0));
  const spin = reducedMotion ? 0 : t / STAR_ORBIT.period;
  const out: Record<string, ParticleOffset> = {};
  STAR_PARTS.forEach((id, i) => {
    const jitter = (seedUnit(effectSeed(since, i + 1)) - 0.5) * STAR_JITTER;
    const a = 2 * Math.PI * (start + i / STAR_PARTS.length + jitter + spin);
    // sin(a) = 1 is the front of the orbit (lower on screen), −1 the back.
    out[id] = { x: STAR_ORBIT.rx * Math.cos(a), y: STAR_ORBIT.ry * Math.sin(a), scale: STAR_BACK_SCALE + ((1 - STAR_BACK_SCALE) * (Math.sin(a) + 1)) / 2 };
  });
  return out;
}

/** A reaction clip played alone (the clip sheet, the anim viewer) draws its particles as if it started at tick 0. */
export function clipParticles(clip: string, t: number, reducedMotion: boolean): Record<string, ParticleOffset> {
  return STAR_REACTIONS.has(clip as ReactionKind) ? starOffsets(t, 0, reducedMotion) : {};
}

/** The particle offsets a running reaction draws, by effect part id; none without one or its effect group. */
export function particleOffsets(reaction: ReactionLayer | null | undefined, reducedMotion: boolean): Record<string, ParticleOffset> {
  if (!reaction || !reaction.groups.includes('effect') || !STAR_REACTIONS.has(reaction.kind)) return {};
  return starOffsets(reaction.t, reaction.since ?? 0, reducedMotion);
}
