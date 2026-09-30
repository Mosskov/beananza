import type { HubAct, HubActKind, HubBean, HubState } from '@beananza/sim';
import { GROUND, type Presentation, type Row, type Rows } from './presentation/common';
import { BENCH_ROWS } from './presentation/bench';
import { CART_ROWS } from './presentation/cart';
import { PORTAL_ROWS } from './presentation/portal';

export { PART_DEFAULTS, hopAt, type Placement, type Presentation, type ToggledPart } from './presentation/common';
export { HEAVY_PUSH_KG } from './presentation/cart';

/**
 * How each interaction state (D21) looks: one row per act kind, so the hub scene has no
 * per-case drawing code. The sim decides what the bean does; this table only decides the clip,
 * which parts show, and where the bean draws relative to the prop it is using. Every row is a
 * function of sim state and animation time only. Each interaction's rows sit together in
 * `presentation/`; an act kind without a row does not compile.
 */
const PRESENTATION: Rows<HubActKind> = {
  free: () => ({ ...GROUND, clip: null }),
  ...CART_ROWS,
  ...BENCH_ROWS,
  ...PORTAL_ROWS,
};

/**
 * The row for a bean's act, at animation time `time` (sim seconds, interpolated). `bean` is the
 * bean being drawn (default: the first, the local player's offline).
 */
export function presentAct(act: HubAct, state: HubState, time: number, bean: HubBean | undefined = state.beans[0]): Presentation {
  if (!bean) throw new Error('presentAct: no bean to draw.');
  return (PRESENTATION[act.kind] as Row<HubActKind>)(act, state, time, bean);
}
