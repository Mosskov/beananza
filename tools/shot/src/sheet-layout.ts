// Grid layout for contact sheets (shot:sheet, art:sheet): pure maths, unit tested.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetLayout {
  width: number;
  height: number;
  /** Where each image goes (its crop scaled), and where its label sits above it. */
  cells: { image: Rect; label: { x: number; y: number } }[];
}

export const LABEL_H = 22;
export const GAP = 10;
export const TITLE_H = 34;

/** Parse `--crop x,y,w,h` (image pixels). */
export function parseCrop(raw: string): Rect {
  const parts = raw.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0) || parts[2] === 0 || parts[3] === 0) {
    throw new Error(`--crop needs x,y,w,h in image pixels (w and h above 0), got "${raw}"`);
  }
  const [x, y, w, h] = parts as [number, number, number, number];
  return { x, y, w, h };
}

/** The part of an image a crop keeps, clipped to the image. */
export function clipCrop(crop: Rect | null, size: { w: number; h: number }): Rect {
  if (!crop) return { x: 0, y: 0, w: size.w, h: size.h };
  const x = Math.min(crop.x, size.w);
  const y = Math.min(crop.y, size.h);
  return { x, y, w: Math.max(0, Math.min(crop.w, size.w - x)), h: Math.max(0, Math.min(crop.h, size.h - y)) };
}

/**
 * Lay out images (already cropped, sizes in pixels) in a grid of `cols` columns, each scaled
 * by `scale`, row-major, every cell as big as the largest image. `title` adds a band on top.
 */
export function layoutSheet(sizes: readonly { w: number; h: number }[], cols: number, scale: number, title: boolean): SheetLayout {
  if (sizes.length === 0) throw new Error('no images to lay out');
  const c = Math.max(1, Math.min(Math.floor(cols), sizes.length));
  const rows = Math.ceil(sizes.length / c);
  const cellW = Math.round(Math.max(...sizes.map((s) => s.w)) * scale);
  const cellH = Math.round(Math.max(...sizes.map((s) => s.h)) * scale);
  const top = title ? TITLE_H : 0;
  const cells = sizes.map((s, i) => {
    const x = GAP + (i % c) * (cellW + GAP);
    const y = top + GAP + Math.floor(i / c) * (LABEL_H + cellH + GAP);
    return { image: { x, y: y + LABEL_H, w: Math.round(s.w * scale), h: Math.round(s.h * scale) }, label: { x, y } };
  });
  return {
    width: GAP + c * (cellW + GAP),
    height: top + GAP + rows * (LABEL_H + cellH + GAP),
    cells,
  };
}

/** Columns for n images when none are given: close to square, at most 4. */
export function defaultCols(n: number): number {
  return Math.max(1, Math.min(4, Math.ceil(Math.sqrt(n))));
}
