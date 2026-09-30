import Phaser from 'phaser';
import { DEFAULT_LOOK, type BeanLook } from '@beananza/shared';
import { FixedStepper, secondsToTicks, type Sim, type SimStateBase } from '@beananza/sim';
import type { SceneStartData, TestableScene } from './TestableScene';

/**
 * Base for scenes that render a sim. The sim advances in fixed steps driven by real frame
 * time; the scene only reads sim state and draws it. Input goes to the sim as commands.
 */
export abstract class SimScene<S extends SimStateBase, C> extends Phaser.Scene implements TestableScene {
  protected sim!: Sim<S, C>;
  private readonly stepper = new FixedStepper();
  private paused = false;
  /** The player's bean look (drawing only; the sim never sees it). */
  protected look: BeanLook = DEFAULT_LOOK;
  /** The named layout asked for (`?layout=`), or null for the scene's default. */
  protected layout: string | null = null;
  /** The region the player came back from (`?from=`), or null. */
  protected from: string | null = null;

  init(data: SceneStartData): void {
    this.paused = data.paused === true;
    this.look = data.look ?? DEFAULT_LOOK;
    this.layout = data.layout ?? null;
    this.from = data.from ?? null;
    this.stepper.reset();
  }

  create(): void {
    this.sim = this.createSim();
    this.createView();
    this.drawState(1);
  }

  override update(_time: number, deltaMs: number): void {
    const alpha = this.paused ? 1 : this.stepper.advance(deltaMs / 1000, () => this.stepOnce());
    this.drawState(alpha);
  }

  /** Paused: by `?paused=1` or by a tool stepping to an exact time. */
  protected get isPaused(): boolean {
    return this.paused;
  }

  protected abstract createSim(): Sim<S, C>;
  /** Build display objects once. */
  protected abstract createView(): void;
  /**
   * Draw the current sim state. `alpha` (0..1) is how far real time has moved past the last
   * step, for interpolating from the state before it; it is 1 when paused.
   */
  protected abstract drawState(alpha: number): void;
  /** Called right before each fixed step, e.g. to remember positions for interpolation. */
  protected beforeStep(): void {}

  private stepOnce(): void {
    this.beforeStep();
    this.sim.step();
  }

  simTime(): number {
    return this.sim.time;
  }

  pauseSim(): void {
    this.paused = true;
  }

  resumeSim(): void {
    this.paused = false;
    this.stepper.reset();
  }

  stepTo(seconds: number): number {
    this.paused = true;
    const target = secondsToTicks(seconds);
    if (target < this.sim.tick) {
      throw new Error(`Cannot step back: sim is at ${this.sim.time} s, asked for ${seconds} s.`);
    }
    while (this.sim.tick < target) this.stepOnce();
    this.drawState(1);
    return this.sim.time;
  }

  stepBy(steps: number): number {
    if (!Number.isInteger(steps) || steps < 0) throw new Error(`stepBy needs a whole number of steps >= 0, got ${steps}.`);
    this.paused = true;
    for (let i = 0; i < steps; i++) this.stepOnce();
    this.drawState(1);
    return this.sim.time;
  }

  debugState(): unknown {
    return { tick: this.sim.tick, simTime: this.sim.time, paused: this.paused, state: this.sim.snapshot() };
  }
}
