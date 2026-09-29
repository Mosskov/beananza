import { CART_HALF_LENGTH, boardCart, leaveCart, totalMass, type RailCart } from '../rail';
import { ticksToSeconds } from '../time';
import {
  CART_FLOOR_M,
  CART_HALF_DEPTH,
  HUB_BEAN_MASS_KG,
  HUB_BEAN_RADIUS_M,
  actWalks,
  clampTarget,
  type HubAct,
  type HubBean,
  type HubState,
  type RailLayout,
  type RiderEvent,
} from '../scenarios/hub-world';
import { hopHeight, hopProgress, lerp, ticksFor } from './hop';
import type { HubInteraction, HubStep, Velocity } from './types';

/**
 * The bean and the carts (DESIGN.md §7): it pushes a cart by walking into one of its ends, and
 * E (the `action` command) hops into the cart that can be ridden and out again; Space also
 * gets out. The carts themselves move in the exact rail sim (`rail.ts`), which the hub steps.
 */

/** The bean pushes when its footprint is this close to a cart's end (m); Planck keeps a skin. */
const PUSH_REACH_M = 0.03;
/** A move pushes when at least this share of its direction points along the rail at the cart. */
const PUSH_MIN_ALONG = 0.35;
/** E gets into the ridable cart from up to this far from its centre (m). */
export const BOARD_REACH_M = 1.2;
/**
 * A rider faces the way the cart travels above this speed (m/s) and turns back to face the
 * camera below RIDE_FACE_FRONT_SPEED; in between it keeps its facing, so it never flickers.
 */
export const RIDE_FACE_TRAVEL_SPEED = 0.3;
export const RIDE_FACE_FRONT_SPEED = 0.1;
/** Getting out puts the bean this far south of the rail's centre line (m). */
const EXIT_OFFSET_M = CART_HALF_DEPTH + HUB_BEAN_RADIUS_M + 0.05;

// D23, the prototype's hop at 100 px = 1 m.
/** Getting in: a crouch (s) before the hop. */
export const BOARD_CROUCH_S = 0.12;
/** The hop in takes this long (s), plus BOARD_HOP_PER_M_S for every metre to the cart. */
export const BOARD_HOP_S = 0.32;
export const BOARD_HOP_PER_M_S = 1 / 9;
/** The hop in arcs this high (m) above the line from the ground to the floor, plus BOARD_ARC_PER_M per metre. */
export const BOARD_ARC_M = 0.3;
export const BOARD_ARC_PER_M = 0.3;
/** Getting out: a hop of this long (s) with this arc (m). */
export const LEAVE_HOP_S = 0.38;
export const LEAVE_ARC_M = 0.4;
/** Hopping in from further than this along the rail (m), the bean faces the cart sideways. */
export const BOARD_SIDE_FACING_M = 0.4;
/** Rider events kept in the state. */
const RIDER_LOG = 16;

const cartById = (state: HubState, id: string): RailCart | undefined => state.rail?.carts.find((c) => c.id === id);

function logRider(state: HubState, event: RiderEvent): void {
  if (state.rail) state.rail.riders = [...state.rail.riders, event].slice(-RIDER_LOG);
}

/**
 * The cart the bean pushes this step, if any: on the ground, inside the rail's band (so it
 * touches an end, not a long side), against that end, and moving towards the cart along the
 * rail. Coming from the north or south, the cart's footprint just blocks the bean.
 */
function findPush(bean: HubBean, rail: RailLayout, carts: RailCart[], vx: number, vy: number, run: boolean): HubAct | null {
  const speed = Math.hypot(vx, vy);
  if (!bean.grounded || speed === 0 || Math.abs(bean.y - rail.y) > CART_HALF_DEPTH) return null;
  for (const c of carts) {
    const side = bean.x < c.x ? -1 : 1;
    const gap = Math.abs(bean.x - c.x) - (CART_HALF_LENGTH + HUB_BEAN_RADIUS_M);
    if (gap > PUSH_REACH_M || (-side * vx) / speed < PUSH_MIN_ALONG) continue;
    return { kind: 'pushing', cart: c.id, dir: side < 0 ? 1 : -1, run };
  }
  return null;
}

/**
 * Take off from the cart (the step's start): the cart keeps the momentum, v·(m+M)/m, and the
 * bean hops to the south of the rail.
 */
function getOut(state: HubState, cartId: string): void {
  const bean = state.bean;
  const cart = cartById(state, cartId);
  const rail = state.layout.rail;
  if (!cart || !rail) {
    bean.act = { kind: 'free' };
    return;
  }
  const before = { massBefore: totalMass(cart), vBefore: cart.v };
  leaveCart(cart);
  logRider(state, { kind: 'out', cart: cart.id, time: ticksToSeconds(state.tick), ...before, massAfter: totalMass(cart), vAfter: cart.v });
  const to = clampTarget(state.layout.walkable, cart.x, rail.y - EXIT_OFFSET_M);
  const startTick = state.tick;
  bean.act = { kind: 'leaving', cart: cart.id, startTick, endTick: startTick + ticksFor(LEAVE_HOP_S), fromX: bean.x, fromY: bean.y, toX: to.x, toY: to.y, arc: LEAVE_ARC_M };
  bean.vx = 0;
  bean.vy = 0;
}

/**
 * Start the hop into the ridable cart if it is near: a crouch, then a hop that lands in it.
 * Returns whether it did.
 */
function getIn(state: HubState): boolean {
  const bean = state.bean;
  const rail = state.layout.rail;
  if (!rail || !state.rail || !bean.grounded || !actWalks(bean.act)) return false;
  for (const spec of rail.carts) {
    const cart = cartById(state, spec.id);
    if (!spec.ridable || !cart) continue;
    const distance = Math.hypot(bean.x - cart.x, bean.y - rail.y);
    if (distance > BOARD_REACH_M) continue;
    const hopTick = state.tick + ticksFor(BOARD_CROUCH_S);
    const along = cart.x - bean.x;
    const sideways = Math.abs(along) > BOARD_SIDE_FACING_M;
    bean.act = {
      kind: 'boarding',
      cart: cart.id,
      startTick: state.tick,
      hopTick,
      endTick: hopTick + ticksFor(BOARD_HOP_S + distance * BOARD_HOP_PER_M_S),
      fromX: bean.x,
      fromY: bean.y,
      arc: BOARD_ARC_M + BOARD_ARC_PER_M * distance,
      facingX: sideways ? Math.sign(along) : 0,
      facingY: sideways ? 0 : -1,
    };
    bean.target = null;
    bean.stuckSteps = 0;
    bean.vx = 0;
    bean.vy = 0;
    return true;
  }
  return false;
}

export const cartInteraction: HubInteraction = {
  name: 'cart',
  acts: ['pushing', 'boarding', 'riding', 'leaving'],

  command({ state }: HubStep, command) {
    const act = state.bean.act;
    if (act.kind === 'boarding' || act.kind === 'leaving') {
      // Mid-hop: E, Space and taps do nothing. Held keys still count, so the bean walks on
      // once it lands.
      return command.type !== 'move';
    }
    if (act.kind === 'riding' && (command.type === 'jump' || command.type === 'action')) {
      getOut(state, act.cart);
      return true;
    }
    // E next to the cart gets in; elsewhere another interaction may use it.
    return command.type === 'action' && getIn(state);
  },

  drive({ state }: HubStep, desired: Velocity) {
    const bean = state.bean;
    if (bean.act.kind !== 'free' && bean.act.kind !== 'pushing') return;
    const rail = state.layout.rail;
    const push = rail && state.rail ? findPush(bean, rail, state.rail.carts, desired.vx, desired.vy, state.input.run) : null;
    bean.act = push ?? { kind: 'free' };
  },

  place({ state }: HubStep) {
    const bean = state.bean;
    const act = bean.act;
    const railY = state.layout.rail?.y ?? 0;
    if (act.kind === 'pushing') {
      const cart = cartById(state, act.cart);
      if (!cart) return;
      // The bean keeps against the end it pushes, moving with the cart.
      bean.x = cart.x - act.dir * (CART_HALF_LENGTH + HUB_BEAN_RADIUS_M);
      bean.vx = cart.v;
      bean.vy = 0;
    } else if (act.kind === 'boarding') {
      const cart = cartById(state, act.cart);
      if (!cart) {
        bean.act = { kind: 'free' };
        return;
      }
      // Lands wherever the cart is by then: the path bends towards a moving cart.
      const p = hopProgress(state.tick, act.hopTick, act.endTick);
      bean.x = lerp(act.fromX, cart.x, p);
      bean.y = lerp(act.fromY, railY, p);
      bean.z = hopHeight(p, 0, CART_FLOOR_M, act.arc);
      bean.vx = 0;
      bean.vy = 0;
      if (p < 1) return;
      // Touchdown at the end of this step: momentum with the bean at rest along the rail.
      const before = { massBefore: totalMass(cart), vBefore: cart.v };
      boardCart(cart, HUB_BEAN_MASS_KG);
      logRider(state, { kind: 'in', cart: cart.id, time: ticksToSeconds(state.tick + 1), ...before, massAfter: totalMass(cart), vAfter: cart.v });
      bean.act = { kind: 'riding', cart: cart.id, since: state.tick + 1 };
      bean.vx = cart.v;
    } else if (act.kind === 'riding') {
      const cart = cartById(state, act.cart);
      if (!cart) return;
      bean.x = cart.x;
      bean.y = railY;
      bean.z = CART_FLOOR_M;
      bean.vx = cart.v;
      bean.vy = 0;
    } else if (act.kind === 'leaving') {
      const p = hopProgress(state.tick, act.startTick, act.endTick);
      bean.x = lerp(act.fromX, act.toX, p);
      bean.y = lerp(act.fromY, act.toY, p);
      bean.z = hopHeight(p, CART_FLOOR_M, 0, act.arc);
      if (p < 1) return;
      bean.z = 0;
      bean.act = { kind: 'free' };
    }
  },

  facing({ state }: HubStep) {
    const act = state.bean.act;
    // Pushing forces the side view (DESIGN.md §6).
    if (act.kind === 'pushing') return { x: act.dir, y: 0 };
    if (act.kind === 'boarding') return { x: act.facingX, y: act.facingY };
    // Hopping out to the south, towards the camera.
    if (act.kind === 'leaving') return { x: 0, y: -1 };
    if (act.kind !== 'riding') return null;
    const v = cartById(state, act.cart)?.v ?? 0;
    if (Math.abs(v) > RIDE_FACE_TRAVEL_SPEED) return { x: Math.sign(v), y: 0 };
    if (Math.abs(v) < RIDE_FACE_FRONT_SPEED) return { x: 0, y: -1 };
    return null;
  },
};
