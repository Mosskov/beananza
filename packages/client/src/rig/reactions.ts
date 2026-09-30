import { SIM_HZ, allowedGroups, type HubState } from '@beananza/sim';
import type { ReactionLayer } from './player';

/**
 * The reaction layer to draw for the bean, from sim state alone (D26), or null when none runs:
 * `bean.reaction`, how long ago it started, and the groups the compatibility table lets play in
 * the bean's current act (`body` only while it stands still). `time` is the animation time in
 * sim seconds, as for `chooseClip`. Derived reactions (Thinking, effort, dust) will join here
 * when their art exists; the sim holds no state for them.
 */
export function chooseReaction(state: Pick<HubState, 'bean'>, time: number): ReactionLayer | null {
  const { bean } = state;
  const reaction = bean.reaction;
  if (!reaction) return null;
  return { kind: reaction.kind, t: Math.max(0, time - reaction.since / SIM_HZ), groups: allowedGroups(bean, reaction.kind) };
}
