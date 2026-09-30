import { ENTER_RISE_M, type PortalActKind } from '@beananza/sim';
import { GROUND, hopAt, hopClip, type Rows } from './common';

/** Floating in, the bean starts to shrink and fade once this far through (0..1). */
const VANISH_FROM = 0.35;

/** How the bean looks floating into a portal, gone, and bounced back out of a locked one (D2). */
export const PORTAL_ROWS: Rows<PortalActKind> = {
  entering: (act, _state, time) => {
    const p = hopAt(time, act.startTick, act.endTick);
    return { ...GROUND, clip: hopClip(p), standOffCarts: 0, flatZ: ENTER_RISE_M * p, vanish: Math.max(0, (p - VANISH_FROM) / (1 - VANISH_FROM)) };
  },
  gone: () => ({ ...GROUND, clip: { clip: 'idle', t: 0 }, shadow: false, standOffCarts: 0, vanish: 1 }),
  refused: (act, _state, time) => {
    const q = hopAt(time, act.startTick, act.endTick);
    return { ...GROUND, clip: hopClip(q), standOffCarts: 0, flatZ: 0 };
  },
};
