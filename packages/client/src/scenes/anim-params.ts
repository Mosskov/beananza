import { REACTION_RULES, REACTION_TICKS, SIM_HZ, type HubActKind, type ReactionGroup, type ReactionKind } from '@beananza/sim';
import { URL_PARAM_PAUSED } from '@beananza/shared';
import { CLIP_NAMES, REACTION_CLIP_NAMES, type ClipName } from '../rig/clips';
import { COMPASS } from '../rig/views';

/**
 * `?scene=anim` reads these, and the scene writes them back as they change, so the address is
 * always a link to what is on screen. `t` is there only while paused: it is the frame shown.
 */
export const ANIM_PARAMS = {
  clip: 'clip',
  dir: 'dir',
  speed: 'speed',
  loop: 'loop',
  t: 't',
  reducedMotion: 'rm',
  reaction: 'reaction',
  ring: 'ring',
} as const;

export const ANIM_SPEEDS = [0.25, 0.5, 1, 2] as const;
export type AnimSpeed = (typeof ANIM_SPEEDS)[number];

/** The 8 directions by compass name, S first (as in the galleries). */
export const DIRECTION_NAMES: readonly string[] = COMPASS.map(([name]) => name);

export interface AnimOptions {
  clip: ClipName;
  /** A compass name (`DIRECTION_NAMES`); the ring shows all 8 instead. */
  dir: string;
  speed: AnimSpeed;
  /** Play again from the start at the end; otherwise stop there. */
  loop: boolean;
  /** Override prefers-reduced-motion; null follows it. */
  reducedMotion: boolean | null;
  /** A reaction laid over an act clip (as the hub plays it); null for none. */
  reaction: ReactionKind | null;
  /** All 8 directions in a ring, on one clock. */
  ring: boolean;
}

export const DEFAULT_ANIM: Readonly<AnimOptions> = { clip: 'idle', dir: 'S', speed: 1, loop: true, reducedMotion: null, reaction: null, ring: false };

/** A one-shot clip or a reaction holds its last pose this long before it plays again. */
export const HOLD_S = 0.5;

export const isReactionClip = (clip: ClipName): clip is ReactionKind => (REACTION_CLIP_NAMES as readonly string[]).includes(clip);

function pick<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  const found = allowed.find((a) => a === value);
  if (found === undefined) throw new Error(`Unknown ${name} "${value}". Allowed: ${allowed.join(', ')}.`);
  return found;
}

function flag(name: string, value: string | null): boolean | null {
  if (value === null) return null;
  if (value === '1' || value === '0') return value === '1';
  throw new Error(`?${name}= takes 1 or 0, not "${value}".`);
}

/**
 * The options and start state from the address. Unknown values throw with the allowed ones: a
 * typo must not quietly show something else. `t` (or `?paused=1`, at 0) starts paused.
 */
export function parseAnimParams(params: URLSearchParams): { options: AnimOptions; paused: boolean; t: number } {
  const get = (key: string) => params.get(key);
  const options: AnimOptions = { ...DEFAULT_ANIM };
  const clip = get(ANIM_PARAMS.clip);
  if (clip !== null) options.clip = pick('clip', clip, CLIP_NAMES);
  const dir = get(ANIM_PARAMS.dir);
  if (dir !== null) options.dir = pick('direction', dir.toUpperCase(), DIRECTION_NAMES);
  const speed = get(ANIM_PARAMS.speed);
  if (speed !== null) {
    const found = ANIM_SPEEDS.find((s) => s === Number(speed));
    if (found === undefined) throw new Error(`Unknown speed "${speed}". Allowed: ${ANIM_SPEEDS.join(', ')}.`);
    options.speed = found;
  }
  options.loop = flag(ANIM_PARAMS.loop, get(ANIM_PARAMS.loop)) ?? true;
  options.reducedMotion = flag(ANIM_PARAMS.reducedMotion, get(ANIM_PARAMS.reducedMotion));
  const reaction = get(ANIM_PARAMS.reaction);
  if (reaction !== null) options.reaction = pick('reaction', reaction, REACTION_CLIP_NAMES);
  options.ring = flag(ANIM_PARAMS.ring, get(ANIM_PARAMS.ring)) ?? false;

  const tText = get(ANIM_PARAMS.t);
  const t = tText === null ? 0 : Number(tText);
  if (!Number.isFinite(t) || t < 0) throw new Error(`?t= takes seconds (0 or more), not "${tText}".`);
  return { options, paused: tText !== null || get(URL_PARAM_PAUSED) === '1', t };
}

/**
 * The query string for the viewer's state: `current` without its anim options and `paused`,
 * plus the options that differ from the defaults, and `t` when paused (`pausedAt`, else null).
 */
export function animQuery(current: URLSearchParams, options: AnimOptions, pausedAt: number | null): string {
  const next = new URLSearchParams(current);
  for (const key of [...Object.values(ANIM_PARAMS), URL_PARAM_PAUSED]) next.delete(key);
  if (options.clip !== DEFAULT_ANIM.clip) next.set(ANIM_PARAMS.clip, options.clip);
  if (options.dir !== DEFAULT_ANIM.dir) next.set(ANIM_PARAMS.dir, options.dir);
  if (options.speed !== DEFAULT_ANIM.speed) next.set(ANIM_PARAMS.speed, String(options.speed));
  if (!options.loop) next.set(ANIM_PARAMS.loop, '0');
  if (options.reducedMotion !== null) next.set(ANIM_PARAMS.reducedMotion, options.reducedMotion ? '1' : '0');
  if (options.reaction) next.set(ANIM_PARAMS.reaction, options.reaction);
  if (options.ring) next.set(ANIM_PARAMS.ring, '1');
  if (pausedAt !== null) next.set(ANIM_PARAMS.t, String(Math.round(pausedAt * 1000) / 1000));
  const query = next.toString().replaceAll('%2C', ',');
  return query ? `?${query}` : '';
}

/**
 * The act each act clip plays in the hub, and whether the bean stands still on the ground in it
 * (`standsStill` in the sim: only then does a reaction's `body` group play). `wave` is Priya's
 * greeting on the bench.
 */
const CLIP_ACTS: Readonly<Record<Exclude<ClipName, ReactionKind>, { act: HubActKind; still: boolean }>> = {
  idle: { act: 'free', still: true },
  walk: { act: 'free', still: false },
  run: { act: 'free', still: false },
  jump: { act: 'free', still: false },
  fall: { act: 'free', still: false },
  land: { act: 'free', still: true },
  push: { act: 'pushing', still: false },
  pushHeavy: { act: 'pushing', still: false },
  sit: { act: 'sitting', still: false },
  doze: { act: 'sitting', still: false },
  wave: { act: 'sitting', still: false },
};

/**
 * The groups of a reaction that play over an act clip, as `allowedGroups` gives them in the hub
 * (D26's compatibility table). Null when the clip is itself a reaction: nothing goes over it.
 */
export function reactionGroups(clip: ClipName, kind: ReactionKind): readonly ReactionGroup[] | null {
  if (isReactionClip(clip)) return null;
  const { act, still } = CLIP_ACTS[clip];
  const groups = REACTION_RULES[act].groups[kind];
  return still ? groups : groups.filter((g) => g !== 'body');
}

/** How long a reaction runs in the hub (s). */
export const reactionSeconds = (kind: ReactionKind): number => REACTION_TICKS[kind] / SIM_HZ;

/**
 * What one pass shows (`span`, s) and how long before it starts again (`cycle`): a reaction's
 * run when one is laid over the clip, else the clip; a looping clip without a reaction wraps
 * straight on, anything else holds its end for HOLD_S.
 */
export function animSpan(clipDuration: number, clipLoops: boolean, reaction: ReactionKind | null): { span: number; cycle: number } {
  if (reaction) {
    const span = reactionSeconds(reaction);
    return { span, cycle: span + HOLD_S };
  }
  return { span: clipDuration, cycle: clipLoops ? clipDuration : clipDuration + HOLD_S };
}
