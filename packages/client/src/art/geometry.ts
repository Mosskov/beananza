// Just enough SVG geometry for the art contract's shape checks: a part's shapes as sampled
// outlines, and point-in-outline tests. Pure; runs in the tests and in the art tools.
import { parseAttrs, type Point } from '../rig/svg-parts';

/** One shape's outline as points (closed shapes repeat nothing; the last joins the first). */
export interface Outline {
  points: Point[];
  closed: boolean;
}

const num = (v: string | undefined, fallback = 0) => (v === undefined ? fallback : Number(v));

/** Sample a path's `d` into outlines, `steps` points per curve. Arcs are taken as straight lines. */
export function pathOutlines(d: string, steps = 12): Outline[] {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const out: Outline[] = [];
  let pts: Point[] = [];
  let cur = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let lastCtrl: Point | null = null;
  let cmd = '';
  let i = 0;
  const next = () => Number(tokens[i++]);
  const flush = (closed: boolean) => {
    if (pts.length > 1) out.push({ points: pts, closed });
    pts = [];
  };
  const cubic = (c1: Point, c2: Point, end: Point) => {
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      pts.push({
        x: u * u * u * cur.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
        y: u * u * u * cur.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
      });
    }
    lastCtrl = c2;
    cur = end;
  };
  const quad = (c: Point, end: Point) => {
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      pts.push({ x: u * u * cur.x + 2 * u * t * c.x + t * t * end.x, y: u * u * cur.y + 2 * u * t * c.y + t * t * end.y });
    }
    lastCtrl = c;
    cur = end;
  };
  while (i < tokens.length) {
    const tok = tokens[i] as string;
    if (/[A-Za-z]/.test(tok)) {
      cmd = tok;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        flush(true);
        cur = start;
        lastCtrl = null;
        continue;
      }
    } else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    const rel = cmd === cmd.toLowerCase();
    const at = (x: number, y: number): Point => (rel ? { x: cur.x + x, y: cur.y + y } : { x, y });
    const reflect = (): Point => (lastCtrl ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : cur);
    switch (cmd.toUpperCase()) {
      case 'M': {
        flush(false);
        cur = at(next(), next());
        start = cur;
        pts = [cur];
        lastCtrl = null;
        break;
      }
      case 'L':
        cur = at(next(), next());
        pts.push(cur);
        lastCtrl = null;
        break;
      case 'H': {
        const x = next();
        cur = { x: rel ? cur.x + x : x, y: cur.y };
        pts.push(cur);
        lastCtrl = null;
        break;
      }
      case 'V': {
        const y = next();
        cur = { x: cur.x, y: rel ? cur.y + y : y };
        pts.push(cur);
        lastCtrl = null;
        break;
      }
      case 'C': {
        const c1 = at(next(), next());
        const c2 = at(next(), next());
        cubic(c1, c2, at(next(), next()));
        break;
      }
      case 'S': {
        const c1 = reflect();
        const c2 = at(next(), next());
        cubic(c1, c2, at(next(), next()));
        break;
      }
      case 'Q': {
        const c = at(next(), next());
        quad(c, at(next(), next()));
        break;
      }
      case 'T':
        quad(reflect(), at(next(), next()));
        break;
      case 'A': {
        i += 5;
        cur = at(next(), next());
        pts.push(cur);
        lastCtrl = null;
        break;
      }
      default:
        throw new Error(`unsupported path command "${cmd}"`);
    }
  }
  flush(false);
  return out;
}

/** Every shape in a part's markup as outlines: paths, ellipses, circles, rects, lines, polygons. */
export function shapeOutlines(inner: string, steps = 24): Outline[] {
  const out: Outline[] = [];
  for (const m of inner.matchAll(/<(path|ellipse|circle|rect|line|polygon|polyline)\b([^>]*)>/g)) {
    const a = parseAttrs(m[2] as string);
    switch (m[1]) {
      case 'path':
        out.push(...pathOutlines(a.d ?? ''));
        break;
      case 'ellipse':
      case 'circle': {
        const rx = num(a.rx ?? a.r);
        const ry = num(a.ry ?? a.r);
        const points = Array.from({ length: steps }, (_, k) => {
          const t = (2 * Math.PI * k) / steps;
          return { x: num(a.cx) + rx * Math.cos(t), y: num(a.cy) + ry * Math.sin(t) };
        });
        out.push({ points, closed: true });
        break;
      }
      case 'rect': {
        const [x, y, w, h] = [num(a.x), num(a.y), num(a.width), num(a.height)];
        out.push({ points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], closed: true });
        break;
      }
      case 'line':
        out.push({ points: [{ x: num(a.x1), y: num(a.y1) }, { x: num(a.x2), y: num(a.y2) }], closed: false });
        break;
      default: {
        const n = (a.points ?? '').trim().split(/[\s,]+/).map(Number);
        const points: Point[] = [];
        for (let k = 0; k + 1 < n.length; k += 2) points.push({ x: n[k] as number, y: n[k + 1] as number });
        out.push({ points, closed: m[1] === 'polygon' });
      }
    }
  }
  return out;
}

/** Whether `p` is inside a closed outline (even-odd). */
export function insideOutline(p: Point, outline: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i] as Point;
    const b = outline[j] as Point;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance from `p` to the nearest edge of an outline. */
export function distanceToOutline(p: Point, outline: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[j] as Point;
    const b = outline[i] as Point;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/**
 * How far `p` lies outside an outline: 0 inside, otherwise the distance to its edge. A
 * tolerance of about a unit covers the sampling of curves.
 */
export const outsideBy = (p: Point, outline: readonly Point[]) => (insideOutline(p, outline) ? 0 : distanceToOutline(p, outline));

/** The outline's rightmost x at height y (the crossings of a horizontal line), or null. */
export function rightEdgeAt(y: number, outline: readonly Point[]): number | null {
  let best: number | null = null;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[j] as Point;
    const b = outline[i] as Point;
    if (a.y > y === b.y > y) continue;
    const x = a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y);
    if (best === null || x > best) best = x;
  }
  return best;
}
