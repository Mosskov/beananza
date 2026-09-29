import { CART_FLOOR_M, CART_HALF_LENGTH, SIM_HZ, type CartActKind } from '@beananza/sim';
import { LAND_DURATION, type ClipName } from '../../rig/clips';
import { GROUND, hopAt, hopClip, type Rows } from './common';

/** Pushing a cart this heavy or heavier plays the heavy push (lean 16°, slower steps). */
export const HEAVY_PUSH_KG = 10;

/** How the bean looks pushing, getting into, riding and getting out of a cart (D23). */
export const CART_ROWS: Rows<CartActKind> = {
  pushing: (act, state, time) => {
    const cart = state.rail?.carts.find((c) => c.id === act.cart);
    const clip: ClipName = (cart?.mass ?? 0) >= HEAVY_PUSH_KG ? 'pushHeavy' : 'push';
    return { ...GROUND, clip: { clip, t: time }, parts: { 'arm-far-push': true } };
  },
  // A crouch, then a hop that is drawn in the cart (and masked by it) once it is past its top and
  // over the cart; before that the mask would cut the bean off in empty air beside the cart.
  boarding: (act, state, time) => {
    const crouching = time * SIM_HZ < act.hopTick;
    const p = hopAt(time, act.hopTick, act.endTick);
    const cart = state.rail?.carts.find((c) => c.id === act.cart);
    const over = cart !== undefined && Math.abs(state.bean.x - cart.x) <= CART_HALF_LENGTH;
    return {
      clip: crouching ? { clip: 'jump', t: 0, first: true } : hopClip(p),
      parts: {},
      placement: p >= 0.5 && over ? { kind: 'cart', cart: act.cart } : { kind: 'ground' },
      shadow: true,
      standOffCarts: Math.max(0, 1 - 2 * p),
      usingCart: act.cart,
      flatZ: CART_FLOOR_M * p,
    };
  },
  // A rider stands still in the cart (idle), whatever the cart does, after a landing squash.
  riding: (act, _state, time) => {
    const since = time - act.since / SIM_HZ;
    return {
      clip: since < LAND_DURATION ? { clip: 'land', t: Math.max(0, since), first: true } : { clip: 'idle', t: time },
      parts: {},
      placement: { kind: 'cart', cart: act.cart },
      shadow: false,
      standOffCarts: 0,
      usingCart: act.cart,
      flatZ: null,
    };
  },
  leaving: (act, _state, time) => {
    const p = hopAt(time, act.startTick, act.endTick);
    return {
      clip: hopClip(p),
      parts: {},
      placement: p < 0.5 ? { kind: 'cart', cart: act.cart } : { kind: 'ground' },
      shadow: true,
      standOffCarts: 0,
      usingCart: act.cart,
      flatZ: CART_FLOOR_M * (1 - p),
    };
  },
};
