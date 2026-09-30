import { BLINK, CLIPS, LAND_DURATION, familyOf, type Channel, type Clip, type ClipName, type Track } from './clips';
import type { ReactionGroup, ReactionKind } from '@beananza/sim';
import { SLOTS, type BeanView, type Slot } from './views';

/**
 * The rig player: samples clips into a pose. Pure functions of (clip, view, time), so a paused
 * or scripted shot at a given sim time always draws the same pose.
 */

export interface SlotTransform {
  x: number;
  y: number;
  /** Degrees, clockwise on screen (as drawn facing right). */
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export type Pose = Record<Slot, SlotTransform>;

const NEUTRAL: SlotTransform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

export function neutralPose(): Pose {
  return Object.fromEntries(SLOTS.map((s) => [s, { ...NEUTRAL }])) as Pose;
}

const smooth = (u: number) => u * u * (3 - 2 * u);

/** Value of one track at `seconds` into the clip. */
export function sampleTrack(clip: Clip, track: Track, seconds: number): number {
  let phase: number;
  if (clip.loop) {
    const cycle = seconds / (track.period ?? clip.duration) + (track.offset ?? 0);
    phase = cycle - Math.floor(cycle);
  } else {
    phase = Math.min(Math.max(seconds / clip.duration, 0), 1);
  }
  const k = track.keys;
  let i = 0;
  while (i < k.length - 2 && phase > (k[i + 1] as { at: number }).at) i += 1;
  const a = k[i];
  const b = k[i + 1] ?? a;
  if (!a || !b) return channelNeutral(track.channel);
  if (b.at === a.at) return b.v;
  const u = Math.min(Math.max((phase - a.at) / (b.at - a.at), 0), 1);
  const e = track.ease === 'linear' ? u : smooth(u);
  return a.v + (b.v - a.v) * e;
}

function channelNeutral(channel: Channel): number {
  return channel === 'scaleX' || channel === 'scaleY' ? 1 : 0;
}

/** The other arm: in a mirrored view the slot that is on the screen-right arm is `armA`. */
const OTHER_ARM: Partial<Record<Slot, Slot>> = { armA: 'armB', armB: 'armA' };

/**
 * Apply a clip's tracks. `mirroredArms` moves an `arms` track (the reactions') to the other arm
 * and flips its rotation, so that "the screen-right arm" stays the screen-right arm, raised the
 * same way, when the view is drawn mirrored.
 */
function applyClip(
  pose: Pose,
  clip: Clip,
  seconds: number,
  reducedMotion: boolean,
  groups: readonly ReactionGroup[] | null = null,
  mirroredArms = false,
): void {
  for (const track of clip.tracks) {
    // A reaction layer plays only the groups the act allows (D26); an act clip has no groups.
    if (groups && !(track.group && groups.includes(track.group))) continue;
    const flip = mirroredArms && track.group === 'arms' && track.channel === 'rotation' && OTHER_ARM[track.slot] !== undefined;
    const slot = flip ? (OTHER_ARM[track.slot] as Slot) : track.slot;
    const sign = flip ? -1 : 1;
    if (reducedMotion && track.motion) {
      if (track.still !== undefined) pose[slot][track.channel] = sign * track.still;
      continue;
    }
    pose[slot][track.channel] = sign * sampleTrack(clip, track, seconds);
  }
}

export interface PoseRequest {
  clip: ClipName;
  /** Seconds into the clip (looping clips: any time; they wrap). */
  t: number;
  /** Absolute animation time (s) for overlays such as blinking. */
  time: number;
  view: BeanView;
  /**
   * The view is drawn mirrored (`viewForFacing`). In the mirrored `front-34` view the screen-right
   * arm is the near arm, so a reaction's arm tracks move to it (see `samplePose`).
   */
  mirrored?: boolean;
  /** prefers-reduced-motion: no bob, squash, stretch, breathing or waddle; poses still change. */
  reducedMotion: boolean;
  /** A reaction laid over the act's clip (`chooseReaction`); its tracks replace only the channels they name. */
  reaction?: ReactionLayer | null;
}

/** A running reaction at `t` seconds into it, and the groups of its tracks that may play (D26). */
export interface ReactionLayer {
  kind: ReactionKind;
  t: number;
  groups: readonly ReactionGroup[];
  /** The sim tick it started at (`bean.reaction.since`): what places its particles (`particles.ts`). 0 when left out. */
  since?: number;
}

/**
 * The act's clip, the blink, then the reaction clip on top (D26): its tracks replace only the
 * channels they name, and only for the groups the act allows. Under reduced motion the `motion`
 * and `still` rules apply to reaction tracks like any other.
 */
export function samplePose(req: PoseRequest): Pose {
  const pose = neutralPose();
  const family = familyOf(req.view);
  // Only `front-34` has a near arm on the screen-right when mirrored that swings outward with the
  // flipped rotation; in `back-34` the same move swings the arm across the back (looked at on the
  // `waveHi` clip sheet), so that view keeps the far arm's faint wave (an art-lane limit).
  const mirroredArms = req.mirrored === true && req.view === 'front-34';
  applyClip(pose, CLIPS[req.clip][family], req.t, req.reducedMotion, null, mirroredArms);
  applyClip(pose, BLINK, req.time, req.reducedMotion);
  if (req.reaction) applyClip(pose, CLIPS[req.reaction.kind][family], req.reaction.t, req.reducedMotion, req.reaction.groups, mirroredArms);
  return pose;
}

/** What the rig needs from the sim's bean (a subset of HubBean). */
export interface BeanMotion {
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  lastJump: { startedAt: number; landedAt: number | null } | null;
}

/**
 * A clip an interaction asks for (from the hub's presentation table), at `t` seconds into it.
 * `first` puts it before the air and landing clips (hops); otherwise those come first.
 */
export interface ActClip {
  clip: ClipName;
  t: number;
  first?: boolean;
}

/** Ground speed above this counts as moving (m/s). */
export const MOVING_SPEED = 0.05;
/** Ground speed above this plays the run clip: halfway between walk (2.4) and run (4.2) m/s. */
export const RUN_CLIP_SPEED = 3.3;

/**
 * Pick the clip from sim state alone (the sim does not know about animation):
 * - in the air: `jump` while rising (t since take-off), `fall` after the apex (t since the apex,
 *   −vz/g, exact under constant gravity);
 * - just landed: `land` for LAND_DURATION after the exact touchdown time;
 * - an interaction's own clip (`actClip`, from the hub's presentation table: pushing, riding;
 *   a hop's clip comes before everything else);
 * - on the ground: `run`, `walk` or `idle` by ground speed; looping clips run on `time`.
 * `time` is the animation time in sim seconds.
 */
export function chooseClip(bean: BeanMotion, time: number, gravity: number, actClip: ActClip | null = null): { clip: ClipName; t: number } {
  if (actClip?.first) return { clip: actClip.clip, t: actClip.t };
  if (!bean.grounded) {
    if (bean.vz >= 0 || gravity <= 0) return { clip: 'jump', t: Math.max(0, time - (bean.lastJump?.startedAt ?? time)) };
    return { clip: 'fall', t: -bean.vz / gravity };
  }
  // The landing dust (D26, derived, no sim field) will read this same `lastJump.landedAt`, on the
  // fxGround slot, with its placement from effectSeed(landedAt tick, index).
  const landedAt = bean.lastJump?.landedAt;
  if (landedAt != null && time - landedAt < LAND_DURATION) return { clip: 'land', t: Math.max(0, time - landedAt) };
  if (actClip) return { clip: actClip.clip, t: actClip.t };
  const speed = Math.hypot(bean.vx, bean.vy);
  if (speed > RUN_CLIP_SPEED) return { clip: 'run', t: time };
  if (speed > MOVING_SPEED) return { clip: 'walk', t: time };
  return { clip: 'idle', t: time };
}
