import { describe, expect, it } from 'vitest';
import { FIXED_DT, FixedStepper, MAX_FRAME_SECONDS, SIM_HZ, secondsToTicks, ticksToSeconds } from '../src';

describe('fixed timestep', () => {
  it('runs at 60 Hz', () => {
    expect(SIM_HZ).toBe(60);
    expect(FIXED_DT).toBeCloseTo(1 / 60, 15);
  });

  it('takes exactly one step per frame when frames are exactly 1/60 s', () => {
    const stepper = new FixedStepper();
    const perFrame: number[] = [];
    for (let i = 0; i < 600; i++) {
      let n = 0;
      stepper.advance(1 / 60, () => n++);
      perFrame.push(n);
    }
    expect(perFrame.every((n) => n === 1)).toBe(true);
  });

  it('accumulates short frames and catches up on long ones', () => {
    const stepper = new FixedStepper();
    let steps = 0;
    // 144 Hz display for one second: 60 steps in total.
    for (let i = 0; i < 144; i++) stepper.advance(1 / 144, () => steps++);
    expect(steps).toBe(60);
    // A 50 ms hitch runs 3 steps at once.
    steps = 0;
    stepper.reset();
    stepper.advance(0.05, () => steps++);
    expect(steps).toBe(3);
  });

  it('caps a stalled frame instead of spiralling', () => {
    const stepper = new FixedStepper();
    let steps = 0;
    stepper.advance(10, () => steps++);
    expect(steps).toBe(secondsToTicks(MAX_FRAME_SECONDS));
  });

  it('returns an interpolation factor in [0, 1)', () => {
    const stepper = new FixedStepper();
    const alpha = stepper.advance(FIXED_DT * 1.5, () => {});
    expect(alpha).toBeCloseTo(0.5, 9);
  });

  it('converts between ticks and seconds without drift', () => {
    expect(ticksToSeconds(60)).toBe(1);
    expect(ticksToSeconds(90)).toBe(1.5);
    expect(secondsToTicks(1)).toBe(60);
    expect(secondsToTicks(1.5)).toBe(90);
    expect(secondsToTicks(ticksToSeconds(10_000))).toBe(10_000);
  });
});
