import type { ReactionGroup, ReactionKind } from '@beananza/sim';
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
  /**
   * Under reduced motion, hold this value instead of dropping the track (e.g. dangling feet
   * that stop swinging but still dangle).
   */
  still?: number;
  /**
   * Only reaction clips (D26) set this: the layer the track belongs to. The sim's compatibility
   * table says which groups may play in the bean's current act; a track of a group that is not
   * allowed is skipped. Tracks without a group belong to act clips and always play.
   */
  group?: ReactionGroup;
}

export interface Clip {
  /** Cycle length (looping) or length (s). */
  duration: number;
  loop: boolean;
  tracks: Track[];
}

/**
 * Reaction clips (D26) are named like the sim's `ReactionKind`; they are played on top of the
 * act's clip (`samplePose`'s `reaction`), and alone by `pnpm clip:sheet`.
 */
export const REACTION_CLIP_NAMES = ['eureka', 'oops', 'waveHi', 'dizzy'] as const satisfies readonly ReactionKind[];
export const CLIP_NAMES = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'push', 'pushHeavy', 'sit', 'doze', 'wave', ...REACTION_CLIP_NAMES] as const;
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

/**
 * Sitting on the bench (DESIGN.md §6, D24; always the front view): feet dangle below the seat
 * and swing in turn (1.3 s, 8–15 units down), arms rest a little out, breathing as when idle.
 * Under reduced motion the feet hang still at 12 units.
 */
export const SIT_SWING_S = 1.3;
const SIT_ARMS = [t('armA', 'rotation', keys([0, -12], [1, -12])), t('armB', 'rotation', keys([0, 12], [1, 12]))];
const SIT = same({
  duration: SIT_SWING_S,
  loop: true,
  tracks: [
    ...pair('footA', 'footB', 'y', keys([0, 8], [0.5, 15], [1, 8]), { motion: true, still: 12 }),
    body('scaleX', keys([0, 1], [0.5, 1.035], [1, 1]), { period: 3 }),
    body('scaleY', keys([0, 1], [0.5, 0.965], [1, 1]), { period: 3 }),
    ...SIT_ARMS,
  ],
});

/**
 * Dozing after 5 s on the bench: feet hang still, slow deep breaths, and the drawn "z"
 * (`art/effects/doze-z.svg`, on the `fxHead` slot) floats up and fades by shrinking every 2 s.
 * The closed eyes are a part swap.
 */
const DOZE = same({
  duration: 2,
  loop: true,
  tracks: [
    t('footA', 'y', keys([0, 12], [1, 12])),
    t('footB', 'y', keys([0, 12], [1, 12])),
    body('scaleX', keys([0, 1], [0.5, 1.045], [1, 1]), { period: 4 }),
    body('scaleY', keys([0, 1], [0.5, 0.955], [1, 1]), { period: 4 }),
    ...SIT_ARMS,
    t('fxHead', 'x', keys([0, 0], [1, 10]), { motion: true, still: 4 }),
    t('fxHead', 'y', keys([0, 6], [1, -22]), { motion: true, still: -4 }),
    t('fxHead', 'scaleX', keys([0, 0.6], [0.7, 1.1], [1, 0.2]), { motion: true, still: 1 }),
    t('fxHead', 'scaleY', keys([0, 0.6], [0.7, 1.1], [1, 0.2]), { motion: true, still: 1 }),
  ],
});

/**
 * Waving hello while seated (Priya's greeting, DESIGN.md §7): sitting, with the screen-right arm
 * raised and waving every 0.4 s (the other arm would be hidden behind a bean sitting on her
 * west). Under reduced motion the arm stays raised.
 */
const WAVE = same({
  duration: SIT_SWING_S,
  loop: true,
  tracks: [
    ...SIT.front.tracks.filter((track) => track.slot !== 'armB'),
    t('armB', 'rotation', keys([0, -95], [0.5, -125], [1, -95]), { period: 0.4, motion: true, still: -110 }),
  ],
});

/** A track of a reaction clip, in its layer (D26). */
const layer = (group: ReactionGroup, track: Track): Track => ({ ...track, group });

/**
 * Eureka! (D26; showcase `eureka`, 1.8 s = `EUREKA_S`): a crouch, a jump of 46 units with the
 * stretch and a squash on landing, then upright. The prototype loops and starts and ends on the
 * crouch; this plays once, so it ends at rest. Under reduced motion the jump goes and the squash
 * holds at the prototype's crouch (1.06, 0.94).
 */
const EUREKA_JUMP = keys([0, 0], [0.2, -42], [0.35, -46], [0.55, 0], [1, 0]);
/**
 * The lightbulb (`art/effects/eureka-bulb.svg` on `fxHead`; showcase `pop`): nothing for the
 * crouch, then it pops to 1.25 and settles at 1 by the top of the jump, stays, and shrinks away
 * over the last fifth. It rises a little as it pops. Under reduced motion it shows at full size,
 * still. The `x` key holds it over the head when the doze "z"'s drift runs underneath.
 */
const BULB_SCALE = keys([0, 0], [0.1, 0], [0.22, 1.25], [0.35, 1], [0.8, 1], [1, 0]);
const EUREKA = same({
  duration: 1.8,
  loop: false,
  tracks: [
    layer('body', body('y', EUREKA_JUMP)),
    // The feet leave the ground with the body (the prototype moves the whole bean).
    layer('body', t('footA', 'y', EUREKA_JUMP, { motion: true })),
    layer('body', t('footB', 'y', EUREKA_JUMP, { motion: true })),
    layer('body', body('scaleX', keys([0, 1.06], [0.2, 0.95], [0.35, 1], [0.55, 1.08], [0.68, 1], [1, 1]), { still: 1.06 })),
    layer('body', body('scaleY', keys([0, 0.94], [0.2, 1.05], [0.35, 1], [0.55, 0.92], [0.68, 1], [1, 1]), { still: 0.94 })),
    layer('effect', t('fxHead', 'scaleX', BULB_SCALE, { motion: true, still: 1 })),
    layer('effect', t('fxHead', 'scaleY', BULB_SCALE, { motion: true, still: 1 })),
    layer('effect', t('fxHead', 'y', keys([0, 6], [0.22, 0], [1, -6]), { motion: true, still: 0 })),
    layer('effect', t('fxHead', 'x', keys([0, 0], [1, 0]))),
  ],
});

/**
 * Oops (showcase `youshake`, 1.5 s = `OOPS_S`): three shakes of ±8° (0.5 s each, the prototype's
 * 0, 25 %, 75 %, 100 % keys), and a squish over the last shake that settles back. Under reduced
 * motion the shake goes and the squish holds at (1.06, 0.94), a slump.
 */
const shake = (s: number): [number, number][] => [
  [s / 3 + 0.25 / 3, -8],
  [s / 3 + 0.75 / 3, 8],
  [(s + 1) / 3, 0],
];
/**
 * The sweat drop (`art/effects/sweat-drop.svg` on `fxBrow`; showcase `sweat`, 1.1 s): it appears
 * as the shaking starts, slides 20 units down and 6 out along the head, and shrinks away. Under
 * reduced motion it sits on the brow at full size.
 */
const SWEAT_SCALE = keys([0, 0], [0.08, 0], [0.2, 1], [0.75, 1], [0.95, 0.2], [1, 0]);
const OOPS = same({
  duration: 1.5,
  loop: false,
  tracks: [
    layer('effect', t('fxBrow', 'scaleX', SWEAT_SCALE, { motion: true, still: 1 })),
    layer('effect', t('fxBrow', 'scaleY', SWEAT_SCALE, { motion: true, still: 1 })),
    layer('effect', t('fxBrow', 'y', keys([0, 0], [0.2, 0], [0.95, 20], [1, 20]), { motion: true, still: 0 })),
    layer('effect', t('fxBrow', 'x', keys([0, 0], [0.2, 0], [0.95, -6], [1, -6]), { motion: true, still: 0 })),
    layer('body', body('rotation', keys([0, 0], ...shake(0), ...shake(1), ...shake(2)))),
    layer('body', body('scaleX', keys([0, 1], [0.82, 1], [0.92, 1.1], [1, 1]), { still: 1.06 })),
    layer('body', body('scaleY', keys([0, 1], [0.82, 1], [0.92, 0.9], [1, 1]), { still: 0.94 })),
  ],
});

/**
 * Wave hi (showcase `wave`, 1.8 s = `WAVE_HI_S`): the arm goes up, two flaps (−28° then +8° then
 * −28° again in the first 60 %), holds, and comes down. The screen-right arm in the front, back
 * and ¾ views (`armB`, as Priya's `wave`), the near arm in the side view (`armB` is the hidden
 * pushing arm there). Only the `arms` group: it plays in every act that leaves the arm free.
 * Under reduced motion the arm stays raised at the middle of the flap.
 */
const WAVE_UP = -110;
/** In the side view the arm swings forward, so it has to go further to be over the head. */
const WAVE_UP_SIDE = -165;
const waveArm = (slot: 'armA' | 'armB', up: number): Track =>
  layer(
    'arms',
    t(slot, 'rotation', keys([0, 0], [0.08, up], [0.15, up - 28], [0.3, up + 8], [0.45, up - 28], [0.6, up], [0.85, up], [1, 0]), {
      motion: true,
      still: up,
    }),
  );
const WAVE_HI: Families = {
  front: { duration: 1.8, loop: false, tracks: [waveArm('armB', WAVE_UP)] },
  'three-quarter': { duration: 1.8, loop: false, tracks: [waveArm('armB', WAVE_UP)] },
  side: { duration: 1.8, loop: false, tracks: [waveArm('armA', WAVE_UP_SIDE)] },
};

/**
 * Dizzy (D26, 1.6 s = `DIZZY_S`; set by a hard landing, the catapult's). The stars are an effect
 * and the sway a body track, both waiting for their art (the art lane), so there are no tracks yet.
 */
const DIZZY = same({ duration: 1.6, loop: false, tracks: [] });

export const CLIPS: Readonly<Record<ClipName, Families>> = {
  idle: IDLE,
  walk: WALK_CLIPS,
  run: RUN_CLIPS,
  jump: JUMP_CLIPS,
  fall: FALL_CLIPS,
  land: LAND_CLIPS,
  push: push(0.45, 10, 3),
  pushHeavy: push(1, 16, 2),
  sit: SIT,
  doze: DOZE,
  wave: WAVE,
  eureka: EUREKA,
  oops: OOPS,
  waveHi: WAVE_HI,
  dizzy: DIZZY,
};

/** Blinking plays on top of every clip: every 4 s, eyes squeeze to 10% for a moment. */
export const BLINK: Clip = {
  duration: 4,
  loop: true,
  tracks: [t('eyes', 'scaleY', keys([0, 1], [0.9, 1], [0.94, 0.1], [1, 1]))],
};

/** Seconds into the clip of phase k of n: a looping clip's cycle split evenly, a one-shot clip start to end. */
export function phaseTime(duration: number, loop: boolean, k: number, n: number): number {
  return loop ? (k * duration) / n : n === 1 ? 0 : (k * duration) / (n - 1);
}
