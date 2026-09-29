import { CART_FLOOR_M, DOZE_AFTER_S, SEAT_ARC_M, SIM_HZ, STAND_ARC_M, type HubAct, type HubActKind, type HubState } from '@beananza/sim';
import { LAND_DURATION, type ClipName } from '../rig/clips';
import type { ActClip } from '../rig/player';

/**
 * How each interaction state (D21) looks: one row per act kind, so the hub scene has no
 * per-case drawing code. The sim decides what the bean does; this table only decides the clip,
 * which parts show, and where the bean draws relative to the prop it is using. Every row is a
 * function of sim state and animation time only.
 */

/** Parts some act shows or hides, and how every other act draws them. */
export const PART_DEFAULTS = { 'arm-far-push': false, eyes: true, 'eyes-sleep': false, 'doze-z': false } as const;
export type ToggledPart = keyof typeof PART_DEFAULTS;

/** Where the bean draws. */
export type Placement =
  /** On the ground at its sim position, sorted by its ground row. */
  | { kind: 'ground' }
  /**
   * In a cart: drawn between the cart's back and front, and below the rim only inside the
   * cart's front (the rider is wider than the cart, D23).
   */
  | { kind: 'cart'; cart: string }
  /**
   * On a bench seat or hopping between it and its stand spot: `p` runs from the stand spot (0) to
   * the seat (1), with an arc (m) on top. The seat's point comes from the bench art's anchor.
   */
  | { kind: 'seat'; bench: string; seat: string; p: number; arc: number };

export interface Presentation {
  /** The act's own clip, or null for the ground clips chosen from motion (walk, run, …). */
  clip: ActClip | null;
  /** Parts this act shows or hides (others as PART_DEFAULTS). */
  parts: Partial<Record<ToggledPart, boolean>>;
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
  parts: {},
  placement: { kind: 'ground' },
  shadow: true,
  standOffCarts: 1,
  usingCart: null,
  flatZ: null,
};

/** On the bench: in front of it, no ground shadow (the bench's own shadow is there). */
const SEATED: Omit<Presentation, 'clip' | 'placement'> = { parts: {}, shadow: false, standOffCarts: 0, usingCart: null, flatZ: null };

type Row<K extends HubActKind> = (act: Extract<HubAct, { kind: K }>, state: HubState, time: number) => Presentation;

const PRESENTATION: { [K in HubActKind]: Row<K> } = {
  free: () => ({ ...GROUND, clip: null }),
  pushing: (act, state, time) => {
    const cart = state.rail?.carts.find((c) => c.id === act.cart);
    const clip: ClipName = (cart?.mass ?? 0) >= HEAVY_PUSH_KG ? 'pushHeavy' : 'push';
    return { ...GROUND, clip: { clip, t: time }, parts: { 'arm-far-push': true } };
  },
  // A crouch, then a hop that is over the cart (and drawn in it) from its top onwards.
  boarding: (act, _state, time) => {
    const crouching = time * SIM_HZ < act.hopTick;
    const p = hopAt(time, act.hopTick, act.endTick);
    return {
      clip: crouching ? { clip: 'jump', t: 0, first: true } : hopClip(p),
      parts: {},
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
  // Walking over to the bench: ordinary walking.
  approaching: () => ({ ...GROUND, clip: null }),
  seating: (act, _state, time) => {
    const p = hopAt(time, act.startTick, act.endTick);
    return { ...SEATED, clip: hopClip(p), placement: { kind: 'seat', bench: act.bench, seat: act.seat, p, arc: SEAT_ARC_M } };
  },
  // Feet dangle and swing; after DOZE_AFTER_S the bean dozes: eyes closed, a "z" floats up.
  sitting: (act, _state, time) => {
    const since = time - act.since / SIM_HZ;
    const placement: Placement = { kind: 'seat', bench: act.bench, seat: act.seat, p: 1, arc: 0 };
    if (since < LAND_DURATION) return { ...SEATED, clip: { clip: 'land', t: Math.max(0, since), first: true }, placement };
    if (since < DOZE_AFTER_S) return { ...SEATED, clip: { clip: 'sit', t: since, first: true }, placement };
    return {
      ...SEATED,
      clip: { clip: 'doze', t: since - DOZE_AFTER_S, first: true },
      parts: { eyes: false, 'eyes-sleep': true, 'doze-z': true },
      placement,
    };
  },
  standing: (act, _state, time) => {
    const q = hopAt(time, act.startTick, act.endTick);
    return { ...SEATED, clip: hopClip(q), placement: { kind: 'seat', bench: act.bench, seat: act.seat, p: 1 - q, arc: STAND_ARC_M } };
  },
};

/** The row for the bean's act, at animation time `time` (sim seconds, interpolated). */
export function presentAct(act: HubAct, state: HubState, time: number): Presentation {
  return (PRESENTATION[act.kind] as Row<HubActKind>)(act, state, time);
}
