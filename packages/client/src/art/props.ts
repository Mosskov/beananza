import type Phaser from 'phaser';
// Props that never turn are drawn once, as SVG files in art/props/ (D12), and loaded by part id
// like the bean. The contract is in prop-contract.ts (pure), the files in prop-sources.ts.
import type { Point } from '../rig/svg-parts';
import { buildPropArtSpec, propKey, type PropArtSpec } from './prop-contract';
import { PROP_SVGS } from './prop-sources';
import { addTextures, partImage, rasterizeParts, type PartTexture } from './raster';

export { CART_WHEEL_RADIUS_M, PROP_ANCHORS, PROP_PARTS, buildPropArtSpec, propKey, type PropArtSpec } from './prop-contract';
export { PROP_SVGS } from './prop-sources';

interface PropArt {
  spec: PropArtSpec;
  textures: Map<string, PartTexture>;
}

let loaded: PropArt | null = null;

/** Check and rasterize the prop art once, before the game starts. */
export async function loadPropArt(): Promise<void> {
  if (loaded) return;
  const spec = buildPropArtSpec(PROP_SVGS);
  loaded = { spec, textures: await rasterizeParts(spec.docs, propKey) };
}

/** A prop's anchor (art units, in its frame: origin on the ground under it). */
export function propAnchor(prop: string, name: string): Point {
  if (!loaded) throw new Error('Prop art is not loaded yet (loadPropArt runs before the game starts).');
  const p = loaded.spec.docs[prop]?.anchors[name];
  if (!p) throw new Error(`No anchor ${name} on prop ${prop}.`);
  return p;
}

/**
 * One part of a prop as an image, placed so that the container it goes in has its origin at
 * the prop's origin (the ground point under it) and rotates and scales about the part's pivot.
 */
export function propPart(scene: Phaser.Scene, prop: string, partId: string): Phaser.GameObjects.Image {
  if (!loaded) throw new Error('Prop art is not loaded yet (loadPropArt runs before the game starts).');
  addTextures(scene.textures, loaded.textures.values());
  const key = propKey(prop, partId);
  const tex = loaded.textures.get(key);
  const pivot = loaded.spec.pivots.get(key);
  if (!tex || !pivot) throw new Error(`No prop part ${key}.`);
  return partImage(scene, tex, pivot).setPosition(pivot.x, pivot.y);
}
