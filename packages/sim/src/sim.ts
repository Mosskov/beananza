import { createRng, type RngState } from './rng';
import { secondsToTicks, ticksToSeconds } from './time';

/** Fields every sim state has. States are plain JSON data. */
export interface SimStateBase {
  /** Number of fixed steps taken. Sim time is tick / SIM_HZ. */
  tick: number;
  rng: RngState;
}

/**
 * A scenario is the rules of one world: how to build its initial state and how to advance it
 * by one fixed step. Input only arrives as commands.
 */
export interface Scenario<S extends SimStateBase, C> {
  readonly name: string;
  /** Initial state at tick 0. Must not consume randomness from anywhere but `rng`. */
  init(rng: RngState): Omit<S, 'tick' | 'rng'>;
  /** Apply `commands`, then advance `state` by FIXED_DT. The runner increments `tick` afterwards. */
  step(state: S, commands: readonly C[]): void;
}

/** Runs a scenario: owns the state, queues commands and advances in fixed steps. */
export class Sim<S extends SimStateBase, C> {
  readonly scenario: Scenario<S, C>;
  state: S;
  private pending: C[] = [];

  constructor(scenario: Scenario<S, C>, seed: number) {
    this.scenario = scenario;
    const rng = createRng(seed);
    this.state = { ...scenario.init(rng), tick: 0, rng } as S;
  }

  get tick(): number {
    return this.state.tick;
  }

  /** Sim time in seconds. */
  get time(): number {
    return ticksToSeconds(this.state.tick);
  }

  /** Queue a command; it is applied at the start of the next step. */
  enqueue(command: C): void {
    this.pending.push(command);
  }

  step(): void {
    const commands = this.pending;
    this.pending = [];
    this.scenario.step(this.state, commands);
    this.state.tick += 1;
  }

  /** Step until sim time reaches `seconds` (rounded down to a whole step). Never steps back. */
  stepTo(seconds: number): void {
    const target = secondsToTicks(seconds);
    while (this.state.tick < target) this.step();
  }

  /** Deep copy of the state (states are plain JSON). */
  snapshot(): S {
    return JSON.parse(JSON.stringify(this.state)) as S;
  }
}
