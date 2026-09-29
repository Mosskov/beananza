import type Phaser from 'phaser';
// Props that never turn are drawn once, as SVG files in art/props/ (D12), and loaded by part id
// like the bean. Vite inlines the text at build time.
import cart from '../../../../art/props/cart.svg?raw';
import tree from '../../../../art/props/tree.svg?raw';
import { parseSvgParts, partPivot, type Point, type SvgDoc } from '../rig/svg-parts';
import { addTextures, partImage, rasterizeParts, type PartTexture } from './raster';

export const PROP_SVGS: Readonly<Record<string, string>> = { tree, cart };

/** Parts each prop must have, in the art contract (`art/README.md`). */
export const PROP_PARTS: Readonly<Record<string, readonly string[]>> = {
  tree: ['shadow', 'trunk', 'canopy'],
  cart: ['shadow', 'back', 'rocks', 'front', 'wheel-west', 'wheel-east'],
};

export interface PropArtSpec {
  docs: Record<string, SvgDoc>;
  /** Pivot of every part, by `prop:part`. */
  pivots: Map<string, Point>;
}

export const propKey = (prop: string, partId: string) => `prop:${prop}:${partId}`;

/** The cart's wheel radius as drawn (9 units): the wheels roll x / r without slipping. */
export const CART_WHEEL_RADIUS_M = 0.09;

/** Parse and check the prop art; throws with every problem found. */
export function buildPropArtSpec(sources: Readonly<Record<string, string>>): PropArtSpec {
  const problems: string[] = [];
  const docs: Record<string, SvgDoc> = {};
  const pivots = new Map<string, Point>();
  for (const [prop, required] of Object.entries(PROP_PARTS)) {
    const text = sources[prop];
    if (text === undefined) {
      problems.push(`${prop}: missing`);
      continue;
    }
    try {
      const doc = parseSvgParts(text);
      docs[prop] = doc;
      const ids = doc.parts.map((p) => p.id);
      for (const id of required) if (!ids.includes(id)) problems.push(`${prop}: missing part "${id}"`);
      for (const part of doc.parts) pivots.set(propKey(prop, part.id), partPivot(part));
    } catch (e) {
      problems.push(`${prop}: ${(e as Error).message}`);
    }
  }
  if (problems.length) throw new Error(`Prop art breaks the art contract:\n- ${problems.join('\n- ')}`);
  return { docs, pivots };
}

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
