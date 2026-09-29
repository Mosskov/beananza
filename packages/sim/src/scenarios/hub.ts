import { BoxShape, ChainShape, CircleShape, World, type Body } from 'planck';
import type { Scenario, SimStateBase } from '../sim';
import { FIXED_DT, SIM_HZ, ticksToSeconds } from '../time';
import { EARTH_GRAVITY } from '../constants';
import { CART_HALF_LENGTH, boardCart, leaveCart, stepRail, type Rail, type RailCart, type RailCollision, type RailPush } from '../rail';

/**
 * The hub plaza, seen from ¾ top-down (D1). Coordinates (D15): the ground plane is x east and
 * y north, in metres; z is height above the ground, and gravity pulls along −z. How that is
 * projected onto the screen is the client's business.
 *
 * Ground movement goes through Planck.js (D4, hub only): the bean is a circle that the walkable
 * area's edges and the props' footprints stop. Jumps are not in Planck: z is integrated
 * exactly, the same way as the drop, so a timed jump gives textbook numbers (D16).
 *
 * Carts on the east-west rail move in the exact 1D rail sim (`rail.ts`, D4, D19). In Planck
 * they are only kinematic boxes, so the bean bumps into them. The bean pushes a cart by walking
 * into one of its ends (DESIGN.md §7); E (the `action` command) gets in or out of the cart that
 * can be ridden, and Space also gets out.
 */

// Prototype movement, re-derived at 100 px = 1 m (docs/IMPLEMENTATION.md §6).
export const HUB_WALK_SPEED = 2.4; // m/s (240 px/s)
export const HUB_RUN_SPEED = 4.2; // m/s (420 px/s)
/** Jump apex (m): the prototype's 480²/(2·1500) px = 76.8 px, kept under real gravity (D16). */
export const HUB_JUMP_APEX_M = 0.768;
/** Take-off speed that reaches the apex under real gravity: √(2·g·h) ≈ 3.882 m/s. */
export const HUB_JUMP_SPEED = Math.sqrt(2 * EARTH_GRAVITY * HUB_JUMP_APEX_M);
/** A tap target is dropped after this many blocked steps in a row (0.35 s). */
export const HUB_STUCK_STEPS = Math.round(0.35 * SIM_HZ);
/** A step counts as blocked if it made less than this share of the intended progress. */
const STUCK_PROGRESS = 0.25;
/**
 * Footprint radius of every bean body form (cosmetics never change the collider).
 * PLACEHOLDER value until the rig exists; about the width of the prototype bean's feet.
 */
export const HUB_BEAN_RADIUS_M = 0.25;
/** The bean's mass (D18): what riding adds to a cart. */
export const HUB_BEAN_MASS_KG = 20;
/** Half a cart's north-south size (m): its footprint on the ground is 0.8 × 0.4 m. */
export const CART_HALF_DEPTH = 0.2;
/** The bean pushes when its footprint is this close to a cart's end (m); Planck keeps a skin. */
const PUSH_REACH_M = 0.03;
/** A move pushes when at least this share of its direction points along the rail at the cart. */
const PUSH_MIN_ALONG = 0.35;
/** E gets into the ridable cart from up to this far from its centre (m). */
export const BOARD_REACH_M = 1.2;
/** Getting out puts the bean this far south of the rail's centre line (m). */
const EXIT_OFFSET_M = CART_HALF_DEPTH + HUB_BEAN_RADIUS_M + 0.05;
/** Collisions kept in the state for logs and checks. */
const COLLISION_LOG = 16;
/** Closer than this to a tap target counts as arrived (m). */
const ARRIVE_EPSILON = 1e-6;
/**
 * A blocked step this close to the target also counts as arrived (m): Planck's 0.01 m contact
 * skin plus its 0.005 m slop keep the bean from reaching a target set right against an edge,
 * a corner or a prop, and that should not have to wait out the stuck timer.
 */
const ARRIVE_BLOCKED_M = 0.02;

export interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** A solid prop, as its footprint on the ground: a box centred on (x, y). */
export interface PropFootprint {
  id: string;
  x: number;
  y: number;
  /** Half the east-west size (m). */
  halfWidth: number;
  /** Half the north-south size (m). */
  halfDepth: number;
}

export interface CartSpec {
  id: string;
  /** The cart's own mass (kg). */
  mass: number;
  /** Starting centre along the rail (m). */
  x: number;
  /** Whether the bean can get in (the other one is loaded with rocks). */
  ridable: boolean;
}

/** A straight east-west rail with bumpers at both ends, and the carts on it. */
export interface RailLayout extends Rail {
  /** West to east. */
  carts: CartSpec[];
}

export interface PlazaLayout {
  /** Where the bean's centre and footprint may go. */
  walkable: Rect;
  props: PropFootprint[];
  /** Where the bean starts. */
  start: { x: number; y: number };
  rail: RailLayout | null;
}

/**
 * The first plaza: one open rectangle and one prop to walk behind and in front of.
 * PLACEHOLDER layout until D2 (hub layout) is designed.
 */
export const DEFAULT_PLAZA: PlazaLayout = {
  walkable: { minX: -5.8, maxX: 5.8, minY: -3, maxY: 2 },
  props: [{ id: 'tree', x: 2.2, y: 0.2, halfWidth: 0.25, halfDepth: 0.2 }],
  start: { x: -2.5, y: -0.8 },
  // The prototype's rail (7.36 m) and cart spots, centred on x = 0. PLACEHOLDER layout (D2).
  rail: {
    y: -2.1,
    minX: -3.68,
    maxX: 3.68,
    carts: [
      { id: 'light', mass: 5, x: -2.1, ridable: true },
      { id: 'heavy', mass: 20, x: 1.6, ridable: false },
    ],
  },
};

export interface HubJump {
  /** Sim time of take-off (s). */
  startedAt: number;
  /** Exact time of touchdown (s), or null while in the air. */
  landedAt: number | null;
  /** Highest z reached at a step (m). */
  peakZ: number;
}

export interface HubBean {
  /** Ground position (m): x east, y north. */
  x: number;
  y: number;
  /** Height above the ground (m). */
  z: number;
  /** Ground velocity after collisions (m/s). */
  vx: number;
  vy: number;
  /** Vertical velocity (m/s). */
  vz: number;
  grounded: boolean;
  /** Unit vector of the last ground movement direction; kept while idle. */
  facingX: number;
  facingY: number;
  /** Tap-to-move target, already clamped to the walkable area. */
  target: { x: number; y: number } | null;
  /** Consecutive steps the bean made too little progress towards its target. */
  stuckSteps: number;
  /** Jumps taken so far. */
  jumps: number;
  lastJump: HubJump | null;
  /** Id of the cart the bean rides in, or null. */
  riding: string | null;
  /** The push the bean gave a cart this step, or null. */
  pushing: RailPush | null;
}

export interface HubRailState {
  /** West to east, in the layout's order. `riderMass` is the bean while it rides. */
  carts: RailCart[];
  /** The last collisions, oldest first (at most 16). */
  collisions: RailCollision[];
}

/** Held movement input: direction (each axis −1..1, north is +y) and whether Run is held. */
export interface HubInput {
  x: number;
  y: number;
  run: boolean;
}

export interface HubState extends SimStateBase {
  /**
   * The plaza, for reading. The Planck world is built from it once, when the scenario is
   * created; changing it here later does not move any walls.
   */
  readonly layout: PlazaLayout;
  gravity: number;
  input: HubInput;
  bean: HubBean;
  rail: HubRailState | null;
}

export type HubCommand =
  /** Held direction and Run (from keys or a stick). (0, 0) means no direction held. */
  | { type: 'move'; x: number; y: number; run: boolean }
  /** Walk (or run, if Run is held) to a point on the ground. Clamped to the walkable area. */
  | { type: 'moveTo'; x: number; y: number }
  /** Jump, if on the ground. In a cart: get out. */
  | { type: 'jump' }
  /** E, the context action: get into the ridable cart when near it, or get out of it. */
  | { type: 'action' };

export interface HubOptions {
  layout?: PlazaLayout;
  /** Overrides the layout's start position (tests). */
  start?: { x: number; y: number };
  gravity?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** The walkable area shrunk by the bean's radius: where its centre can be. */
function centreArea(walkable: Rect): Rect {
  const r = HUB_BEAN_RADIUS_M;
  return { minX: walkable.minX + r, maxX: walkable.maxX - r, minY: walkable.minY + r, maxY: walkable.maxY - r };
}

/** Clamp a tap target so the bean's centre can reach it. */
export function clampTarget(walkable: Rect, x: number, y: number): { x: number; y: number } {
  const area = centreArea(walkable);
  return { x: clamp(x, area.minX, area.maxX), y: clamp(y, area.minY, area.maxY) };
}

/**
 * The Planck world for a layout. The sim state stays authoritative and plain JSON: every step
 * copies the bean's position and velocity in and reads them back out. Warm starting is off, so
 * no solver impulses carry over between steps and a step depends only on the state.
 */
function buildWorld(layout: PlazaLayout): { world: World; bean: Body; carts: Map<string, Body> } {
  const world = new World({ gravity: { x: 0, y: 0 }, warmStarting: false, allowSleep: false });
  const w = layout.walkable;
  const edges = world.createBody();
  edges.createFixture(
    new ChainShape(
      [
        { x: w.minX, y: w.minY },
        { x: w.maxX, y: w.minY },
        { x: w.maxX, y: w.maxY },
        { x: w.minX, y: w.maxY },
      ],
      true,
    ),
    { friction: 0 },
  );
  for (const prop of layout.props) {
    const body = world.createBody({ position: { x: prop.x, y: prop.y } });
    body.createFixture(new BoxShape(prop.halfWidth, prop.halfDepth), { friction: 0 });
  }
  // Carts are kinematic: the rail sim moves them, Planck only makes the bean bump into them.
  const carts = new Map<string, Body>();
  for (const c of layout.rail?.carts ?? []) {
    const body = world.createKinematicBody({ position: { x: c.x, y: layout.rail?.y ?? 0 } });
    body.createFixture(new BoxShape(CART_HALF_LENGTH, CART_HALF_DEPTH), { friction: 0 });
    carts.set(c.id, body);
  }
  const bean = world.createDynamicBody({ position: layout.start, fixedRotation: true, allowSleep: false });
  bean.createFixture(new CircleShape(HUB_BEAN_RADIUS_M), { density: 1, friction: 0, restitution: 0 });
  return { world, bean, carts };
}

/**
 * Exact vertical motion under constant gravity, with the touchdown solved inside the step
 * (same method as the drop scenario).
 */
function stepHeight(bean: HubBean, g: number, tick: number): void {
  if (bean.grounded) return;
  const dt = FIXED_DT;
  const z = bean.z + bean.vz * dt - 0.5 * g * dt * dt;
  if (z > 0) {
    bean.z = z;
    bean.vz -= g * dt;
    if (bean.lastJump) bean.lastJump.peakZ = Math.max(bean.lastJump.peakZ, z);
    return;
  }
  const tau = (bean.vz + Math.sqrt(bean.vz * bean.vz + 2 * g * bean.z)) / g;
  if (bean.lastJump) bean.lastJump.landedAt = ticksToSeconds(tick) + tau;
  bean.z = 0;
  bean.vz = 0;
  bean.grounded = true;
}

function initialBean(start: { x: number; y: number }): HubBean {
  return {
    x: start.x,
    y: start.y,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: true,
    facingX: 0,
    facingY: -1, // towards the camera
    target: null,
    stuckSteps: 0,
    jumps: 0,
    lastJump: null,
    riding: null,
    pushing: null,
  };
}

function initialRail(rail: RailLayout | null): HubRailState | null {
  if (!rail) return null;
  return { carts: rail.carts.map((c) => ({ id: c.id, mass: c.mass, riderMass: 0, x: c.x, v: 0 })), collisions: [] };
}

/**
 * The cart the bean pushes this step, if any: on the ground, inside the rail's band (so it
 * touches an end, not a long side), against that end, and moving towards the cart along the
 * rail. Coming from the north or south, the cart's footprint just blocks the bean.
 */
function findPush(bean: HubBean, rail: RailLayout, carts: RailCart[], vx: number, vy: number, run: boolean): RailPush | null {
  const speed = Math.hypot(vx, vy);
  if (!bean.grounded || speed === 0 || Math.abs(bean.y - rail.y) > CART_HALF_DEPTH) return null;
  for (const c of carts) {
    const side = bean.x < c.x ? -1 : 1;
    const gap = Math.abs(bean.x - c.x) - (CART_HALF_LENGTH + HUB_BEAN_RADIUS_M);
    if (gap > PUSH_REACH_M || (-side * vx) / speed < PUSH_MIN_ALONG) continue;
    return { cart: c.id, dir: side < 0 ? 1 : -1, run };
  }
  return null;
}

/** One scenario instance per Sim: it owns that sim's Planck world. */
export function createHubScenario(options: HubOptions = {}): Scenario<HubState, HubCommand> {
  const layout: PlazaLayout = structuredCloneLayout(options.layout ?? DEFAULT_PLAZA);
  if (options.start) layout.start = { ...options.start };
  const gravity = options.gravity ?? EARTH_GRAVITY;
  const { world, bean: body, carts: cartBodies } = buildWorld(layout);

  /** Hop out to the south of the rail; the cart keeps the momentum (v·(m+M)/m). */
  const getOut = (state: HubState) => {
    const bean = state.bean;
    const cart = state.rail?.carts.find((c) => c.id === bean.riding);
    bean.riding = null;
    if (!cart || !state.layout.rail) return;
    leaveCart(cart);
    const exit = clampTarget(state.layout.walkable, cart.x, state.layout.rail.y - EXIT_OFFSET_M);
    bean.x = exit.x;
    bean.y = exit.y;
    bean.vx = 0;
    bean.vy = 0;
  };
  /** Hop into the ridable cart if it is near (v·m/(m+M)). */
  const getIn = (state: HubState) => {
    const bean = state.bean;
    const rail = state.layout.rail;
    if (!rail || !state.rail || !bean.grounded) return;
    for (const spec of rail.carts) {
      const cart = state.rail.carts.find((c) => c.id === spec.id);
      if (!spec.ridable || !cart || Math.hypot(bean.x - cart.x, bean.y - rail.y) > BOARD_REACH_M) continue;
      boardCart(cart, HUB_BEAN_MASS_KG);
      bean.riding = cart.id;
      bean.target = null;
      bean.stuckSteps = 0;
      return;
    }
  };

  return {
    name: 'hub',
    init: () => ({
      layout,
      gravity,
      input: { x: 0, y: 0, run: false },
      bean: initialBean(layout.start),
      rail: initialRail(layout.rail),
    }),
    step(state, commands) {
      const bean = state.bean;
      for (const c of commands) {
        // Commands will one day arrive over the network: drop any with non-finite numbers.
        if ((c.type === 'move' || c.type === 'moveTo') && !(Number.isFinite(c.x) && Number.isFinite(c.y))) continue;
        if (c.type === 'move') {
          state.input = { x: c.x, y: c.y, run: c.run };
        } else if (c.type === 'moveTo') {
          bean.target = clampTarget(state.layout.walkable, c.x, c.y);
          bean.stuckSteps = 0;
        } else if ((c.type === 'jump' || c.type === 'action') && bean.riding) {
          getOut(state);
        } else if (c.type === 'action') {
          getIn(state);
        } else if (c.type === 'jump' && bean.grounded) {
          bean.grounded = false;
          bean.vz = HUB_JUMP_SPEED;
          bean.jumps += 1;
          bean.lastJump = { startedAt: ticksToSeconds(state.tick), landedAt: null, peakZ: 0 };
        }
      }

      // Desired ground velocity. Held keys win over a tap target and cancel it.
      const speed = state.input.run ? HUB_RUN_SPEED : HUB_WALK_SPEED;
      let vx = 0;
      let vy = 0;
      let targetDistance = 0;
      let intended = 0;
      const held = Math.hypot(state.input.x, state.input.y);
      if (held > 0) {
        bean.target = null;
        bean.stuckSteps = 0;
        // Normalise so diagonals are no faster; partial stick input moves proportionally slower.
        const scale = held > 1 ? speed / held : speed;
        vx = state.input.x * scale;
        vy = state.input.y * scale;
      } else if (bean.target) {
        const dx = bean.target.x - bean.x;
        const dy = bean.target.y - bean.y;
        targetDistance = Math.hypot(dx, dy);
        intended = Math.min(speed * FIXED_DT, targetDistance);
        if (targetDistance > 0) {
          // On the last step, arrive exactly instead of overshooting.
          const v = intended / FIXED_DT;
          vx = (dx / targetDistance) * v;
          vy = (dy / targetDistance) * v;
        }
      }
      if (bean.riding) {
        vx = 0;
        vy = 0;
        bean.target = null;
      }

      // Carts first, in the exact 1D rail sim, with the bean's push if it walks into an end.
      const railLayout = state.layout.rail;
      const railY = railLayout?.y ?? 0;
      const carts = state.rail?.carts ?? [];
      const push = railLayout && !bean.riding ? findPush(bean, railLayout, carts, vx, vy, state.input.run) : null;
      bean.pushing = push;
      const cartsBefore = carts.map((c) => c.x);
      if (railLayout && state.rail) {
        const hits = stepRail(railLayout, carts, push, ticksToSeconds(state.tick), FIXED_DT);
        if (hits.length) state.rail.collisions = [...state.rail.collisions, ...hits].slice(-COLLISION_LOG);
      }
      // Each kinematic cart body sweeps from where it was to where the rail put it, so Planck
      // shoves the bean out of its way.
      carts.forEach((c, i) => {
        const from = cartsBefore[i] ?? c.x;
        cartBodies.get(c.id)?.setTransform({ x: from, y: railY }, 0);
        cartBodies.get(c.id)?.setLinearVelocity({ x: (c.x - from) / FIXED_DT, y: 0 });
      });

      const pushed = push ? carts.find((c) => c.id === push.cart) : undefined;
      if (push) {
        // Pushing forces the side view (DESIGN.md §6).
        bean.facingX = push.dir;
        bean.facingY = 0;
      } else if (vx !== 0 || vy !== 0) {
        const len = Math.hypot(vx, vy);
        bean.facingX = vx / len;
        bean.facingY = vy / len;
      }

      // Ground motion and collisions (Planck), from the state. A rider does not collide.
      body.setActive(!bean.riding);
      body.setTransform({ x: bean.x, y: bean.y }, 0);
      body.setLinearVelocity(pushed ? { x: pushed.v, y: 0 } : { x: vx, y: vy });
      body.setAwake(true);
      world.step(FIXED_DT, 8, 3);
      for (const c of carts) {
        cartBodies.get(c.id)?.setTransform({ x: c.x, y: railY }, 0);
        cartBodies.get(c.id)?.setLinearVelocity({ x: 0, y: 0 });
      }
      const ridden = bean.riding ? carts.find((c) => c.id === bean.riding) : undefined;
      if (ridden) {
        bean.x = ridden.x;
        bean.y = railY;
        bean.vx = ridden.v;
        bean.vy = 0;
        if (Math.abs(ridden.v) > 0.3) {
          bean.facingX = Math.sign(ridden.v);
          bean.facingY = 0;
        }
      } else if (pushed && push) {
        // The bean keeps against the end it pushes, moving with the cart.
        bean.x = pushed.x - push.dir * (CART_HALF_LENGTH + HUB_BEAN_RADIUS_M);
        bean.vx = pushed.v;
        bean.vy = 0;
      } else {
        const p = body.getPosition();
        const v = body.getLinearVelocity();
        bean.x = p.x;
        bean.y = p.y;
        bean.vx = v.x;
        bean.vy = v.y;
      }

      // Tap target: arrived, making progress, or stuck.
      if (bean.target) {
        const remaining = Math.hypot(bean.target.x - bean.x, bean.target.y - bean.y);
        if (remaining <= ARRIVE_EPSILON) {
          bean.target = null;
          bean.stuckSteps = 0;
        } else if (!push && targetDistance - remaining < STUCK_PROGRESS * intended) {
          bean.stuckSteps += 1;
          if (remaining <= ARRIVE_BLOCKED_M || bean.stuckSteps >= HUB_STUCK_STEPS) {
            bean.target = null;
            bean.stuckSteps = 0;
          }
        } else {
          bean.stuckSteps = 0;
        }
      }

      stepHeight(bean, state.gravity, state.tick);
    },
  };
}

function structuredCloneLayout(layout: PlazaLayout): PlazaLayout {
  return {
    walkable: { ...layout.walkable },
    props: layout.props.map((p) => ({ ...p })),
    start: { ...layout.start },
    rail: layout.rail ? { ...layout.rail, carts: layout.rail.carts.map((c) => ({ ...c })) } : null,
  };
}
