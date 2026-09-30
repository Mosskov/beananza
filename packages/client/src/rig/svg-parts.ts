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
  /**
   * Named points from the reserved `<g id="anchors">` group (D22), by name without the
   * `anchor-` prefix. Never drawn.
   */
  anchors: Record<string, Point>;
}

/** The reserved group that holds a file's anchors: `<circle id="anchor-<name>" cx cy r="0"/>`. */
export const ANCHORS_GROUP = 'anchors';

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
  const anchors: Record<string, Point> = {};
  for (const m of clean.matchAll(/<g\b([^>]*)>([\s\S]*?)<\/g>/g)) {
    const attrs = parseAttrs(m[1] as string);
    const inner = (m[2] as string).trim();
    if (!attrs.id) throw new Error('Every top-level <g> must have an id (its part id).');
    if (/<g\b/.test(inner)) throw new Error(`Part "${attrs.id}" contains a nested <g>; parts must be flat.`);
    if (attrs.id === ANCHORS_GROUP) {
      if (Object.keys(anchors).length) throw new Error(`Only one <g id="${ANCHORS_GROUP}"> per file.`);
      Object.assign(anchors, parseAnchors(inner));
      continue;
    }
    if (/\bid="anchor-/.test(inner)) throw new Error(`Part "${attrs.id}" has an anchor; anchors go in <g id="${ANCHORS_GROUP}">.`);
    parts.push({ id: attrs.id, attrs, inner });
  }
  return { viewBox: box as [number, number, number, number], parts, anchors };
}

function parseAnchors(inner: string): Record<string, Point> {
  const anchors: Record<string, Point> = {};
  for (const m of inner.matchAll(/<(\w+)\b([^>]*)\/?>/g)) {
    const a = parseAttrs(m[2] as string);
    const name = /^anchor-([\w-]+)$/.exec(a.id ?? '')?.[1];
    if (m[1] !== 'circle' || !name) {
      throw new Error(`Anchors must be <circle id="anchor-<name>" cx cy r="0"/>, found <${m[1] as string} id="${a.id ?? ''}">.`);
    }
    const x = Number(a.cx);
    const y = Number(a.cy);
    if (a.cx === undefined || a.cy === undefined || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Anchor "${name}" needs numeric cx and cy.`);
    if (name in anchors) throw new Error(`Anchor "${name}" is defined twice.`);
    anchors[name] = { x, y };
  }
  return anchors;
}

/** Parts that rotate or scale about their own point, so the art contract requires `data-pivot`. */
export function needsPivot(partId: string): boolean {
  return /^(arm-|foot-|wheel-)/.test(partId) || partId === 'scarf-tail' || partId === 'eyes' || partId === 'swirl';
}

/**
 * Where a part rotates and scales from, in art units (D22): its `data-pivot="x y"`, or the
 * origin (the ground point between the feet, or under a prop) for parts that only move with
 * the body. The contract requires `data-pivot` on the parts `needsPivot` names: arms at the
 * shoulder, feet and eyes at their centre, the scarf tail at the knot, wheels at the hub, a
 * portal's swirl at its centre.
 */
export function partPivot(part: SvgPart): Point {
  const raw = part.attrs['data-pivot'];
  if (raw === undefined) {
    if (needsPivot(part.id)) throw new Error(`Part "${part.id}" needs data-pivot="x y".`);
    return { x: 0, y: 0 };
  }
  const n = raw.trim().split(/[\s,]+/).map(Number);
  if (n.length !== 2 || n.some((v) => !Number.isFinite(v))) throw new Error(`Part "${part.id}" has a malformed data-pivot="${raw}".`);
  return { x: n[0] as number, y: n[1] as number };
}

/** Whether a point lies inside a viewBox (inclusive). */
export function insideViewBox(p: Point, [x, y, w, h]: SvgDoc['viewBox']): boolean {
  return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
}

/** A standalone SVG of one part in its view's frame, `resolution` pixels per art unit. */
export function partSvg(doc: SvgDoc, part: SvgPart, resolution: number): string {
  const [x, y, w, h] = doc.viewBox;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" ` +
    `width="${w * resolution}" height="${h * resolution}"><g>${part.inner}</g></svg>`
  );
}
