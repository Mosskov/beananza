import type { HubActKind, HubCommand, HubState } from '../scenarios/hub-world';

/** How the hub treats the bean in one act kind (D21). */
export interface ActRules {
  /**
   * The hub's own rules apply: held input, tap targets and jumps. Only from such an act can
   * the bean start another interaction.
   */
  walks: boolean;
  /** Planck moves the bean; otherwise the module that owns the act places it. */
  usesPlanck: boolean;
}

/** The rules for every act kind; a kind without rules does not compile. */
export type ActRuleTable = { readonly [K in HubActKind]: ActRules };

/** One hub step, as the interaction modules see it. */
export interface HubStep {
  state: HubState;
  /** Sim time at the start of the step (s). */
  time: number;
  /** How the hub treats each act kind, e.g. `rules[act.kind].walks`. */
  rules: ActRuleTable;
}

/** A ground velocity (m/s). */
export interface Velocity {
  vx: number;
  vy: number;
}

/** A facing direction (unit vector on the ground plane). */
export interface Facing {
  x: number;
  y: number;
}

/**
 * One interaction (D21): everything the bean does with one kind of thing in the hub. The hub
 * scenario calls every module in a fixed order, so a step depends only on the state and the
 * commands. Timed transitions store whole ticks in the state, never wall-clock time.
 */
export interface HubInteraction {
  readonly name: string;
  /** The act kinds this module owns, and how the hub treats each. */
  readonly acts: Readonly<Partial<Record<HubActKind, ActRules>>>;
  /** Offered every command before the hub's own handling. Returns true when it handled it. */
  command(step: HubStep, command: HubCommand): boolean;
  /**
   * Once the desired ground velocity is known and before anything moves: start or stop acts
   * that follow from walking (pushing a cart).
   */
  drive?(step: HubStep, desired: Velocity): void;
  /**
   * After the world moved (carts, Planck, which has already placed a bean that walks): place
   * the bean for an act this module owns and run its timed transitions.
   */
  place(step: HubStep): void;
  /**
   * Facing for an act this module owns; null keeps the current facing, or follows the ground
   * movement if the bean moves.
   */
  facing(step: HubStep): Facing | null;
  /** At the very end of the step (after tap targets and height): transitions that follow them. */
  settle?(step: HubStep): void;
}
