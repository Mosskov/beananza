import type { BeanView, Slot } from './views';

/**
 * Animation clips as data (docs/IMPLEMENTATION.md §3): keyframes per rig slot, played by the rig
 * player (`player.ts`). Timings and amplitudes are ported from the prototype's animations
 * (DESIGN.md §6), in art units (100 = 1 m) and degrees (positive = clockwise on screen, as drawn
 * facing right; mirroring flips them).
 */

export type Channel = 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY';

/** Views animate in three families: front and back, the ¾ views, and the side view. */
export type Family = 'front' | 'three-quarter' | 'side';

export function familyOf(view: BeanView): Family {
  if (view === 'side') return 'side';
  return view === 'front' || view === 'back' ? 'front' : 'three-quarter';
}

export interface Key {
  /** Position in the track's cycle or in the clip, 0..1. */
  at: number;
  v: number;
}

export interface Track {
  slot: Slot;
  channel: Channel;
  /** Start at 0, end at 1, strictly increasing. */
  keys: Key[];
  /** Between keys: ease in and out (default, like CSS ease-in-out) or linear. */
  ease?: 'inOut' | 'linear';
  /** Own cycle length (s) for looping clips, e.g. a faster scarf flap. Default: the clip's. */
  period?: number;
  /** Phase offset as a share of the cycle, e.g. 0.5 for the other foot. */
  offset?: number;
  /**
   * Body motion that reduced motion removes: bob, squash and stretch, breathing, waddle
   * (docs: prefers-reduced-motion). Poses such as the run lean or raised arms stay.
   */
  motion?: boolean;
}

export interface Clip {
  /** Cycle length (looping) or length (s). */
  duration: number;
  loop: boolean;
  tracks: Track[];
}

export const CLIP_NAMES = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'push', 'pushHeavy'] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

// Small builders so the data reads like the prototype's keyframes.
const keys = (...pairs: [number, number][]): Key[] => pairs.map(([at, v]) => ({ at, v }));
const t = (slot: Slot, channel: Channel, k: Key[], extra: Partial<Track> = {}): Track => ({ slot, channel, keys: k, ...extra });
/** Body motion (removed under reduced motion). */
const body = (channel: Channel, k: Key[], extra: Partial<Track> = {}): Track => t('body', channel, k, { motion: true, ...extra });
/** A limb track and its partner half a cycle later. */
const pair = (a: Slot, b: Slot, channel: Channel, k: Key[], extra: Partial<Track> = {}): Track[] => [
  t(a, channel, k, extra),
  t(b, channel, k, { ...extra, offset: 0.5 }),
];
const swing = (deg: number) => keys([0, -deg], [0.5, deg], [1, -deg]);
const flap = (period: number) => t('tail', 'rotation', keys([0, -10], [0.5, 12], [1, -10]), { period });

const WALK = 0.56;
const RUN = 0.34;

/** Side view bob with squash (walkbob, runbob). */
const bob = (height: number, low: [number, number], high: [number, number]): Track[] => [
  body('y', keys([0, 0], [0.25, -height], [0.5, 0], [0.75, -height], [1, 0])),
  body('scaleX', keys([0, low[0]], [0.25, high[0]], [0.5, low[0]], [0.75, high[0]], [1, low[0]])),
  body('scaleY', keys([0, low[1]], [0.25, high[1]], [0.5, low[1]], [0.75, high[1]], [1, low[1]])),
];
/** Front, back and ¾ views waddle side to side (waddle, runwaddle). */
const waddle = (height: number, deg: number): Track[] => [
  body('y', keys([0, 0], [0.25, -height], [0.5, 0], [0.75, -height], [1, 0])),
  body('rotation', keys([0, -deg], [0.25, 0], [0.5, deg], [0.75, 0], [1, -deg])),
];
/** Feet lift in turn (lift, runlift). */
const lift = (height: number) => pair('footA', 'footB', 'y', keys([0, 0], [0.25, -height], [0.5, 0], [1, 0]));
/** Side view steps (stepside, runstep): linear, the foot slides back, lifts and swings forward. */
const step = (x: Key[], y: Key[]) => [
  ...pair('footA', 'footB', 'x', x, { ease: 'linear' }),
  ...pair('footA', 'footB', 'y', y, { ease: 'linear' }),
];

type Families = Record<Family, Clip>;
const same = (clip: Clip): Families => ({ front: clip, 'three-quarter': clip, side: clip });

const IDLE = same({
  duration: 3,
  loop: true,
  tracks: [
    body('scaleX', keys([0, 1], [0.5, 1.035], [1, 1])),
    body('scaleY', keys([0, 1], [0.5, 0.965], [1, 1])),
    flap(2.4),
  ],
});

const WALK_CLIPS: Families = {
  front: { duration: WALK, loop: true, tracks: [...waddle(6, 5), ...lift(8), ...pair('armA', 'armB', 'rotation', swing(10)), flap(0.28)] },
  'three-quarter': {
    duration: WALK,
    loop: true,
    tracks: [...waddle(6, 5), ...lift(8), ...pair('armA', 'armB', 'rotation', swing(22)), flap(0.28)],
  },
  side: {
    duration: WALK,
    loop: true,
    tracks: [
      ...bob(7, [1.04, 0.96], [0.98, 1.02]),
      ...step(keys([0, 9], [0.5, -9], [0.75, 0], [1, 9]), keys([0, 0], [0.5, 0], [0.75, -8], [1, 0])),
      t('armA', 'rotation', swing(22)),
      flap(0.28),
    ],
  },
};

const runFrontal = (armDeg: number | [number, number]): Clip => ({
  duration: RUN,
  loop: true,
  tracks: [
    ...waddle(12, 7),
    body('scaleX', keys([0, 1.04], [0.25, 0.97], [0.5, 1.04], [0.75, 0.97], [1, 1.04])),
    body('scaleY', keys([0, 0.96], [0.25, 1.04], [0.5, 0.96], [0.75, 1.04], [1, 0.96])),
    ...lift(12),
    ...pair(
      'armA',
      'armB',
      'rotation',
      typeof armDeg === 'number' ? swing(armDeg) : keys([0, armDeg[0]], [0.5, armDeg[1]], [1, armDeg[0]]),
    ),
    flap(0.14),
  ],
});

const RUN_CLIPS: Families = {
  front: runFrontal(20),
  'three-quarter': runFrontal([-50, 45]),
  side: {
    duration: RUN,
    loop: true,
    tracks: [
      ...bob(12, [1.05, 0.95], [0.96, 1.05]),
      // The 8° forward lean is a pose, not motion: it stays under reduced motion.
      t('body', 'rotation', keys([0, 8], [1, 8])),
      ...step(keys([0, 14], [0.4, -14], [0.7, -4], [1, 14]), keys([0, -2], [0.4, 0], [0.7, -12], [1, -2])),
      t('armA', 'rotation', keys([0, -50], [0.5, 45], [1, -50])),
      flap(0.14),
    ],
  },
};

/**
 * Take-off to apex (about 0.4 s). The sim leaves the ground on the jump command, so the crouch
 * plays as a squash in the first moments of the jump, then the stretch, then arms up and feet
 * tucked (DESIGN.md §6: crouch, launch, airborne).
 */
const jumpArms = (a: number, b: number | null): Track[] => [
  t('armA', 'rotation', keys([0, 0], [0.12, -Math.sign(a) * 25], [0.45, a], [1, a])),
  ...(b === null ? [] : [t('armB', 'rotation', keys([0, 0], [0.12, -Math.sign(b) * 25], [0.45, b], [1, b]))]),
];
const JUMP_BODY = [
  body('scaleX', keys([0, 1.16], [0.12, 1.12], [0.35, 0.9], [1, 0.95])),
  body('scaleY', keys([0, 0.84], [0.12, 0.88], [0.35, 1.12], [1, 1.06])),
];
const TUCK = keys([0, 0], [0.3, 0], [0.7, -6], [1, -6]);
const tuck = [t('footA', 'y', TUCK), t('footB', 'y', TUCK)];
const JUMP_CLIPS: Families = {
  front: { duration: 0.4, loop: false, tracks: [...JUMP_BODY, ...jumpArms(140, -140), ...tuck] },
  'three-quarter': {
    duration: 0.4,
    loop: false,
    tracks: [...JUMP_BODY, ...jumpArms(135, -135), ...tuck],
  },
  side: {
    duration: 0.4,
    loop: false,
    tracks: [
      ...JUMP_BODY,
      ...jumpArms(-150, null),
      t('footA', 'x', keys([0, 0], [0.7, 4], [1, 4])),
      t('footA', 'y', keys([0, 0], [0.7, -6], [1, -6])),
      t('footB', 'x', keys([0, 0], [0.7, -4], [1, -4])),
      t('footB', 'y', keys([0, 0], [0.7, -5], [1, -5])),
    ],
  },
};

/** Apex to touchdown (time since the apex): arms drift down, feet reach for the ground. */
const FALL_BODY = [body('scaleX', keys([0, 0.95], [1, 0.94])), body('scaleY', keys([0, 1.06], [1, 1.07]))];
const fallFeet = [t('footA', 'y', keys([0, -6], [1, 0])), t('footB', 'y', keys([0, -6], [1, 0]))];
const FALL_CLIPS: Families = {
  front: {
    duration: 0.4,
    loop: false,
    tracks: [...FALL_BODY, t('armA', 'rotation', keys([0, 140], [1, 110])), t('armB', 'rotation', keys([0, -140], [1, -110])), ...fallFeet],
  },
  'three-quarter': {
    duration: 0.4,
    loop: false,
    tracks: [...FALL_BODY, t('armA', 'rotation', keys([0, 135], [1, 105])), t('armB', 'rotation', keys([0, -135], [1, -105])), ...fallFeet],
  },
  side: {
    duration: 0.4,
    loop: false,
    tracks: [
      ...FALL_BODY,
      t('armA', 'rotation', keys([0, -150], [1, -120])),
      t('footA', 'x', keys([0, 4], [1, 0])),
      t('footB', 'x', keys([0, -4], [1, 0])),
      ...fallFeet,
    ],
  },
};

/** Landing squash (DESIGN.md §6: 0.12–0.14 s); the arms come down. */
export const LAND_DURATION = 0.13;
const LAND_BODY = [
  body('scaleX', keys([0, 1.18], [0.55, 0.97], [1, 1])),
  body('scaleY', keys([0, 0.84], [0.55, 1.03], [1, 1])),
];
const LAND_CLIPS: Families = {
  front: {
    duration: LAND_DURATION,
    loop: false,
    tracks: [...LAND_BODY, t('armA', 'rotation', keys([0, 60], [1, 0])), t('armB', 'rotation', keys([0, -60], [1, 0]))],
  },
  'three-quarter': {
    duration: LAND_DURATION,
    loop: false,
    tracks: [...LAND_BODY, t('armA', 'rotation', keys([0, 60], [1, 0])), t('armB', 'rotation', keys([0, -60], [1, 0]))],
  },
  side: { duration: LAND_DURATION, loop: false, tracks: [...LAND_BODY, t('armA', 'rotation', keys([0, -60], [1, 0]))] },
};

/**
 * Pushing a cart (always the side view): lean into it, both arms forward (the far arm shows),
 * short steps. Heavy (the 20 kg cart) leans more and steps slower (pushbob, pushbobH).
 */
const push = (cycle: number, lean: number, bobHeight: number): Families =>
  same({
    duration: cycle,
    loop: true,
    tracks: [
      // The lean is a pose (kept under reduced motion); the small bob is motion.
      t('body', 'rotation', keys([0, lean], [1, lean])),
      body('y', keys([0, 0], [0.5, -bobHeight], [1, 0])),
      ...step(keys([0, 9], [0.5, -9], [0.75, 0], [1, 9]), keys([0, 0], [0.5, 0], [0.75, -8], [1, 0])),
      // Both hands reach the cart: the near arm swings forward and slides out to the body's
      // front edge; the far arm (drawn reaching forward) slides a little further.
      t('armA', 'rotation', keys([0, -80], [1, -80])),
      t('armA', 'x', keys([0, 14], [1, 14])),
      t('armB', 'x', keys([0, 6], [1, 6])),
      flap(0.3),
    ],
  });

export const CLIPS: Readonly<Record<ClipName, Families>> = {
  idle: IDLE,
  walk: WALK_CLIPS,
  run: RUN_CLIPS,
  jump: JUMP_CLIPS,
  fall: FALL_CLIPS,
  land: LAND_CLIPS,
  push: push(0.45, 10, 3),
  pushHeavy: push(1, 16, 2),
};

/** Blinking plays on top of every clip: every 4 s, eyes squeeze to 10% for a moment. */
export const BLINK: Clip = {
  duration: 4,
  loop: true,
  tracks: [t('eyes', 'scaleY', keys([0, 1], [0.9, 1], [0.94, 0.1], [1, 1]))],
};
