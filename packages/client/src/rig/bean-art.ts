import type Phaser from 'phaser';
import { DEFAULT_LOOK, type ColourId } from '@beananza/shared';
import { addTextures, rasterizeParts, type PartTexture } from '../art/raster';
import { BEAN_SVGS } from './bean-art-sources';
import { buildBeanArtSpec, type BeanArtSpec } from './bean-contract';
import { recolour, usesKeyColours } from './colours';
import { buildCosmeticsSpec, cosmeticDocs, type CosmeticsSpec } from './looks';
import { COSMETIC_SVGS } from './looks-sources';
import type { SvgDoc } from './svg-parts';
import { SHADOW_PART } from './views';

export interface BeanArt {
  spec: BeanArtSpec;
  cosmetics: CosmeticsSpec;
  /** Every doc that is rasterized: the drawn views and the cosmetics, by source name. */
  docs: Record<string, SvgDoc>;
  /** By texture key (`textureKey`). */
  textures: Map<string, PartTexture>;
  /** The bean colours rasterized so far. */
  colours: Set<ColourId>;
}

/**
 * Texture key of a part: `bean:<colour>:<source>:<part id>` for parts drawn in key colours (one
 * texture per bean colour), `bean:any:<source>:<part id>` for the rest.
 */
export const textureKey = (colour: ColourId | null, source: string, partId: string) => `bean:${colour ?? 'any'}:${source}:${partId}`;
/** The ground shadow drawn under every bean (the front view's shadow part). */
export const SHADOW_TEXTURE = textureKey(null, 'front', SHADOW_PART);

let loaded: BeanArt | null = null;

/** Docs with only the parts that do (or do not) use key colours, recoloured for `colour`. */
function select(docs: Record<string, SvgDoc>, colour: ColourId | null): Record<string, SvgDoc> {
  const out: Record<string, SvgDoc> = {};
  for (const [name, doc] of Object.entries(docs)) {
    const parts = doc.parts
      .filter((p) => usesKeyColours(p.inner) === (colour !== null))
      .map((p) => (colour === null ? p : { ...p, inner: recolour(p.inner, colour, p.id) }));
    if (parts.length) out[name] = { ...doc, parts };
  }
  return out;
}

/**
 * Check the bean art and the cosmetics against the contract and rasterize every part, once:
 * parts in key colours once per bean colour in `colours` (D25: palette swaps before
 * rasterizing, one texture set per colour in use). Called before the game starts, with the
 * colours the scene needs; calling it again adds colours.
 */
export async function loadBeanArt(colours: readonly ColourId[] = [DEFAULT_LOOK.colour]): Promise<BeanArt> {
  if (!loaded) {
    const spec = buildBeanArtSpec(BEAN_SVGS);
    const cosmetics = buildCosmeticsSpec(COSMETIC_SVGS);
    const docs = { ...spec.docs, ...cosmeticDocs(spec, cosmetics) };
    const textures = await rasterizeParts(select(docs, null), (file, part) => textureKey(null, file, part));
    loaded = { spec, cosmetics, docs, textures, colours: new Set() };
  }
  const art = loaded;
  for (const colour of colours) {
    if (art.colours.has(colour)) continue;
    const more = await rasterizeParts(select(art.docs, colour), (file, part) => textureKey(colour, file, part));
    for (const [key, tex] of more) art.textures.set(key, tex);
    art.colours.add(colour);
  }
  return art;
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
