import { BeanGalleryScene } from './BeanGalleryScene';
import { DropScene } from './DropScene';
import { EmptyScene } from './EmptyScene';
import { HubScene } from './HubScene';
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
};

/** Plain localhost:5180 opens the hub (D20). */
export const DEFAULT_SCENE = 'hub';

export const SCENE_NAMES: readonly string[] = Object.keys(SCENES);
