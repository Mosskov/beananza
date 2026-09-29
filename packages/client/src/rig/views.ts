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

/** Rig slots the animation clips drive, and which drawn part fills each slot in each view. */
export const SLOTS = ['body', 'footA', 'footB', 'armA', 'armB', 'eyes', 'tail'] as const;
export type Slot = (typeof SLOTS)[number];

type PartSlot = Exclude<Slot, 'body'>;

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
 * Anchors every view must have (D22): `headwear` at the top of the body; in the side view,
 * `lean`, the point whose forward tip the pushing stand-off adds.
 */
export const REQUIRED_ANCHORS: Readonly<Record<BeanView, readonly string[]>> = {
  front: ['headwear'],
  'front-34': ['headwear'],
  side: ['headwear', 'lean'],
  'back-34': ['headwear'],
  back: ['headwear'],
};

/** Hidden unless something turns them on: earned goggles (catapult), the far arm (pushing). */
export const HIDDEN_BY_DEFAULT: ReadonlySet<string> = new Set(['headwear-goggles', 'arm-far-push']);

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
