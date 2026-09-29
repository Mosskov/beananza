import Phaser from 'phaser';
import type { TestableScene } from './TestableScene';

/** Boots and shows the background. Proves the client starts; no sim. */
export class EmptyScene extends Phaser.Scene implements TestableScene {
  constructor() {
    super({ key: 'empty' });
  }

  simTime(): number | null {
    return null;
  }

  pauseSim(): void {}

  resumeSim(): void {}

  stepTo(): number {
    throw new Error('Scene "empty" has no sim to step.');
  }

  debugState(): unknown {
    return {};
  }
}
