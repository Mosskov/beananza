import { ticksFor } from './interactions/hop';
import type { HubActKind, HubBean, HubState } from './scenarios/hub-world';

/**
 * Reactions (D26): a short state beside the act (`bean.reaction`) that the sim keeps only when it
 * cannot be derived, or when another player must see it start. Acts never read it (D21), it never
 * blocks input, and it never changes the act, the position or the velocity. It holds a kind and
 * the tick it started; how long it runs comes from `REACTION_TICKS`, and the sim clears it.
 *
 * The sim knows nothing of how a reaction is drawn: no clip, slot, part or art id. The client
 * reads `bean.reaction` and the rules below and picks what to play (`docs/DECISIONS.md`, D26).
 */

export type ReactionKind = 'eureka' | 'oops' | 'waveHi' | 'dizzy';

/** The reactions a player can ask for with the `emote` command. */
export type EmoteKind = Extract<ReactionKind, 'waveHi'>;

/** A running reaction: its kind and the tick it started (an integer; the end comes from its kind). */
export interface HubReaction {
  kind: ReactionKind;
  since: number;
}

// Prototype timings (reference/showcase.html, "Reactions"), in seconds.
export const EUREKA_S = 1.8;
export const OOPS_S = 1.5;
export const WAVE_HI_S = 1.8;
export const DIZZY_S = 1.6;

/** How long each reaction runs, in whole ticks. */
export const REACTION_TICKS: Readonly<Record<ReactionKind, number>> = {
  eureka: ticksFor(EUREKA_S),
  oops: ticksFor(OOPS_S),
  waveHi: ticksFor(WAVE_HI_S),
  dizzy: ticksFor(DIZZY_S),
};

/** The tick at which a reaction is over: the state at that tick no longer has it. */
export function reactionEnd(reaction: HubReaction): number {
  return reaction.since + REACTION_TICKS[reaction.kind];
}

/**
 * Start a reaction at the current tick. Everything goes through here (the `emote` command, and
 * later the prediction and catapult code). A new reaction replaces a running one, except that
 * `waveHi` is dropped while `eureka` or `oops` runs. Returns whether it started.
 */
export function startReaction(state: HubState, kind: ReactionKind): boolean {
  const running = state.bean.reaction;
  if (kind === 'waveHi' && running && (running.kind === 'eureka' || running.kind === 'oops')) return false;
  state.bean.reaction = { kind, since: state.tick };
  return true;
}

/**
 * The hub calls this at one fixed point of every step, after the interaction modules: the
 * reaction ends in the step that brings the tick to its end.
 */
export function clearFinishedReaction(state: HubState): void {
  const reaction = state.bean.reaction;
  if (reaction && state.tick + 1 >= reactionEnd(reaction)) state.bean.reaction = null;
}

/**
 * What a reaction's tracks may touch. The client plays a reaction clip layer by layer; a layer
 * that is not allowed is skipped, the rest plays (D26).
 */
export type ReactionGroup = 'face' | 'effect' | 'arms' | 'body';

/** What one act kind allows: whether `emote` is accepted, and the groups per reaction kind. */
export interface ActReactionRules {
  /** `emote` is accepted; ignored in the hop acts (D23). */
  readonly emote: boolean;
  readonly groups: { readonly [R in ReactionKind]: readonly ReactionGroup[] };
}

/** Face and effect play in every act; arms and body are narrower (below). */
const SAFE: readonly ReactionGroup[] = ['face', 'effect'];
/** Jump, shake and squash: only `free`, and the client also needs the bean standing still. */
const BODY: readonly ReactionGroup[] = ['face', 'effect', 'body'];
/** The arm wave: where the arm is not busy (not while pushing, not in a hop). */
const WAVE: readonly ReactionGroup[] = ['face', 'effect', 'arms'];

const held = (emote: boolean): ActReactionRules => ({
  emote,
  groups: { eureka: SAFE, oops: SAFE, waveHi: SAFE, dizzy: SAFE },
});

const walking = (): ActReactionRules => ({
  emote: true,
  groups: { eureka: SAFE, oops: SAFE, waveHi: WAVE, dizzy: SAFE },
});

/**
 * The compatibility table (D26), a row for every act kind: a new act kind without one does not
 * compile. The sim uses `emote` only to reject an emote mid-hop; the client reads `groups`.
 */
export const REACTION_RULES: { readonly [K in HubActKind]: ActReactionRules } = {
  free: { emote: true, groups: { eureka: BODY, oops: BODY, waveHi: WAVE, dizzy: BODY } },
  approaching: walking(),
  sitting: walking(),
  riding: walking(),
  pushing: held(true),
  boarding: held(false),
  seating: held(false),
  standing: held(false),
  leaving: held(false),
};

/** Below this ground speed (m/s) the bean counts as standing still (it may rest against a wall). */
export const STILL_SPEED_M_S = 0.01;

/**
 * Is the bean standing still on the ground in `free`? The `body` group plays only then. A pure
 * function of the bean that the client calls too; nothing stores it.
 */
export function standsStill(bean: HubBean): boolean {
  return bean.act.kind === 'free' && bean.grounded && bean.vx * bean.vx + bean.vy * bean.vy < STILL_SPEED_M_S * STILL_SPEED_M_S;
}

/**
 * The groups of a running reaction that may play now, given the bean's act and movement:
 * the table's row, with `body` dropped unless the bean stands still.
 */
export function allowedGroups(bean: HubBean, kind: ReactionKind): readonly ReactionGroup[] {
  const groups = REACTION_RULES[bean.act.kind].groups[kind];
  return standsStill(bean) ? groups : groups.filter((g) => g !== 'body');
}
