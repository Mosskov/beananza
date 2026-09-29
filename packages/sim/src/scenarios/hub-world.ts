import type { SimStateBase } from '../sim';
import { SIM_HZ } from '../time';
import { EARTH_GRAVITY } from '../constants';
import type { Rail, RailCart, RailCollision } from '../rail';

/**
 * The hub's data: layout, state, commands and the numbers every part of the hub shares. The
 * scenario (`hub.ts`) runs the world; the interaction modules (`../interactions/`) own what the
 * bean does with things in it (D21).
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
/**
 * Footprint radius of every bean body form (cosmetics never change the collider).
 * About the width of the bean's feet (D18 keeps it).
 */
export const HUB_BEAN_RADIUS_M = 0.25;
/** The bean's mass (D18): what riding adds to a cart. */
export const HUB_BEAN_MASS_KG = 20;
/** Half a cart's north-south size (m): its footprint on the ground is 0.8 × 0.4 m. */
export const CART_HALF_DEPTH = 0.2;
/**
 * Height of the cart floor a rider stands on (m), above the rail's centre line. The cart
 * drawing's `floor` anchor must agree (a test checks it).
 */
export const CART_FLOOR_M = 0.1;

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

/**
 * What the bean is doing with the world (D21). One state at a time, plain JSON. `free` walks,
 * runs and jumps under the hub's rules; every other state belongs to one interaction module,
 * which owns its commands, timed transitions, position and facing.
 */
export type HubAct =
  | { kind: 'free' }
  /** Walking into a cart's end: re-derived every step from the push rule. */
  | { kind: 'pushing'; cart: string; dir: 1 | -1; run: boolean }
  /** Standing in a cart. */
  | { kind: 'riding'; cart: string };

export type HubActKind = HubAct['kind'];

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
  /** The interaction state (D21). */
  act: HubAct;
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

/** Whether the bean walks under the hub's own rules (input, Planck) in this state. */
export const actWalks = (act: HubAct): boolean => act.kind === 'free' || act.kind === 'pushing';
