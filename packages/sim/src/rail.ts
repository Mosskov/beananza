/**
 * Carts on a straight rail (D4, D19): an exact 1D sim. Between events every cart has a constant
 * acceleration, so positions and velocities follow x + v·t + ½·a·t² exactly. Events are solved
 * inside the step, in time order: a cart reaching the push speed cap or stopping, a cart hitting
 * a bumper (restitution 0.45) and two carts colliding (restitution 0.5, momentum conserved).
 * Numbers are what students measure, so no Box2D approximations here (Planck's 1 m/s
 * restitution threshold would zero most of these bounces).
 */

import { EARTH_GRAVITY } from './constants';

// D19: the prototype's cart numbers at 100 px = 1 m.
/** Push force while walking and while running (N). */
export const CART_PUSH_FORCE = 42;
export const CART_RUN_PUSH_FORCE = 63;
/** A push only speeds a cart up to this speed (m/s), walking and running. */
export const CART_PUSH_CAP = 1.9;
export const CART_RUN_PUSH_CAP = 2.8;
/** Rolling friction as a deceleration (m/s²), the same for every mass: μ_r·g with μ_r ≈ 0.0265. */
export const CART_ROLLING_DECEL = 0.26;
export const CART_ROLLING_COEFFICIENT = CART_ROLLING_DECEL / EARTH_GRAVITY;
export const BUMPER_RESTITUTION = 0.45;
export const CART_RESTITUTION = 0.5;
/**
 * A bean standing on the rail braces and stops a cart that rolls into it (restitution 0): the
 * ground takes the momentum. The bean is not moved; carts never shove it along.
 */
export const BEAN_STOP_RESTITUTION = 0;
/** Half a cart's length along the rail (m): carts are 0.8 m long. */
export const CART_HALF_LENGTH = 0.4;

/** Closing speeds below this end in contact instead of a bounce (m/s), so bounces never chatter. */
const CONTACT_SPEED = 1e-6;
const EPS_X = 1e-9;
const EPS_V = 1e-9;
/** Events handled per cart step at most; beyond that the rest of the step only clamps. */
const MAX_EVENTS = 32;

export interface RailCart {
  id: string;
  /** The cart's own mass (kg). */
  mass: number;
  /** Mass riding in it (kg), 0 when empty. */
  riderMass: number;
  /** Centre along the rail (m, east positive). */
  x: number;
  /** Velocity along the rail (m/s). */
  v: number;
}

export interface Rail {
  /** Ground y of the rail's centre line (m, north positive). */
  y: number;
  /** Where the bumpers stop a cart's ends (m). */
  minX: number;
  maxX: number;
}

export interface RailPush {
  cart: string;
  /** +1 pushes east, −1 west. */
  dir: 1 | -1;
  run: boolean;
}

/** One collision, as logged for the scripted checks (momentum, restitution). */
export interface RailCollision {
  /** A bumper, two carts, or a bean standing in the cart's way. */
  kind: 'bumper' | 'carts' | 'bean';
  /** Sim time of the impact (s), solved inside the step. */
  time: number;
  /** Carts involved, west to east; masses include riders. */
  carts: { id: string; mass: number; vBefore: number; vAfter: number }[];
}

export const totalMass = (c: RailCart) => c.mass + c.riderMass;

interface Group {
  carts: RailCart[];
  mass: number;
  v: number;
  a: number;
  /** Time until the acceleration changes (the cart stops or reaches the cap). */
  until: number;
  /** What v is at `until`. */
  vAt: number;
}

/**
 * Acceleration of a body of mass `m` moving at `v`, with an optional push, and how long it
 * holds. Friction always opposes the motion (also while pushing), so a push from rest gives
 * F/m − 0.26 m/s². At the cap the bean holds the speed: the push just balances friction.
 */
function regime(m: number, v: number, push: { dir: 1 | -1; force: number; cap: number } | null) {
  const f = CART_ROLLING_DECEL;
  if (!push) {
    if (v === 0) return { a: 0, until: Infinity, vAt: 0 };
    return { a: -Math.sign(v) * f, until: Math.abs(v) / f, vAt: 0 };
  }
  const { dir: d, force, cap } = push;
  const along = d * v;
  if (along >= cap - EPS_V) return { a: 0, until: Infinity, vAt: v };
  if (along < 0) {
    // Moving against the push: push and friction both slow it until it stops.
    const a = d * (force / m + f);
    return { a, until: Math.abs(v) / Math.abs(a), vAt: 0 };
  }
  const net = force / m - f;
  if (net > 0) return { a: d * net, until: (cap - along) / net, vAt: d * cap };
  // Too heavy to speed up: it slows to a stop (or stays put).
  if (along === 0) return { a: 0, until: Infinity, vAt: 0 };
  return { a: d * net, until: along / -net, vAt: 0 };
}

/** Smallest t in (0, tMax] where A·t² + B·t + C reaches 0 from C ≥ 0, or Infinity. */
function firstRoot(A: number, B: number, C: number, tMax: number): number {
  let roots: number[];
  if (Math.abs(A) < 1e-15) {
    roots = B < 0 ? [-C / B] : [];
  } else {
    const disc = B * B - 4 * A * C;
    if (disc < 0) return Infinity;
    const q = -0.5 * (B + (B < 0 ? -1 : 1) * Math.sqrt(disc));
    roots = q === 0 ? [] : [q / A, C / q];
  }
  let best = Infinity;
  for (const r of roots) if (r > 1e-12 && r <= tMax && r < best) best = r;
  return best;
}

/**
 * When a gap A·t² + B·t + gap closes: at once if touching and closing, otherwise the first root
 * (a touching pair that separates can still be pulled back together by its accelerations).
 */
function contactTime(gap: number, A: number, B: number, tMax: number): number {
  if (gap <= EPS_X && B < -EPS_V) return 0;
  return firstRoot(A, B, Math.max(gap, 0), tMax);
}

/** Riding: the bean hops in with no velocity along the rail, so momentum gives v' = v·m/(m+M). */
export function boardCart(cart: RailCart, riderMass: number): void {
  const before = totalMass(cart);
  cart.riderMass += riderMass;
  cart.v = (cart.v * before) / totalMass(cart);
}

/** Hopping out reverses it: the bean leaves with no velocity along the rail, v' = v·(m+M)/m. */
export function leaveCart(cart: RailCart): void {
  const before = totalMass(cart);
  cart.riderMass = 0;
  cart.v = (cart.v * before) / totalMass(cart);
}

/** Something standing on the rail that carts stop against: the bean's footprint along the rail. */
export interface RailObstacle {
  /** West and east edges along the rail (m). */
  lo: number;
  hi: number;
}

/** A stretch of rail between two stops, each a bumper or a bean. */
interface Span {
  minX: number;
  maxX: number;
  west: 'bumper' | 'bean';
  east: 'bumper' | 'bean';
}

const stopRestitution = (kind: Span['west']) => (kind === 'bumper' ? BUMPER_RESTITUTION : BEAN_STOP_RESTITUTION);

/**
 * Advance the carts by `dt` from sim time `t0`, exactly. `carts` must be sorted west to east
 * (carts cannot pass each other, so the order never changes). An `obstacle` (the bean standing
 * on the rail) splits the rail in two: carts on each side stop against it. Returns the
 * collisions in time order.
 */
export function stepRail(
  rail: Rail,
  carts: RailCart[],
  push: RailPush | null,
  t0: number,
  dt: number,
  obstacle: RailObstacle | null = null,
): RailCollision[] {
  if (!obstacle) return stepSpan({ minX: rail.minX, maxX: rail.maxX, west: 'bumper', east: 'bumper' }, carts, push, t0, dt);
  const mid = (obstacle.lo + obstacle.hi) / 2;
  const west = carts.filter((c) => c.x < mid);
  const east = carts.filter((c) => c.x >= mid);
  return [
    ...stepSpan({ minX: rail.minX, maxX: Math.min(rail.maxX, obstacle.lo), west: 'bumper', east: 'bean' }, west, push, t0, dt),
    ...stepSpan({ minX: Math.max(rail.minX, obstacle.hi), maxX: rail.maxX, west: 'bean', east: 'bumper' }, east, push, t0, dt),
  ].sort((a, b) => a.time - b.time);
}

function stepSpan(rail: Span, carts: RailCart[], push: RailPush | null, t0: number, dt: number): RailCollision[] {
  const h = CART_HALF_LENGTH;
  const collisions: RailCollision[] = [];
  let elapsed = 0;
  for (let n = 0; n < MAX_EVENTS && dt - elapsed > 0; n++) {
    const left = dt - elapsed;
    const groups = buildGroups(rail, carts, push);

    // Earliest event: an acceleration change, a bumper hit or two groups meeting.
    let tNext = left;
    let event: { kind: 'regime'; g: Group } | { kind: 'bumper'; g: Group; side: -1 | 1 } | { kind: 'carts'; i: number } | null = null;
    for (const g of groups) {
      if (g.until < tNext) {
        tNext = g.until;
        event = { kind: 'regime', g };
      }
    }
    const first = groups[0];
    const last = groups[groups.length - 1];
    if (first) {
      const gap = (first.carts[0] as RailCart).x - h - rail.minX;
      const t = contactTime(gap, 0.5 * first.a, first.v, tNext);
      if (t <= tNext) {
        tNext = t;
        event = { kind: 'bumper', g: first, side: -1 };
      }
    }
    if (last) {
      const gap = rail.maxX - ((last.carts[last.carts.length - 1] as RailCart).x + h);
      const t = contactTime(gap, -0.5 * last.a, -last.v, tNext);
      if (t <= tNext) {
        tNext = t;
        event = { kind: 'bumper', g: last, side: 1 };
      }
    }
    for (let i = 0; i + 1 < groups.length; i++) {
      const a = groups[i] as Group;
      const b = groups[i + 1] as Group;
      const gap = (b.carts[0] as RailCart).x - h - ((a.carts[a.carts.length - 1] as RailCart).x + h);
      const t = contactTime(gap, 0.5 * (b.a - a.a), b.v - a.v, tNext);
      if (t <= tNext) {
        tNext = t;
        event = { kind: 'carts', i };
      }
    }

    // Advance everything exactly to the event.
    for (const g of groups) {
      const dx = g.v * tNext + 0.5 * g.a * tNext * tNext;
      const v = event?.kind === 'regime' && event.g === g ? g.vAt : g.v + g.a * tNext;
      for (const c of g.carts) {
        c.x += dx;
        c.v = v;
      }
      g.v = v;
    }
    elapsed += tNext;
    const time = t0 + elapsed;

    if (event?.kind === 'bumper') {
      const c = (event.side < 0 ? event.g.carts[0] : event.g.carts[event.g.carts.length - 1]) as RailCart;
      c.x = event.side < 0 ? rail.minX + h : rail.maxX - h; // exactly touching
      const stop = event.side < 0 ? rail.west : rail.east;
      const before = event.g.v;
      const e = stopRestitution(stop);
      const after = Math.abs(before) < CONTACT_SPEED || e === 0 ? 0 : -e * before;
      for (const k of event.g.carts) k.v = after;
      if (Math.abs(before) >= CONTACT_SPEED) {
        collisions.push({ kind: stop, time, carts: event.g.carts.map((k) => ({ id: k.id, mass: totalMass(k), vBefore: before, vAfter: after })) });
      }
    } else if (event?.kind === 'carts') {
      const a = groups[event.i] as Group;
      const b = groups[event.i + 1] as Group;
      const ma = a.mass;
      const mb = b.mass;
      const va = a.v;
      const vb = b.v;
      const e = va - vb < CONTACT_SPEED ? 0 : CART_RESTITUTION;
      const p = ma * va + mb * vb;
      const vaAfter = (p - mb * e * (va - vb)) / (ma + mb);
      const vbAfter = (p + ma * e * (va - vb)) / (ma + mb);
      // Exactly touching after the impact.
      const shift = (a.carts[a.carts.length - 1] as RailCart).x + 2 * h - (b.carts[0] as RailCart).x;
      for (const k of b.carts) k.x += shift;
      for (const k of a.carts) k.v = vaAfter;
      for (const k of b.carts) k.v = vbAfter;
      if (e > 0) {
        collisions.push({
          kind: 'carts',
          time,
          carts: [
            ...a.carts.map((k) => ({ id: k.id, mass: ma, vBefore: va, vAfter: vaAfter })),
            ...b.carts.map((k) => ({ id: k.id, mass: mb, vBefore: vb, vAfter: vbAfter })),
          ],
        });
      }
    }
  }
  // Out of events for this step (never seen in practice): keep carts on the rail and apart.
  if (dt - elapsed > 0) clampCarts(rail, carts);
  return collisions;
}

function pushFor(push: RailPush | null) {
  if (!push) return null;
  return {
    dir: push.dir,
    force: push.run ? CART_RUN_PUSH_FORCE : CART_PUSH_FORCE,
    cap: push.run ? CART_RUN_PUSH_CAP : CART_PUSH_CAP,
  };
}

/**
 * Carts in contact that press on each other move as one body (for example the bean pushing one
 * cart into the other); a group resting against a bumper that pushes into it stays put.
 */
function buildGroups(rail: Span, carts: RailCart[], push: RailPush | null): Group[] {
  const h = CART_HALF_LENGTH;
  const p = pushFor(push);
  const alone = (c: RailCart) => regime(totalMass(c), c.v, push && push.cart === c.id ? p : null);
  const groups: RailCart[][] = [];
  for (const c of carts) {
    const prev = groups[groups.length - 1];
    const west = prev?.[prev.length - 1];
    if (prev && west && c.x - h - (west.x + h) <= EPS_X && Math.abs(c.v - west.v) <= EPS_V && alone(west).a > alone(c).a) {
      prev.push(c);
    } else {
      groups.push([c]);
    }
  }
  return groups.map((gc) => {
    const mass = gc.reduce((s, c) => s + totalMass(c), 0);
    const v = gc.reduce((s, c) => s + totalMass(c) * c.v, 0) / mass;
    const pushed = push !== null && gc.some((c) => c.id === push.cart);
    let r = regime(mass, v, pushed ? p : null);
    const west = gc[0] as RailCart;
    const east = gc[gc.length - 1] as RailCart;
    const atWest = west.x - h - rail.minX <= EPS_X && v <= EPS_V && r.a < 0;
    const atEast = rail.maxX - (east.x + h) <= EPS_X && v >= -EPS_V && r.a > 0;
    if (atWest || atEast) r = { a: 0, until: Infinity, vAt: 0 };
    const group: Group = { carts: gc, mass, v: atWest || atEast ? 0 : v, a: r.a, until: r.until, vAt: r.vAt };
    for (const c of gc) c.v = group.v;
    return group;
  });
}

function clampCarts(rail: Span, carts: RailCart[]): void {
  const h = CART_HALF_LENGTH;
  let west = rail.minX;
  for (const c of carts) {
    if (c.x - h < west) c.x = west + h;
    west = c.x + h;
  }
  let east = rail.maxX;
  for (let i = carts.length - 1; i >= 0; i--) {
    const c = carts[i] as RailCart;
    if (c.x + h > east) c.x = east - h;
    east = c.x - h;
  }
}
