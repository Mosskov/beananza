import type { ReactionGroup, ReactionKind } from '@beananza/sim';
import type { ReactionLayer } from './player';

/**
 * What a reaction shows and hides while it runs (D26), by the group of the compatibility table
 * each change belongs to: the face swaps the eyes and mouth (and hides dozing's closed eyes); the
 * effect shows its drawing from `art/effects/` (and hides the doze "z", which shares the head
 * slot). A group the act does not allow changes nothing. Wave hi and dizzy have none yet.
 * Every part named here has a default in the hub's `PART_DEFAULTS`, so it is reset when the
 * reaction ends.
 */
export const REACTION_PARTS: { readonly [K in ReactionKind]: Partial<Record<ReactionGroup, Readonly<Record<string, boolean>>>> } = {
  eureka: {
    face: { eyes: false, 'eyes-sleep': false, mouth: false, 'eyes-happy': true, 'mouth-open': true },
    effect: { 'doze-z': false, 'eureka-bulb': true },
  },
  oops: {
    face: { eyes: false, 'eyes-sleep': false, mouth: false, 'eyes-squeeze': true, 'mouth-wavy': true },
    effect: { 'doze-z': false, 'sweat-drop': true },
  },
  waveHi: {},
  dizzy: {},
};

/** The parts a running reaction shows or hides, for the groups it may play; none without one. */
export function reactionParts(layer: ReactionLayer | null): Record<string, boolean> {
  if (!layer) return {};
  const parts: Record<string, boolean> = {};
  for (const group of layer.groups) Object.assign(parts, REACTION_PARTS[layer.kind][group]);
  return parts;
}
