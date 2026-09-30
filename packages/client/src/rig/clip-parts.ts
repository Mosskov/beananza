import type { ClipName } from './clips';

/**
 * Parts a clip needs shown, as the hub's presentation rows show them for the act that plays it
 * (`scenes/presentation/`): the pushing arm, and dozing's closed eyes and "z". The tool scenes
 * that play a clip without the hub (the clip sheet, the anim viewer) read this.
 */
export const CLIP_PARTS: Partial<Record<ClipName, Record<string, boolean>>> = {
  push: { 'arm-far-push': true },
  pushHeavy: { 'arm-far-push': true },
  doze: { eyes: false, 'eyes-sleep': true, 'doze-z': true },
};
