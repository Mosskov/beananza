import type Phaser from 'phaser';
import { partSvg, type Point, type SvgDoc } from '../rig/svg-parts';

/**
 * Turns the SVG part files in art/ into textures, once, before the game starts: every part is
 * drawn on its own canvas and cropped to its pixels. Phaser then draws plain images.
 */

/**
 * Texture pixels per art unit (100 units = 1 m = 100 px at scale 1): sharp up to scale 3. The canvas
 * has up to MAX_RENDER_SCALE (2.5) pixels per layout unit (screen-scale.ts), and the bean is drawn
 * at up to 0.92 of full size in the hub, so 3 stays sharp at the cap.
 */
export const ART_RESOLUTION = 3;

export interface PartTexture {
  key: string;
  canvas: HTMLCanvasElement;
  /** What the texture covers, in art units of its file's frame. */
  bounds: { x: number; y: number; w: number; h: number };
}

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

/** Rasterize every part of every file; texture keys come from `keyOf(file name, part id)`. */
export async function rasterizeParts(
  docs: Readonly<Record<string, SvgDoc>>,
  keyOf: (file: string, partId: string) => string,
): Promise<Map<string, PartTexture>> {
  const textures = new Map<string, PartTexture>();
  const jobs: Promise<void>[] = [];
  for (const [file, doc] of Object.entries(docs)) {
    const [vx, vy] = doc.viewBox;
    for (const part of doc.parts) {
      jobs.push(
        rasterize(partSvg(doc, part, ART_RESOLUTION)).then((full) => {
          const c = cropToContent(full);
          const key = keyOf(file, part.id);
          textures.set(key, {
            key,
            canvas: c.canvas,
            bounds: {
              x: vx + c.x / ART_RESOLUTION,
              y: vy + c.y / ART_RESOLUTION,
              w: c.canvas.width / ART_RESOLUTION,
              h: c.canvas.height / ART_RESOLUTION,
            },
          });
        }),
      );
    }
  }
  await Promise.all(jobs);
  return textures;
}

/** Add textures to Phaser (once per game). */
export function addTextures(manager: Phaser.Textures.TextureManager, textures: Iterable<PartTexture>): void {
  for (const t of textures) if (!manager.exists(t.key)) manager.addCanvas(t.key, t.canvas);
}

/**
 * An image of a part whose origin sits on `at` (art units in its file's frame), at 1 art unit
 * per pixel: position it at `at` in a container whose origin is the file's origin.
 */
export function partImage(scene: Phaser.Scene, tex: PartTexture, at: Point): Phaser.GameObjects.Image {
  return scene.add
    .image(0, 0, tex.key)
    .setOrigin((at.x - tex.bounds.x) / tex.bounds.w, (at.y - tex.bounds.y) / tex.bounds.h)
    .setScale(1 / ART_RESOLUTION);
}
