import { effectSeed, seedUnit } from './effect-seed';
import type { ReactionLayer } from './player';

/**
 * Parts that each move on their own (D26): an offset per part, added to its slot's transform by
 * the rig (`BeanRig.applyPose`): the dizzy stars (effect parts) and the spinning spiral eyes
 * (face parts, which have no slot). Pure functions of the reaction's time and
 * start tick, so a paused or scripted shot always draws the same frame, on every client.
 */
export interface ParticleOffset {
  x: number;
  y: number;
  scale: number;
  /** Degrees, clockwise on screen, about the part's pivot. 0 when left out. */
  rotation?: number;
}

/** The stars' orbit over the head (showcase `orbit`: 24 by 7 units, once a second). */
export const STAR_ORBIT = { rx: 24, ry: 7, period: 1 } as const;
/** The parts of `art/effects/dizzy-stars.svg`, evenly spaced round the orbit. */
export const STAR_PARTS = ['dizzy-star-1', 'dizzy-star-2', 'dizzy-star-3'] as const;
/** A star at the back of the orbit draws this much smaller, so the ring reads as going round the head. */
export const STAR_BACK_SCALE = 0.75;
/** How far (a share of the orbit) each star may sit off even spacing, from its seed. */
const STAR_JITTER = 0.08;

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

/** Dizzy's spiral eyes (`eye-spiral-a`, `eye-spiral-b` in the bean views): one turn in this many seconds. */
export const SPIRAL_TURN_S = 0.8;

/**
 * The spiral eyes' spin at `t` seconds into dizzy: each eye turns the way it winds (`a`
 * anticlockwise, `b` clockwise), so the pair stays mirrored. Still under reduced motion.
 */
export function spiralSpin(t: number, reducedMotion: boolean): Record<string, ParticleOffset> {
  const deg = reducedMotion ? 0 : ((t / SPIRAL_TURN_S) % 1) * 360;
  return { 'eye-spiral-a': { x: 0, y: 0, scale: 1, rotation: -deg }, 'eye-spiral-b': { x: 0, y: 0, scale: 1, rotation: deg } };
}

/** Everything a reaction moves part by part, for the groups it may play (stars: effect; spiral eyes: face). */
function reactionParticles(kind: string, groups: readonly string[] | null, t: number, since: number, reducedMotion: boolean): Record<string, ParticleOffset> {
  if (kind !== 'dizzy') return {};
  const all = groups === null;
  return {
    ...(all || groups.includes('effect') ? starOffsets(t, since, reducedMotion) : {}),
    ...(all || groups.includes('face') ? spiralSpin(t, reducedMotion) : {}),
  };
}

/** A reaction clip played alone (the clip sheet, the anim viewer) draws its particles as if it started at tick 0. */
export function clipParticles(clip: string, t: number, reducedMotion: boolean): Record<string, ParticleOffset> {
  return reactionParticles(clip, null, t, 0, reducedMotion);
}

/** The offsets a running reaction draws, by part id; none without one, or for groups the act does not allow. */
export function particleOffsets(reaction: ReactionLayer | null | undefined, reducedMotion: boolean): Record<string, ParticleOffset> {
  if (!reaction) return {};
  return reactionParticles(reaction.kind, reaction.groups, reaction.t, reaction.since ?? 0, reducedMotion);
}
