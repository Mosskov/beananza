// pnpm shot:sheet: tile PNGs into one labelled image, so many frames can be looked at at once.
//   pnpm shot:sheet <png or folder>... [--crop x,y,w,h] [--cols n] [--scale s] [--title text] [--out file]
// Folders contribute their top-level PNGs in name order. Paths are relative to the repo root.
// Drawn on a canvas in headless Chromium, so no image library is needed. Also a library for
// art-sheet: composeSheet and diffPngs.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, type Browser, type Page } from 'playwright';
import { clipCrop, defaultCols, layoutSheet, parseCrop, type Rect } from './sheet-layout';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
/** Sheet colours: the palette's panel cream and ink (art/README.md). */
const BG = '#FFF8EC';
const INK = '#3B2F2A';

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(png: Buffer): { w: number; h: number } {
  const signature = '89504e470d0a1a0a';
  if (png.length < 24 || png.subarray(0, 8).toString('hex') !== signature) throw new Error('not a PNG');
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
}

// In-page code is a plain string: functions serialized from this file would carry esbuild
// helpers (tsx sets keepNames) that do not exist inside the page.
const PAGE_CODE = `
window.__load = (src) => new Promise((ok, bad) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => bad(new Error('could not decode an image'));
  img.src = src;
});
window.__compose = async ({ images, labels, crops, layout, title, bg, ink }) => {
  const imgs = await Promise.all(images.map(window.__load));
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = ink;
  g.textBaseline = 'middle';
  if (title) {
    g.font = 'bold 18px sans-serif';
    g.fillText(title, 10, 19);
  }
  g.font = '14px sans-serif';
  layout.cells.forEach((cell, i) => {
    const k = crops[i];
    g.fillText(labels[i], cell.label.x, cell.label.y + 11);
    if (k.w > 0 && k.h > 0) g.drawImage(imgs[i], k.x, k.y, k.w, k.h, cell.image.x, cell.image.y, cell.image.w, cell.image.h);
  });
  return canvas.toDataURL('image/png');
};
window.__pixels = (img) => {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
};
window.__diff = async ({ before, after, threshold }) => {
  const [a, b] = await Promise.all([window.__load(before), window.__load(after)]);
  if (a.naturalWidth !== b.naturalWidth || a.naturalHeight !== b.naturalHeight) {
    return { sameSize: false, changed: -1, total: 0, box: null, png: null };
  }
  const pa = window.__pixels(a).data;
  const out = window.__pixels(b);
  const pb = out.data;
  let changed = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  const w = out.width;
  for (let i = 0; i < pb.length; i += 4) {
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(pa[i + c] - pb[i + c]));
    if (d > threshold) {
      changed++;
      const p = i / 4, x = p % w, y = (p - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      pb[i] = 255; pb[i + 1] = 0; pb[i + 2] = 255; pb[i + 3] = 255;
    } else {
      // Fade the unchanged picture towards white so the magenta stands out.
      for (let c = 0; c < 3; c++) pb[i + c] = Math.round(255 - (255 - pb[i + c]) * 0.3);
      pb[i + 3] = 255;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = out.width;
  canvas.height = out.height;
  canvas.getContext('2d').putImageData(out, 0, 0);
  const box = changed ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
  return { sameSize: true, changed, total: pb.length / 4, box, png: canvas.toDataURL('image/png') };
};
`;

const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;
const fromDataUrl = (url: string) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

async function sheetPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: PAGE_CODE });
  return page;
}

export interface SheetItem {
  label: string;
  png: Buffer;
  /** This image's own crop, instead of the sheet's. */
  crop?: Rect;
}

export interface SheetOptions {
  crop: Rect | null;
  cols: number;
  scale: number;
  title: string | null;
}

/** Tile PNGs into one labelled PNG. */
export async function composeSheet(browser: Browser, items: readonly SheetItem[], opts: SheetOptions): Promise<Buffer> {
  const crops = items.map((it) => clipCrop(it.crop ?? opts.crop, pngSize(it.png)));
  const layout = layoutSheet(crops, opts.cols, opts.scale, opts.title !== null);
  const page = await sheetPage(browser);
  try {
    const args = { images: items.map((it) => dataUrl(it.png)), labels: items.map((it) => it.label), crops, layout, title: opts.title, bg: BG, ink: INK };
    return fromDataUrl((await page.evaluate(`window.__compose(${JSON.stringify(args)})`)) as string);
  } finally {
    await page.close();
  }
}

export interface Diff {
  sameSize: boolean;
  /** Pixels whose largest channel difference exceeds the threshold (−1 if the sizes differ). */
  changed: number;
  total: number;
  /** The bounding box of the changed pixels, or null. */
  box: Rect | null;
  /** The after image faded, with changed pixels in magenta; null if the sizes differ. */
  png: Buffer | null;
}

/** Compare two PNGs pixel by pixel. `threshold` ignores channel differences up to that value. */
export async function diffPngs(browser: Browser, before: Buffer, after: Buffer, threshold = 2): Promise<Diff> {
  const page = await sheetPage(browser);
  try {
    const args = { before: dataUrl(before), after: dataUrl(after), threshold };
    const r = (await page.evaluate(`window.__diff(${JSON.stringify(args)})`)) as Omit<Diff, 'png'> & { png: string | null };
    return { ...r, png: r.png ? fromDataUrl(r.png) : null };
  } finally {
    await page.close();
  }
}

/** The PNGs named by the arguments: files as given, folders' top-level PNGs in name order. */
export function collectPngs(args: readonly string[]): string[] {
  return args.flatMap((arg) => {
    const path = resolve(REPO, arg);
    if (!existsSync(path)) throw new Error(`no such file or folder: ${arg}`);
    if (statSync(path).isDirectory()) {
      return readdirSync(path)
        .filter((f) => f.toLowerCase().endsWith('.png'))
        .sort()
        .map((f) => join(path, f));
    }
    return [path];
  });
}

/** Labels: each path below the folder all the PNGs share, without `.png`. */
export function labelsFor(paths: readonly string[]): string[] {
  const split = paths.map((p) => p.split(/[\\/]/));
  const dirs = split.map((parts) => parts.slice(0, -1));
  let common = 0;
  while (dirs.every((d) => common < d.length && d[common] === dirs[0]?.[common])) common += 1;
  return split.map((parts) => parts.slice(common).join('/').replace(/\.png$/i, ''));
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    options: {
      crop: { type: 'string' },
      cols: { type: 'string' },
      scale: { type: 'string' },
      title: { type: 'string' },
      out: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });
  if (values.help || positionals.length === 0) {
    console.log(`Usage: pnpm shot:sheet <png or folder>... [options]

  --crop x,y,w,h  Keep only this part of every image (image pixels).
  --cols <n>      Columns (default: close to square, at most 4).
  --scale <s>     Scale every image (default: 0.5, or 1 with --crop).
  --title <text>  A title above the grid.
  --out <file>    Output PNG (default: artifacts/sheets/<first folder or file name>.png).

Folders give their top-level PNGs in name order. Labels are the file names.`);
    return values.help ? 0 : 1;
  }
  const paths = collectPngs(positionals);
  if (paths.length === 0) throw new Error('no PNGs found');
  const crop = values.crop ? parseCrop(values.crop) : null;
  const scale = values.scale ? Number(values.scale) : crop ? 1 : 0.5;
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`--scale must be above 0, got "${values.scale}"`);
  const cols = values.cols ? Number(values.cols) : defaultCols(paths.length);
  const first = resolve(REPO, positionals[0] as string);
  const out = values.out ? resolve(REPO, values.out) : join(REPO, 'artifacts/sheets', `${basename(first).replace(/\.png$/i, '')}.png`);

  const labels = labelsFor(paths);
  const browser = await chromium.launch({ channel: 'chromium' });
  try {
    const png = await composeSheet(
      browser,
      paths.map((p, i) => ({ label: labels[i] as string, png: readFileSync(p) })),
      { crop, cols, scale, title: values.title ?? null },
    );
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, png);
    const { w, h } = pngSize(png);
    console.log(`sheet: ${paths.length} image(s) -> ${relative(REPO, out).replaceAll('\\', '/')} (${w}×${h})`);
  } finally {
    await browser.close();
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 2;
    },
  );
}
