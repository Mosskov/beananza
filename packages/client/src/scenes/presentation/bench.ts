import { DOZE_AFTER_S, SEAT_ARC_M, SIM_HZ, STAND_ARC_M, type BenchActKind } from '@beananza/sim';
import { LAND_DURATION } from '../../rig/clips';
import { GROUND, hopAt, hopClip, type Placement, type Presentation, type Rows } from './common';

/** On the bench: in front of it, no ground shadow (the bench's own shadow is there). */
const SEATED: Omit<Presentation, 'clip' | 'placement'> = { parts: {}, shadow: false, standOffCarts: 0, usingCart: null, flatZ: null };

/** How the bean looks walking over to a bench, hopping on and off, and sitting (D24). */
export const BENCH_ROWS: Rows<BenchActKind> = {
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
