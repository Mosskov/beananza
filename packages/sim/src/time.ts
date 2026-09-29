/** Every sim advances in fixed steps of this rate, independent of the display frame rate. */
export const SIM_HZ = 60;
export const FIXED_DT = 1 / SIM_HZ;

/**
 * Real time beyond this in a single frame is dropped (tab in the background, a breakpoint),
 * so a long stall cannot trigger thousands of catch-up steps.
 */
export const MAX_FRAME_SECONDS = 0.25;

/** Tolerance for frame times that are one step up to float rounding (e.g. exactly 1/60 s). */
const STEP_EPSILON = 1e-9;

/** Sim time of a tick. Computed from the integer tick so it never drifts. */
export function ticksToSeconds(tick: number): number {
  return tick / SIM_HZ;
}

/** The last whole tick at or before `seconds`. */
export function secondsToTicks(seconds: number): number {
  return Math.floor(seconds * SIM_HZ + STEP_EPSILON);
}

/**
 * Fixed-timestep accumulator. Feed it real frame times; it calls `step` zero or more times
 * and returns the interpolation factor (0..1) between the previous and the current step.
 * The sim state depends only on how many steps ran and on the commands, never on frame times.
 */
export class FixedStepper {
  private accumulator = 0;

  advance(frameSeconds: number, step: () => void): number {
    this.accumulator += Math.min(Math.max(frameSeconds, 0), MAX_FRAME_SECONDS);
    while (this.accumulator >= FIXED_DT - STEP_EPSILON) {
      step();
      this.accumulator -= FIXED_DT;
    }
    return Math.min(Math.max(this.accumulator / FIXED_DT, 0), 1);
  }

  reset(): void {
    this.accumulator = 0;
  }
}
