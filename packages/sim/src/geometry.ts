/**
 * Ground-plane geometry for the hub (D2, D15): convex polygons in metres, x east and y north.
 * The walkable area of every hub layout is one of these, from the plaza's rectangle to the sky
 * island's hexagon. Only exactly specified arithmetic is used (+ − × ÷ and sqrt, STATUS open
 * issue 5), and edges along an axis are handled without any division by a length, so a rectangle
 * gives the same numbers as clamping each axis.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** A convex polygon on the ground: corners counter-clockwise (seen from above, north up). */
export interface ConvexPolygon {
  points: Point[];
}

/** An edge's line as a half-plane: points with nx·x + ny·y ≤ d are inside (n is the unit outward normal). */
interface HalfPlane {
  nx: number;
  ny: number;
  d: number;
}

/** A rectangle as a polygon, corners counter-clockwise from the south-west. */
export function polygonFromRect(r: Rect): ConvexPolygon {
  return {
    points: [
      { x: r.minX, y: r.minY },
      { x: r.maxX, y: r.minY },
      { x: r.maxX, y: r.maxY },
      { x: r.minX, y: r.maxY },
    ],
  };
}

/**
 * A flat-top regular hexagon (flat edges north and south, corners east and west), centred on
 * `centre`. Corners counter-clockwise from the east.
 */
export function hexagon(circumradius: number, centre: Point = { x: 0, y: 0 }): ConvexPolygon {
  const r = circumradius;
  const half = r / 2;
  const h = (r * Math.sqrt(3)) / 2;
  const { x, y } = centre;
  return {
    points: [
      { x: x + r, y },
      { x: x + half, y: y + h },
      { x: x - half, y: y + h },
      { x: x - r, y },
      { x: x - half, y: y - h },
      { x: x + half, y: y - h },
    ],
  };
}

export function polygonBounds(poly: ConvexPolygon): Rect {
  const xs = poly.points.map((p) => p.x);
  const ys = poly.points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** The edge from `a` to `b` of a counter-clockwise polygon, as a half-plane. */
function halfPlane(a: Point, b: Point): HalfPlane {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Axis-aligned edges get an exact unit normal; others are normalised by their length.
  if (dy === 0) return dx > 0 ? { nx: 0, ny: -1, d: -a.y } : { nx: 0, ny: 1, d: a.y };
  if (dx === 0) return dy > 0 ? { nx: 1, ny: 0, d: a.x } : { nx: -1, ny: 0, d: -a.x };
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = dy / len;
  const ny = -dx / len;
  return { nx, ny, d: nx * a.x + ny * a.y };
}

function halfPlanes(poly: ConvexPolygon): HalfPlane[] {
  const pts = poly.points;
  return pts.map((a, i) => halfPlane(a, pts[(i + 1) % pts.length]!));
}

/** Where two edge lines cross. */
function intersect(p: HalfPlane, q: HalfPlane): Point {
  const det = p.nx * q.ny - p.ny * q.nx;
  return { x: (p.d * q.ny - q.d * p.ny) / det, y: (p.nx * q.d - q.nx * p.d) / det };
}

/**
 * The polygon shrunk by `r` on every edge: where the centre of a circle of radius `r` can be
 * while the circle stays inside. `r` must be smaller than the polygon's inradius.
 */
export function insetConvex(poly: ConvexPolygon, r: number): ConvexPolygon {
  const planes = halfPlanes(poly).map((h) => ({ ...h, d: h.d - r }));
  const n = planes.length;
  // Corner i sits between the edges before and after it.
  return { points: planes.map((_, i) => intersect(planes[(i + n - 1) % n]!, planes[i]!)) };
}

/** Whether `p` is inside the polygon or on its edge (within `tolerance` metres). */
export function containsPoint(poly: ConvexPolygon, p: Point, tolerance = 0): boolean {
  return halfPlanes(poly).every((h) => h.nx * p.x + h.ny * p.y <= h.d + tolerance);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** The point of the segment a–b closest to `p`. */
function closestOnSegment(a: Point, b: Point, p: Point): Point {
  // Along an axis, clamp the one coordinate: exact, and the same as clamping a rectangle.
  if (a.y === b.y) return { x: clamp(p.x, Math.min(a.x, b.x), Math.max(a.x, b.x)), y: a.y };
  if (a.x === b.x) return { x: a.x, y: clamp(p.y, Math.min(a.y, b.y), Math.max(a.y, b.y)) };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  if (t <= 0) return { x: a.x, y: a.y };
  if (t >= 1) return { x: b.x, y: b.y };
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** `p` itself if it is inside the polygon, else the closest point on its boundary. */
export function closestPointInConvex(poly: ConvexPolygon, p: Point): Point {
  if (containsPoint(poly, p)) return { x: p.x, y: p.y };
  const pts = poly.points;
  let best: Point = { x: p.x, y: p.y };
  let bestD = Infinity;
  pts.forEach((a, i) => {
    const q = closestOnSegment(a, pts[(i + 1) % pts.length]!, p);
    const d = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  });
  return best;
}
