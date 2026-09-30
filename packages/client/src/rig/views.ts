/**
 * The bean's drawn views and how the sim's facing picks one (D12, characters; DESIGN.md §6).
 * Five views are drawn; front ¾, side and back ¾ are mirrored for the other side, giving 8
 * directions. Parts that are not symmetric get their own drawing for the mirrored directions
 * (`art/bean/<view>-left.svg`), so cosmetics never jump from one side of the bean to the other.
 */

export const VIEWS = ['front', 'front-34', 'side', 'back-34', 'back'] as const;
export type BeanView = (typeof VIEWS)[number];

/** Views that are mirrored for the other side, and so have a `-left` drawing for asymmetric parts. */
export const MIRRORED_VIEWS: readonly BeanView[] = ['front-34', 'side', 'back-34'];

export interface ViewChoice {
  view: BeanView;
  /** Draw the view flipped horizontally (facing screen-left). */
  mirrored: boolean;
}

/** The 8 directions by compass name, as sim facings (x east, y north), S first as in the galleries. */
export const COMPASS: readonly (readonly [name: string, x: number, y: number])[] = [
  ['S', 0, -1],
  ['SE', Math.SQRT1_2, -Math.SQRT1_2],
  ['E', 1, 0],
  ['NE', Math.SQRT1_2, Math.SQRT1_2],
  ['N', 0, 1],
  ['NW', -Math.SQRT1_2, Math.SQRT1_2],
  ['W', -1, 0],
  ['SW', -Math.SQRT1_2, -Math.SQRT1_2],
];

/**
 * Directions picked by a list of compass names (`S,E`) or view names (`side`: both directions
 * that draw it), or `all`. Throws on an unknown name. In compass order.
 */
export function pickDirections(spec: string): { name: string; facing: [number, number]; choice: ViewChoice }[] {
  const all = COMPASS.map(([name, x, y]) => ({ name, facing: [x, y] as [number, number], choice: viewForFacing(x, y) }));
  if (spec.trim() === '' || spec.trim() === 'all') return all;
  const wanted = spec.split(',').map((s) => s.trim()).filter(Boolean);
  for (const w of wanted) {
    if (!all.some((d) => d.name === w.toUpperCase()) && !(VIEWS as readonly string[]).includes(w)) {
      throw new Error(`unknown view or direction "${w}" (directions: ${all.map((d) => d.name).join(', ')}; views: ${VIEWS.join(', ')})`);
    }
  }
  return all.filter((d) => wanted.some((w) => w.toUpperCase() === d.name || w === d.choice.view));
}

/**
 * Screen angle of a sim facing, in degrees. The sim's ground plane has x east and y north
 * (D15) and north draws up the screen, so screen coordinates (y down) are (x, −y).
 * 0° is east (screen right), +90° south (towards the camera), −90° north.
 */
export function screenAngleDeg(facingX: number, facingY: number): number {
  return (Math.atan2(-facingY, facingX) * 180) / Math.PI;
}

/**
 * The view for a facing, per the table in DESIGN.md §6. An angle exactly on a boundary goes to
 * the range further from the east-west axis (towards the front or back views): 22.5° is
 * front ¾, 67.5° is front, 157.5° is front ¾ mirrored, and the same for the back. Angles are
 * rounded to 1e-9° first so a facing built from cos/sin of a boundary lands on it. A zero
 * facing shows the front.
 */
export function viewForFacing(facingX: number, facingY: number): ViewChoice {
  if (facingX === 0 && facingY === 0) return { view: 'front', mirrored: false };
  const a = Math.round(screenAngleDeg(facingX, facingY) * 1e9) / 1e9;
  const abs = Math.abs(a);
  const south = a > 0;
  if (abs < 22.5) return { view: 'side', mirrored: false };
  if (abs > 157.5) return { view: 'side', mirrored: true };
  if (abs >= 67.5 && abs <= 112.5) return { view: south ? 'front' : 'back', mirrored: false };
  // The ¾ views: right half (22.5..67.5) unmirrored, left half (112.5..157.5) mirrored.
  return { view: south ? 'front-34' : 'back-34', mirrored: abs > 90 };
}

/**
 * Effect slots (D26): effects are drawn apart from the bean (`art/effects/`, contract in
 * `art/effect-contract.ts`) and placed at one of the view's effect anchors. Clips move and scale
 * an effect in its slot about the anchor. The head and brow slots ride with the body (bob,
 * squash); the ground slot stays on the ground like the feet.
 *
 * Derived effects (D26) get no sim field: the sweat on `fxBrow` reads the `pushing` row
 * (`presentation/cart.ts`, `HEAVY_PUSH_KG`), the dust on `fxGround` reads `lastJump.landedAt`
 * (`player.ts`), and Thinking on `fxHead` will read the pending prediction once D9 exists.
 */
export const EFFECT_SLOTS = ['fxHead', 'fxBrow', 'fxGround'] as const;
export type EffectSlot = (typeof EFFECT_SLOTS)[number];

/** The anchor (`EFFECT_ANCHORS`, in each bean view's file) each effect slot sits at. */
export const EFFECT_SLOT_ANCHORS: Readonly<Record<EffectSlot, (typeof EFFECT_ANCHORS)[number]>> = {
  fxHead: 'fx-head',
  fxBrow: 'fx-brow',
  fxGround: 'fx-ground',
};

/** Rig slots the animation clips drive, and which drawn part fills each slot in each view. */
export const SLOTS = ['body', 'footA', 'footB', 'armA', 'armB', 'eyes', 'tail', ...EFFECT_SLOTS] as const;
export type Slot = (typeof SLOTS)[number];

type PartSlot = Exclude<Slot, 'body' | EffectSlot>;

export const SLOT_PARTS: Readonly<Record<BeanView, Readonly<Record<PartSlot, string>>>> = {
  front: { footA: 'foot-left', footB: 'foot-right', armA: 'arm-left', armB: 'arm-right', eyes: 'eyes', tail: 'scarf-tail' },
  back: { footA: 'foot-left', footB: 'foot-right', armA: 'arm-left', armB: 'arm-right', eyes: 'eyes', tail: 'scarf-tail' },
  'front-34': { footA: 'foot-near', footB: 'foot-far', armA: 'arm-near', armB: 'arm-far', eyes: 'eyes', tail: 'scarf-tail' },
  'back-34': { footA: 'foot-near', footB: 'foot-far', armA: 'arm-near', armB: 'arm-far', eyes: 'eyes', tail: 'scarf-tail' },
  side: { footA: 'foot-near', footB: 'foot-far', armA: 'arm-near', armB: 'arm-far-push', eyes: 'eyes', tail: 'scarf-tail' },
};

/** Parts every view must have (the art contract checks this). */
export const REQUIRED_PARTS: Readonly<Record<BeanView, readonly string[]>> = {
  front: ['shadow', 'foot-left', 'foot-right', 'arm-left', 'arm-right', 'body', 'belly', 'scarf', 'scarf-tail', 'eyes', 'mouth'],
  back: ['shadow', 'foot-left', 'foot-right', 'arm-left', 'arm-right', 'body', 'scarf', 'scarf-tail'],
  'front-34': ['shadow', 'foot-near', 'foot-far', 'arm-near', 'arm-far', 'body', 'belly', 'scarf', 'scarf-tail', 'eyes', 'mouth'],
  'back-34': ['shadow', 'foot-near', 'foot-far', 'arm-near', 'arm-far', 'body', 'scarf', 'scarf-tail'],
  side: ['shadow', 'foot-near', 'foot-far', 'arm-near', 'arm-far-push', 'body', 'belly', 'scarf', 'scarf-tail', 'eyes', 'mouth'],
};

/**
 * Where effects are placed on the bean (D26, D22): every view has these three anchors, each in
 * the view's own frame (mirrored views mirror x). `fx-head` is above and beside the head (the
 * doze "z"), `fx-brow` on the brow (sweat), `fx-ground` on the ground between the feet (dust).
 * They may lie outside the body, so the body-outline check skips them (`checks.ts`).
 */
export const EFFECT_ANCHORS = ['fx-head', 'fx-brow', 'fx-ground'] as const;

/**
 * Anchors every view must have (D22): `headwear` at the top of the body; in the side view,
 * `lean`, the point whose forward tip the pushing stand-off adds; and the effect anchors.
 */
export const REQUIRED_ANCHORS: Readonly<Record<BeanView, readonly string[]>> = {
  front: ['headwear', ...EFFECT_ANCHORS],
  'front-34': ['headwear', ...EFFECT_ANCHORS],
  side: ['headwear', 'lean', ...EFFECT_ANCHORS],
  'back-34': ['headwear', ...EFFECT_ANCHORS],
  back: ['headwear', ...EFFECT_ANCHORS],
};

/**
 * Hidden unless something turns them on: earned goggles (catapult), the far arm (pushing), the
 * closed eyes (dozing) and the reaction faces (`REACTION_PARTS`). Effects (`art/effects/`, such
 * as the doze "z") are all hidden until turned on, without being listed here.
 */
export const HIDDEN_BY_DEFAULT: ReadonlySet<string> = new Set([
  'headwear-goggles',
  'arm-far-push',
  'eyes-sleep',
  'eyes-happy',
  'mouth-open',
  'eyes-squeeze',
  'mouth-wavy',
  'eye-spiral-a',
  'eye-spiral-b',
]);

/** Feet stay on the ground; every other part moves with the body (bob, squash, lean). */
export function isGroundPart(partId: string): boolean {
  return partId.startsWith('foot-');
}

/**
 * How far a part reaches west and east of the feet on screen (art units), from its drawn
 * x-range [x0, x1] in the view's own frame. Mirroring flips the range to [−x1, −x0].
 */
export function screenReach(x0: number, x1: number, mirrored: boolean): { west: number; east: number } {
  return mirrored ? { west: x1, east: -x0 } : { west: -x0, east: x1 };
}

/** The ground shadow is drawn by the scene on the ground layer, not by the rig. */
export const SHADOW_PART = 'shadow';
