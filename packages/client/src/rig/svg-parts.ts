/**
 * Splits a bean view SVG (art/bean/*.svg) into its rig parts. The art contract keeps these
 * files flat: every part is one top-level `<g id="…">` with plain shapes inside and no nested
 * groups, so a small parser is enough and runs the same in the browser and in tests.
 */

export interface SvgPart {
  id: string;
  /** Attributes of the part's `<g>` (for example `data-after`, `visibility`). */
  attrs: Record<string, string>;
  /** The shapes inside the group, as markup. */
  inner: string;
}

export interface SvgDoc {
  /** minX, minY, width, height in art units (100 units = 1 m, origin between the feet). */
  viewBox: [number, number, number, number];
  /** Parts in document (draw) order. */
  parts: SvgPart[];
}

export interface Point {
  x: number;
  y: number;
}

const ATTR = /([\w:-]+)="([^"]*)"/g;

export function parseAttrs(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(ATTR)) out[m[1] as string] = m[2] as string;
  return out;
}

export function parseSvgParts(text: string): SvgDoc {
  const clean = text.replace(/<metadata>[\s\S]*?<\/metadata>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const svgTag = /<svg\b([^>]*)>/.exec(clean);
  if (!svgTag) throw new Error('No <svg> element.');
  const box = (parseAttrs(svgTag[1] as string).viewBox ?? '').trim().split(/[\s,]+/).map(Number);
  if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) throw new Error('The <svg> needs a numeric viewBox.');
  const parts: SvgPart[] = [];
  for (const m of clean.matchAll(/<g\b([^>]*)>([\s\S]*?)<\/g>/g)) {
    const attrs = parseAttrs(m[1] as string);
    const inner = (m[2] as string).trim();
    if (!attrs.id) throw new Error('Every top-level <g> must have an id (its part id).');
    if (/<g\b/.test(inner)) throw new Error(`Part "${attrs.id}" contains a nested <g>; parts must be flat.`);
    parts.push({ id: attrs.id, attrs, inner });
  }
  return { viewBox: box as [number, number, number, number], parts };
}

function firstMove(part: SvgPart): Point | null {
  const m = /\bd="\s*M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(part.inner);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

function ellipseCentres(part: SvgPart): Point[] {
  return [...part.inner.matchAll(/<ellipse\b([^>]*)>/g)].map((m) => {
    const a = parseAttrs(m[1] as string);
    return { x: Number(a.cx ?? 0), y: Number(a.cy ?? 0) };
  });
}

/**
 * Where a part rotates and scales from, in art units. The SVGs have no pivot markers yet
 * (docs/ART_PIPELINE.md §2), so v0 derives them by rule:
 * - arms and the scarf tail: the first point of their path (the shoulder, the knot);
 * - feet: the centre of their ellipse;
 * - eyes: the mean of the eye ellipse centres (highlight circles are ignored);
 * - everything else: the ground point between the feet (0, 0).
 */
export function partPivot(part: SvgPart): Point {
  if (part.id.startsWith('arm-') || part.id === 'scarf-tail') {
    const p = firstMove(part);
    if (!p) throw new Error(`Part "${part.id}" needs a path starting with M for its pivot.`);
    return p;
  }
  if (part.id.startsWith('foot-')) {
    const c = ellipseCentres(part)[0];
    if (!c) throw new Error(`Part "${part.id}" needs an ellipse for its pivot.`);
    return c;
  }
  if (part.id === 'eyes') {
    const cs = ellipseCentres(part);
    if (cs.length === 0) throw new Error('Part "eyes" needs ellipses for its pivot.');
    return { x: cs.reduce((s, c) => s + c.x, 0) / cs.length, y: cs.reduce((s, c) => s + c.y, 0) / cs.length };
  }
  return { x: 0, y: 0 };
}

/** A standalone SVG of one part in its view's frame, `resolution` pixels per art unit. */
export function partSvg(doc: SvgDoc, part: SvgPart, resolution: number): string {
  const [x, y, w, h] = doc.viewBox;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" ` +
    `width="${w * resolution}" height="${h * resolution}"><g>${part.inner}</g></svg>`
  );
}
