import type { ClipName } from './clips';
import { REACTION_PARTS } from './reaction-parts';

/** A reaction clip played alone shows its face and effect (every group). */
const allGroups = (kind: keyof typeof REACTION_PARTS): Record<string, boolean> => Object.assign({}, ...Object.values(REACTION_PARTS[kind]));

/**
 * Parts a clip needs shown, as the hub's presentation rows show them for the act that plays it
 * (`scenes/presentation/`): the pushing arm, and dozing's closed eyes and "z"; and a reaction
 * clip's face and effect (`REACTION_PARTS`). The tool scenes that play a clip without the hub
 * (the clip sheet, the anim viewer) read this.
 */
export const CLIP_PARTS: Partial<Record<ClipName, Record<string, boolean>>> = {
  push: { 'arm-far-push': true },
  pushHeavy: { 'arm-far-push': true },
  doze: { eyes: false, 'eyes-sleep': true, 'doze-z': true },
  eureka: allGroups('eureka'),
  oops: allGroups('oops'),
};
