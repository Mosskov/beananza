import { COLOUR_IDS, DEFAULT_LOOK, type BeanLook, type ColourId } from '@beananza/shared';
import { BeanGalleryScene } from './BeanGalleryScene';
import { ClipSheetScene } from './ClipSheetScene';
import { PRIYA_COLOUR } from './classmates';
import { DropScene } from './DropScene';
import { EmptyScene } from './EmptyScene';
import { HubScene } from './HubScene';
import { LooksGalleryScene } from './LooksGalleryScene';
import { RegionScene } from './RegionScene';
import type { TestableScene } from './TestableScene';

export type SceneClass = new () => TestableScene;

/**
 * Every scene registers here under the name used in `?scene=<name>`, so each one can be
 * opened and screenshotted on its own (tools/shot). The scene key must equal the name.
 */
export const SCENES: Readonly<Record<string, SceneClass>> = {
  empty: EmptyScene,
  drop: DropScene,
  hub: HubScene,
  bean: BeanGalleryScene,
  looks: LooksGalleryScene,
  clip: ClipSheetScene,
  /** A region's placeholder scene (D2), reached through its portal: `?scene=region&region=<id>`. */
  region: RegionScene,
};

/** Plain localhost:5180 opens the hub (D20). */
export const DEFAULT_SCENE = 'hub';

export const SCENE_NAMES: readonly string[] = Object.keys(SCENES);

/** Scenes that show every bean colour (they are rasterized before the scene starts). */
const ALL_COLOURS: ReadonlySet<string> = new Set(['looks']);

/** The bean colours a scene needs: the player's, the default, Priya's; or all of them. */
export function coloursFor(sceneName: string, look: BeanLook): ColourId[] {
  return ALL_COLOURS.has(sceneName) ? [...COLOUR_IDS] : [...new Set([look.colour, DEFAULT_LOOK.colour, PRIYA_COLOUR])];
}
