// pnpm art:part <file> [--look ids] [--views all|S,E,…|front,side,…] [--zoom n] [--out dir]
// Renders one art file the way the game draws it, without the game: the contract applied by
// the game's own code (key-colour swaps, patterns clipped to the body, headwear at the anchors,
// `-left` drawings in the mirrored views, the draw order of lookParts), every requested
// direction in one labelled strip, in artifacts/art/parts/. Also prints the anchors and pivots
// the file has, and the contract findings for it (as art:check does).
// Each part is its own SVG image placed in its view's frame, as the game rasterizes each part
// on its own; the strip is drawn by headless Chromium, the browser the game runs in.
import { mkdirSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { DEFAULT_LOOK, parseLook, type BeanLook } from '@beananza/shared';
import { artFileKind, checkArt, sortArt, type ArtFileKind } from '@beananza/client/art/checks';
import { buildPropArtSpec } from '@beananza/client/art/prop-contract';
import { buildBeanArtSpec, type BeanArtSpec } from '@beananza/client/rig/bean-contract';
import { recolour } from '@beananza/client/rig/colours';
import { buildCosmeticsSpec, cosmeticDocs, lookParts, type CosmeticKind, type CosmeticsSpec } from '@beananza/client/rig/looks';
import { parseSvgParts, partPivot, partSvg, type SvgDoc, type SvgPart } from '@beananza/client/rig/svg-parts';
import { pickDirections, SHADOW_PART } from '@beananza/client/rig/views';
import { readArt, repoPath } from './art-files';
import { REPO } from './session';

/** One cell of the strip: an SVG in its view's frame, and its label. */
export interface Cell {
  label: string;
  viewBox: [number, number, number, number];
  body: string;
}

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

/** A part as an <image> of its own standalone SVG, in its file's frame. */
function partImage(doc: SvgDoc, part: SvgPart, flip: boolean): string {
  const [x, y, w, h] = doc.viewBox;
  const img = `<image href="data:image/svg+xml;base64,${b64(partSvg(doc, part, 1))}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  return flip ? `<g transform="scale(-1 1)">${img}</g>` : img;
}

/**
 * The bean in one look and direction, as the rig draws it at rest: the ground shadow, then
 * every visible part of lookParts in order; parts of a mirrored view flipped, except the
 * screen-space ones (the `-left` drawings), which show as drawn. Key-coloured parts recoloured.
 */
export function beanCell(spec: BeanArtSpec, cosmetics: CosmeticsSpec, look: BeanLook, dir: ReturnType<typeof pickDirections>[number]): Cell {
  const docs = { ...spec.docs, ...cosmeticDocs(spec, cosmetics) };
  const { view, mirrored } = dir.choice;
  const rig = spec.views.find((v) => v.view === view && v.mirrored === mirrored);
  if (!rig) throw new Error(`no ${view} view`);
  const front = spec.docs.front as SvgDoc;
  const shadow = front.parts.find((p) => p.id === SHADOW_PART);
  const images = shadow ? [partImage(front, shadow, false)] : [];
  for (const part of lookParts(rig.parts, cosmetics, look, view, mirrored)) {
    if (part.hiddenByDefault) continue;
    const doc = docs[part.source];
    const drawn = doc?.parts.find((p) => p.id === part.id);
    if (!doc || !drawn) throw new Error(`no drawing for ${part.source}:${part.id}`);
    const inner = part.keyed ? recolour(drawn.inner, look.colour, part.id) : drawn.inner;
    images.push(partImage(doc, { ...drawn, inner }, mirrored && !part.screenSpace));
  }
  return { label: `${dir.name} ${view}${mirrored ? ' mirrored' : ''}`, viewBox: rig.viewBox, body: images.join('') };
}

/** A file drawn as it is: every part in order, hidden ones included (props, or broken bean art). */
export function plainCell(doc: SvgDoc, label: string): Cell {
  return { label, viewBox: doc.viewBox, body: doc.parts.map((p) => partImage(doc, p, false)).join('') };
}

/** The HTML page of the strip: one row of cells, `zoom` CSS pixels per art unit, labels below. */
export function stripHtml(title: string, cells: readonly Cell[], zoom: number): string {
  const cell = (c: Cell) => {
    const [x, y, w, h] = c.viewBox;
    return `<figure><svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w * zoom}" height="${h * zoom}">${c.body}</svg><figcaption>${c.label}</figcaption></figure>`;
  };
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body { margin: 0; background: #F4E9D4; font: 13px system-ui, sans-serif; color: #3B2F2A; }
#strip { display: inline-block; padding: 8px 12px 10px; }
h1 { font-size: 14px; margin: 0 0 6px; }
.row { display: flex; gap: 6px; align-items: flex-end; }
figure { margin: 0; text-align: center; }
svg { display: block; background: #FFF8EC; }
figcaption { margin-top: 3px; }
</style></head><body><div id="strip"><h1>${title}</h1><div class="row">${cells.map(cell).join('')}</div></div></body></html>`;
}

/** What the file adds to the look: a cosmetic file wears itself. */
export function lookFor(kind: ArtFileKind, lookArg: string | undefined): { look: BeanLook; unknown: string[] } {
  const { look, unknown } = lookArg ? parseLook(lookArg) : { look: { ...DEFAULT_LOOK }, unknown: [] };
  if (kind.kind === 'cosmetic') (look as Record<CosmeticKind, string>)[kind.cosmetic] = kind.id;
  return { look, unknown };
}

/** The look's non-default ids, minus the file's own piece (`bow--yellow.png`, not `bow--yellow-bow.png`). */
const lookName = (look: BeanLook, own = '') => [look.colour, look.pattern, look.headwear, look.face].filter((id) => !['orange', 'plain', 'none', 'round', own].includes(id)).join('-');

async function main(): Promise<number> {
  const started = Date.now();
  const { values, positionals } = parseArgs({
    options: {
      look: { type: 'string' },
      views: { type: 'string', default: 'all' },
      zoom: { type: 'string', default: '2' },
      out: { type: 'string', default: 'artifacts/art/parts' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });
  if (values.help || positionals.length !== 1) {
    console.log(`Usage: pnpm art:part <art file> [--look ids] [--views all|S,SE,…|front,side,…] [--zoom n] [--out dir]

  <art file>   a bean view (art/bean/side.svg), a cosmetic (art/bean/headwear/bow.svg) or a prop
  --look       colour and pieces, as ?look= (a cosmetic file adds itself); default orange
  --views      directions (S SE E NE N NW W SW) or view names; default all 8 (props: one drawing)
  --zoom       CSS pixels per art unit (default 2)
Writes <out>/<file name>[--<look>].png and prints the anchors, pivots and contract findings.`);
    return values.help ? 0 : 1;
  }
  const file = repoPath(positionals[0] as string);
  const kind = artFileKind(file);
  if (kind.kind === 'reference') throw new Error(`${file} is reference art; the game does not load it (art/README.md)`);
  const zoom = Number(values.zoom);
  if (!Number.isFinite(zoom) || zoom <= 0) throw new Error(`--zoom must be above 0, got "${values.zoom}"`);

  const art = readArt();
  const findings = checkArt(art).filter((f) => f.file === file);
  const doc = parseSvgParts(art[file] as string);
  const { bean, cosmetics: cosmeticSources, props } = sortArt(art);

  let cells: Cell[];
  let look: BeanLook | null = null;
  if (kind.kind === 'prop') {
    let drawn: SvgDoc | undefined;
    try {
      drawn = buildPropArtSpec(props).docs[kind.id];
    } catch {
      // Broken or unregistered: still drawn as it is; the findings say why.
    }
    cells = [plainCell(drawn ?? doc, `${kind.id} (as drawn, every part)${drawn ? '' : ': the contract fails (findings below)'}`)];
  } else {
    const picked = lookFor(kind, values.look);
    look = picked.look;
    if (picked.unknown.length) throw new Error(`unknown look ids: ${picked.unknown.join(', ')}`);
    let spec: BeanArtSpec | null = null;
    let cosmetics: CosmeticsSpec | null = null;
    try {
      spec = buildBeanArtSpec(bean);
      cosmetics = buildCosmeticsSpec(cosmeticSources);
    } catch {
      // Broken art still renders as drawn, so the problem can be seen; the findings say what it is.
    }
    const dirs = pickDirections(values.views);
    if (spec && cosmetics) {
      const s = spec;
      const c = cosmetics;
      cells = dirs.map((d) => beanCell(s, c, look as BeanLook, d));
    } else {
      cells = [plainCell(doc, `${basename(file)} as drawn: the contract fails (findings below)`)];
    }
  }

  const own = kind.kind === 'cosmetic' ? kind.id : '';
  const name = basename(file, '.svg') + (look && lookName(look, own) ? `--${lookName(look, own)}` : '');
  const outDir = resolve(REPO, values.out);
  mkdirSync(outDir, { recursive: true });
  const png = join(outDir, `${name}.png`);
  const browser = await chromium.launch({ channel: 'chromium' });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const title = `${file}${look ? `, look ${[look.colour, look.pattern, look.headwear, look.face].join(',')}` : ''}`;
    await page.setContent(stripHtml(title, cells, zoom), { waitUntil: 'load' });
    await page.locator('#strip').screenshot({ path: png });
  } catch (err) {
    await browser.close();
    throw err;
  }
  // Closing Chromium takes over a second on Windows; the PNG is written, so the command exits
  // without waiting for it (see the end of main).

  console.log(`art:part ${file} -> ${relative(REPO, png).replaceAll('\\', '/')} (${cells.length} drawing(s), ${((Date.now() - started) / 1000).toFixed(1)} s)`);
  const anchors = Object.entries(doc.anchors);
  console.log(anchors.length ? `anchors: ${anchors.map(([n, p]) => `${n} (${p.x}, ${p.y})`).join('; ')}` : 'anchors: none in this file');
  const pivots = doc.parts.flatMap((p) => {
    try {
      return p.attrs['data-pivot'] === undefined ? [] : [`${p.id} (${partPivot(p).x}, ${partPivot(p).y})`];
    } catch (e) {
      return [`${p.id}: ${(e as Error).message}`];
    }
  });
  console.log(pivots.length ? `pivots: ${pivots.join('; ')}` : 'pivots: none (no part rotates on its own)');
  console.log(`parts: ${doc.parts.map((p) => p.id + (p.attrs['data-layer'] ? ` [${p.attrs['data-layer']}]` : '') + (p.attrs.visibility === 'hidden' ? ' [hidden]' : '')).join(', ')}`);
  for (const f of findings) console.log(`FINDING ${f.file}: ${f.message}`);
  console.log(findings.length ? `${findings.length} contract finding(s)` : 'contract: no findings');
  return findings.length ? 1 : 0;
}


if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 2;
    },
  );
}
