import { SIM_HZ, type HubAct, type HubActKind, type HubBean, type HubState } from '@beananza/sim';
import type { ActClip } from '../../rig/player';

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
  /**
   * How far the bean has gone into a portal's swirl (0..1): it shrinks and fades out, and at 1 is
   * not drawn at all. Absent is 0 (fully there).
   */
  vanish?: number;
}

/** One row of the table: how an act of kind K looks at animation time `time`. */
export type Row<K extends HubActKind> = (act: Extract<HubAct, { kind: K }>, state: HubState, time: number, bean: HubBean) => Presentation;

/** A block of rows, one per act kind in K (an interaction's acts). */
export type Rows<K extends HubActKind> = { [P in K]: Row<P> };

/** The jump and fall clips each cover 0.4 s (take-off to apex, apex to touchdown). */
const AIR_CLIP_S = 0.4;

/** Progress through a hop at animation time `time` (s): 0..1. */
export function hopAt(time: number, startTick: number, endTick: number): number {
  return Math.min(Math.max((time * SIM_HZ - startTick) / (endTick - startTick), 0), 1);
}

/** The jump clip up to the top of the hop, the fall clip after it. */
export function hopClip(p: number): ActClip {
  return p < 0.5 ? { clip: 'jump', t: (p / 0.5) * AIR_CLIP_S, first: true } : { clip: 'fall', t: ((p - 0.5) / 0.5) * AIR_CLIP_S, first: true };
}

/** On the ground, as when walking freely. */
export const GROUND: Omit<Presentation, 'clip'> = {
  parts: {},
  placement: { kind: 'ground' },
  shadow: true,
  standOffCarts: 1,
  usingCart: null,
  flatZ: null,
};
