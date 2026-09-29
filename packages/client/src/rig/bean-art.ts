import type Phaser from 'phaser';
import { addTextures, rasterizeParts, type PartTexture } from '../art/raster';
import { BEAN_SVGS } from './bean-art-sources';
import { buildBeanArtSpec, type BeanArtSpec } from './bean-contract';
import { SHADOW_PART } from './views';

export interface BeanArt {
  spec: BeanArtSpec;
  /** By texture key `bean:<source>:<part id>`. */
  textures: Map<string, PartTexture>;
}

export const textureKey = (source: string, partId: string) => `bean:${source}:${partId}`;
/** The ground shadow drawn under every bean (the front view's shadow part). */
export const SHADOW_TEXTURE = textureKey('front', SHADOW_PART);

let loaded: BeanArt | null = null;

/**
 * Check the bean art against the contract and rasterize every part once. Called before the
 * game starts; scenes then add the canvases as textures with `addBeanTextures`.
 */
export async function loadBeanArt(): Promise<BeanArt> {
  if (loaded) return loaded;
  const spec = buildBeanArtSpec(BEAN_SVGS);
  loaded = { spec, textures: await rasterizeParts(spec.docs, textureKey) };
  return loaded;
}

/** The loaded bean art; `loadBeanArt` must have finished. */
export function beanArt(): BeanArt {
  if (!loaded) throw new Error('Bean art is not loaded yet (loadBeanArt runs before the game starts).');
  return loaded;
}

/** Add every part as a Phaser texture (once per game). */
export function addBeanTextures(textures: Phaser.Textures.TextureManager): void {
  addTextures(textures, beanArt().textures.values());
}
