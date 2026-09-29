import type { HubAct, HubActKind, HubState } from '@beananza/sim';
import type { ClipName } from '../rig/clips';

/**
 * How each interaction state (D21) looks: one row per act kind, so the hub scene has no
 * per-case drawing code. The sim decides what the bean does; this table only decides the clip,
 * which parts show, and where the bean draws relative to the prop it is using.
 */

/** Parts some act turns on; every other act hides them again. */
export const TOGGLED_PARTS = ['arm-far-push'] as const;
export type ToggledPart = (typeof TOGGLED_PARTS)[number];

/** Where the bean draws. */
export type Placement =
  /** On the ground at its sim position, sorted by its ground row. */
  | { kind: 'ground' }
  /** Standing on a cart's floor, drawn between the cart's back and front. */
  | { kind: 'cart'; cart: string };

export interface Presentation {
  /** The act's own clip, or null for the ground clips chosen from motion (walk, run, …). */
  clip: ClipName | null;
  /** The toggled parts this act shows. */
  shows: readonly ToggledPart[];
  placement: Placement;
  /** Draw the ground shadow. */
  shadow: boolean;
  /** Draw the body back from cart ends it would overlap (its footprint is narrower). */
  standOffCarts: boolean;
}

/** Pushing a cart this heavy or heavier plays the heavy push (lean 16°, slower steps). */
export const HEAVY_PUSH_KG = 10;

type Row<K extends HubActKind> = (act: Extract<HubAct, { kind: K }>, state: HubState) => Presentation;

const PRESENTATION: { [K in HubActKind]: Row<K> } = {
  free: () => ({ clip: null, shows: [], placement: { kind: 'ground' }, shadow: true, standOffCarts: true }),
  pushing: (act, state) => {
    const cart = state.rail?.carts.find((c) => c.id === act.cart);
    const heavy = (cart?.mass ?? 0) >= HEAVY_PUSH_KG;
    return { clip: heavy ? 'pushHeavy' : 'push', shows: ['arm-far-push'], placement: { kind: 'ground' }, shadow: true, standOffCarts: true };
  },
  // A rider stands still in the cart (idle), whatever the cart does.
  riding: (act) => ({ clip: 'idle', shows: [], placement: { kind: 'cart', cart: act.cart }, shadow: false, standOffCarts: false }),
};

export function presentAct(act: HubAct, state: HubState): Presentation {
  return (PRESENTATION[act.kind] as Row<HubActKind>)(act, state);
}
