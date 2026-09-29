import { CART_FLOOR_M, SIM_HZ, type HubAct, type HubActKind, type HubState } from '@beananza/sim';
import { LAND_DURATION, type ClipName } from '../rig/clips';
import type { ActClip } from '../rig/player';

/**
 * How each interaction state (D21) looks: one row per act kind, so the hub scene has no
 * per-case drawing code. The sim decides what the bean does; this table only decides the clip,
 * which parts show, and where the bean draws relative to the prop it is using. Every row is a
 * function of sim state and animation time only.
 */

/** Parts some act turns on; every other act hides them again. */
export const TOGGLED_PARTS = ['arm-far-push'] as const;
export type ToggledPart = (typeof TOGGLED_PARTS)[number];

/** Where the bean draws. */
export type Placement =
  /** On the ground at its sim position, sorted by its ground row. */
  | { kind: 'ground' }
  /**
   * In a cart: drawn between the cart's back and front, and below the rim only inside the
   * cart's front (the rider is wider than the cart, D23).
   */
  | { kind: 'cart'; cart: string };

export interface Presentation {
  /** The act's own clip, or null for the ground clips chosen from motion (walk, run, …). */
  clip: ActClip | null;
  /** The toggled parts this act shows. */
  shows: readonly ToggledPart[];
  placement: Placement;
  /** Draw the ground shadow. */
  shadow: boolean;
  /**
   * How much of the draw-back from cart ends applies (0..1): the body is wider than the
   * footprint, so next to a cart's end it is drawn back. A hop into a cart fades it out.
   */
  standOffCarts: number;
  /** The cart the bean is using (getting in, riding, getting out): its readout moves up. */
  usingCart: string | null;
  /**
   * During a hop, the height (m) without the arc: under reduced motion the bean moves in a
   * straight line instead. Null when not hopping.
   */
  flatZ: number | null;
}

/** Pushing a cart this heavy or heavier plays the heavy push (lean 16°, slower steps). */
export const HEAVY_PUSH_KG = 10;
/** The jump and fall clips each cover 0.4 s (take-off to apex, apex to touchdown). */
const AIR_CLIP_S = 0.4;

/** Progress through a hop at animation time `time` (s): 0..1. */
export function hopAt(time: number, startTick: number, endTick: number): number {
  return Math.min(Math.max((time * SIM_HZ - startTick) / (endTick - startTick), 0), 1);
}

/** The jump clip up to the top of the hop, the fall clip after it. */
function hopClip(p: number): ActClip {
  return p < 0.5 ? { clip: 'jump', t: (p / 0.5) * AIR_CLIP_S, first: true } : { clip: 'fall', t: ((p - 0.5) / 0.5) * AIR_CLIP_S, first: true };
}

const GROUND: Omit<Presentation, 'clip'> = {
  shows: [],
  placement: { kind: 'ground' },
  shadow: true,
  standOffCarts: 1,
  usingCart: null,
  flatZ: null,
};

type Row<K extends HubActKind> = (act: Extract<HubAct, { kind: K }>, state: HubState, time: number) => Presentation;

const PRESENTATION: { [K in HubActKind]: Row<K> } = {
  free: () => ({ ...GROUND, clip: null }),
  pushing: (act, state, time) => {
    const cart = state.rail?.carts.find((c) => c.id === act.cart);
    const clip: ClipName = (cart?.mass ?? 0) >= HEAVY_PUSH_KG ? 'pushHeavy' : 'push';
    return { ...GROUND, clip: { clip, t: time }, shows: ['arm-far-push'] };
  },
  // A crouch, then a hop that is over the cart (and drawn in it) from its top onwards.
  boarding: (act, _state, time) => {
    const crouching = time * SIM_HZ < act.hopTick;
    const p = hopAt(time, act.hopTick, act.endTick);
    return {
      clip: crouching ? { clip: 'jump', t: 0, first: true } : hopClip(p),
      shows: [],
      placement: p >= 0.5 ? { kind: 'cart', cart: act.cart } : { kind: 'ground' },
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
      shows: [],
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
      shows: [],
      placement: p < 0.5 ? { kind: 'cart', cart: act.cart } : { kind: 'ground' },
      shadow: true,
      standOffCarts: 0,
      usingCart: act.cart,
      flatZ: CART_FLOOR_M * (1 - p),
    };
  },
};

/** The row for the bean's act, at animation time `time` (sim seconds, interpolated). */
export function presentAct(act: HubAct, state: HubState, time: number): Presentation {
  return (PRESENTATION[act.kind] as Row<HubActKind>)(act, state, time);
}
