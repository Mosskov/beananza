import { DEFAULT_LOOK, type BeanLook, type ColourId } from '@beananza/shared';
import { SIM_HZ, type HubState } from '@beananza/sim';

/**
 * Seated classmates (DESIGN.md §7): drawn on a bench seat that the sim marks as taken. Priya
 * greets the bean ("Hi!" and a wave) when it sits down next to her. Presentation only: the
 * greeting is worked out from the bean's sim state (when it sat down), so every client that
 * draws the same state draws the same greeting.
 */
export interface Classmate {
  name: string;
  bench: string;
  seat: string;
  look: BeanLook;
  /** Offset (s) of the feet swing, so it does not swing in step with the bean. */
  swingOffset: number;
}

/** Priya is blue (DESIGN.md §7; the prototype's classmate). */
export const PRIYA_COLOUR: ColourId = 'blue';

export const CLASSMATES: readonly Classmate[] = [{ name: 'Priya', bench: 'bench', seat: 'east', look: { ...DEFAULT_LOOK, colour: PRIYA_COLOUR }, swingOffset: 0.4 }];

/** How long Priya says "Hi!" and waves after the bean sits down next to her (s). */
export const GREETING_S = 2.4;

/**
 * Seconds into the classmate's greeting at animation time `time`, or null: the bean sat down on
 * the same bench less than GREETING_S ago.
 */
export function greetingAt(state: HubState, classmate: Classmate, time: number): number | null {
  const act = state.bean.act;
  if (act.kind !== 'sitting' || act.bench !== classmate.bench || act.seat === classmate.seat) return null;
  const t = time - act.since / SIM_HZ;
  return t >= 0 && t < GREETING_S ? t : null;
}
