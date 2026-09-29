import type Phaser from 'phaser';
import type { BeanLook } from '@beananza/shared';

/** What every registered scene exposes to the test hooks (see shared/src/test-api.ts). */
export interface TestableScene extends Phaser.Scene {
  /** Sim time in seconds, or null if the scene has no sim. */
  simTime(): number | null;
  pauseSim(): void;
  resumeSim(): void;
  /** Pause and step the sim to `seconds` (whole steps). Returns the reached sim time. */
  stepTo(seconds: number): number;
  /** Pause and take `steps` more fixed steps. Returns the reached sim time. */
  stepBy(steps: number): number;
  debugState(): unknown;
}

/** Data passed to a scene when it starts. */
export interface SceneStartData {
  /** Start with the sim paused at t = 0 (`?paused=1`). */
  paused?: boolean;
  /** The player's bean look (`?look=`, D25). Drawing only: it never reaches the sim. */
  look?: BeanLook;
}
