import { CART_HALF_LENGTH, boardCart, leaveCart, type RailCart } from '../rail';
import {
  CART_HALF_DEPTH,
  HUB_BEAN_MASS_KG,
  HUB_BEAN_RADIUS_M,
  clampTarget,
  type HubAct,
  type HubBean,
  type HubState,
  type RailLayout,
} from '../scenarios/hub-world';
import type { HubInteraction, HubStep, Velocity } from './types';

/**
 * The bean and the carts (DESIGN.md §7): it pushes a cart by walking into one of its ends, and
 * E (the `action` command) gets in or out of the cart that can be ridden; Space also gets out.
 * The carts themselves move in the exact rail sim (`rail.ts`), which the hub steps.
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

const cartById = (state: HubState, id: string): RailCart | undefined => state.rail?.carts.find((c) => c.id === id);

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

/** Hop out to the south of the rail; the cart keeps the momentum (v·(m+M)/m). */
function getOut(state: HubState, cartId: string): void {
  const bean = state.bean;
  const cart = cartById(state, cartId);
  bean.act = { kind: 'free' };
  if (!cart || !state.layout.rail) return;
  leaveCart(cart);
  const exit = clampTarget(state.layout.walkable, cart.x, state.layout.rail.y - EXIT_OFFSET_M);
  bean.x = exit.x;
  bean.y = exit.y;
  bean.vx = 0;
  bean.vy = 0;
}

/** Hop into the ridable cart if it is near (v·m/(m+M)). */
function getIn(state: HubState): void {
  const bean = state.bean;
  const rail = state.layout.rail;
  if (!rail || !state.rail || !bean.grounded) return;
  for (const spec of rail.carts) {
    const cart = cartById(state, spec.id);
    if (!spec.ridable || !cart || Math.hypot(bean.x - cart.x, bean.y - rail.y) > BOARD_REACH_M) continue;
    boardCart(cart, HUB_BEAN_MASS_KG);
    bean.act = { kind: 'riding', cart: cart.id };
    bean.target = null;
    bean.stuckSteps = 0;
    return;
  }
}

export const cartInteraction: HubInteraction = {
  name: 'cart',
  acts: ['pushing', 'riding'],

  command({ state }: HubStep, command) {
    const act = state.bean.act;
    if (act.kind === 'riding' && (command.type === 'jump' || command.type === 'action')) {
      getOut(state, act.cart);
      return true;
    }
    if (command.type === 'action') {
      getIn(state);
      return true;
    }
    return false;
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
    if (act.kind === 'riding') {
      const cart = cartById(state, act.cart);
      if (!cart) return;
      bean.x = cart.x;
      bean.y = railY;
      bean.vx = cart.v;
      bean.vy = 0;
    } else if (act.kind === 'pushing') {
      const cart = cartById(state, act.cart);
      if (!cart) return;
      // The bean keeps against the end it pushes, moving with the cart.
      bean.x = cart.x - act.dir * (CART_HALF_LENGTH + HUB_BEAN_RADIUS_M);
      bean.vx = cart.v;
      bean.vy = 0;
    }
  },

  facing({ state }: HubStep) {
    const act = state.bean.act;
    // Pushing forces the side view (DESIGN.md §6).
    if (act.kind === 'pushing') return { x: act.dir, y: 0 };
    if (act.kind !== 'riding') return null;
    const v = cartById(state, act.cart)?.v ?? 0;
    if (Math.abs(v) > RIDE_FACE_TRAVEL_SPEED) return { x: Math.sign(v), y: 0 };
    if (Math.abs(v) < RIDE_FACE_FRONT_SPEED) return { x: 0, y: -1 };
    return null;
  },
};
