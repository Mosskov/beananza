import type Phaser from 'phaser';
import { BEAN_SVGS } from './bean-art-sources';
import { buildBeanArtSpec, type BeanArtSpec } from './bean-contract';
import { partSvg } from './svg-parts';
import { SHADOW_PART } from './views';

/** Texture pixels per art unit: sharp up to a drawn scale of 2 (the hub draws at 0.62–0.92). */
export const ART_RESOLUTION = 2;

export interface PartTexture {
  key: string;
  canvas: HTMLCanvasElement;
  /** What the texture covers, in art units of its view's frame. */
  bounds: { x: number; y: number; w: number; h: number };
}

export interface BeanArt {
  spec: BeanArtSpec;
  /** By texture key `bean:<source>:<part id>`. */
  textures: Map<string, PartTexture>;
}

export const textureKey = (source: string, partId: string) => `bean:${source}:${partId}`;
/** The ground shadow drawn under every bean (the front view's shadow part). */
export const SHADOW_TEXTURE = textureKey('front', SHADOW_PART);

let loaded: BeanArt | null = null;

async function rasterize(svg: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is not available.');
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/** Crop a canvas to its non-transparent pixels plus 1 px, so each part's texture is small. */
function cropToContent(src: HTMLCanvasElement): { canvas: HTMLCanvasElement; x: number; y: number } {
  const ctx = src.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is not available.');
  const { width, height } = src;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * 4 + 3] as number) === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('Part rasterized to nothing.');
  minX = Math.max(0, minX - 1);
  minY = Math.max(0, minY - 1);
  maxX = Math.min(width - 1, maxX + 1);
  maxY = Math.min(height - 1, maxY + 1);
  const canvas = document.createElement('canvas');
  canvas.width = maxX - minX + 1;
  canvas.height = maxY - minY + 1;
  canvas.getContext('2d')?.drawImage(src, minX, minY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return { canvas, x: minX, y: minY };
}

/**
 * Check the bean art against the contract and rasterize every part once. Called before the
 * game starts; scenes then add the canvases as textures with `addBeanTextures`.
 */
export async function loadBeanArt(): Promise<BeanArt> {
  if (loaded) return loaded;
  const spec = buildBeanArtSpec(BEAN_SVGS);
  const textures = new Map<string, PartTexture>();
  const jobs: Promise<void>[] = [];
  for (const [source, doc] of Object.entries(spec.docs)) {
    const [vx, vy] = doc.viewBox;
    for (const part of doc.parts) {
      jobs.push(
        rasterize(partSvg(doc, part, ART_RESOLUTION)).then((full) => {
          const c = cropToContent(full);
          const key = textureKey(source, part.id);
          textures.set(key, {
            key,
            canvas: c.canvas,
            bounds: { x: vx + c.x / ART_RESOLUTION, y: vy + c.y / ART_RESOLUTION, w: c.canvas.width / ART_RESOLUTION, h: c.canvas.height / ART_RESOLUTION },
          });
        }),
      );
    }
  }
  await Promise.all(jobs);
  loaded = { spec, textures };
  return loaded;
}

/** The loaded bean art; `loadBeanArt` must have finished. */
export function beanArt(): BeanArt {
  if (!loaded) throw new Error('Bean art is not loaded yet (loadBeanArt runs before the game starts).');
  return loaded;
}

/** Add every part as a Phaser texture (once per game). */
export function addBeanTextures(textures: Phaser.Textures.TextureManager): void {
  for (const t of beanArt().textures.values()) if (!textures.exists(t.key)) textures.addCanvas(t.key, t.canvas);
}
