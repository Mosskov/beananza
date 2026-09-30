import type Phaser from 'phaser';
// Effects are drawn once, as SVG files in art/effects/ (D26), and loaded by part id like the props.
// The contract is in effect-contract.ts (pure), the files in effect-sources.ts. The bean rig
// places each effect at its slot's anchor (BeanRig.ts); an effect is shown by its part id
// (`rig.setPartVisible('doze-z', true)`), hidden until then.
import { buildEffectArtSpec, effectKey, EFFECTS, type EffectArtSpec } from './effect-contract';
import { EFFECT_SVGS } from './effect-sources';
import { addTextures, partImage, rasterizeParts, type PartTexture } from './raster';

export { EFFECTS, buildEffectArtSpec, effectKey, type EffectArtSpec } from './effect-contract';
export { EFFECT_SVGS } from './effect-sources';

interface EffectArt {
  spec: EffectArtSpec;
  textures: Map<string, PartTexture>;
}

let loaded: EffectArt | null = null;

/** Check and rasterize the effect art once, before the game starts. */
export async function loadEffectArt(): Promise<void> {
  if (loaded) return;
  const spec = buildEffectArtSpec(EFFECT_SVGS);
  loaded = { spec, textures: await rasterizeParts(spec.docs, effectKey) };
}

function art(): EffectArt {
  if (!loaded) throw new Error('Effect art is not loaded yet (loadEffectArt runs before the game starts).');
  return loaded;
}

/** One drawn part of an effect, with the slot its effect is placed on. */
export interface EffectPart {
  effect: string;
  partId: string;
  slot: (typeof EFFECTS)[string]['slot'];
  texture: PartTexture;
  /** Rotates and scales about this point in the effect's frame (the anchor unless `data-pivot`). */
  pivot: { x: number; y: number };
}

/** Every part of every effect, in file order. */
export function effectParts(): EffectPart[] {
  const { spec, textures } = art();
  return Object.entries(spec.docs).flatMap(([effect, doc]) =>
    doc.parts.map((part) => {
      const key = effectKey(effect, part.id);
      const texture = textures.get(key);
      const pivot = spec.pivots.get(key);
      if (!texture || !pivot) throw new Error(`No effect part ${key}.`);
      return { effect, partId: part.id, slot: (EFFECTS[effect] as (typeof EFFECTS)[string]).slot, texture, pivot };
    }),
  );
}

/** An effect part as an image whose origin is the part's pivot (position it at the anchor). */
export function effectImage(scene: Phaser.Scene, part: EffectPart): Phaser.GameObjects.Image {
  addTextures(scene.textures, [part.texture]);
  return partImage(scene, part.texture, part.pivot);
}
