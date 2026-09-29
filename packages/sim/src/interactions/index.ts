import { BENCH_ACTS, benchInteraction } from './bench';
import { CART_ACTS, cartInteraction } from './cart';
import type { ActRuleTable, HubInteraction } from './types';

/**
 * The hub's interactions (D21). A new interaction is a module next to this file that defines
 * its act type and rules; it is added here, and its act type to `HubAct` in
 * `../scenarios/hub-world.ts`. The compiler then asks for its rules here and for its rows in the
 * client's presentation table.
 */

/** The interaction modules, in the order they are offered commands and run. */
export const INTERACTIONS: readonly HubInteraction[] = [cartInteraction, benchInteraction];

/** How the hub treats every act kind: `free` is the hub's own walking. */
export const ACT_RULES: ActRuleTable = {
  free: { walks: true, usesPlanck: true },
  ...CART_ACTS,
  ...BENCH_ACTS,
};
