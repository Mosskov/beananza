import type Phaser from 'phaser';
import type { PortalSpec } from '@beananza/sim';
import { propPart } from '../art/props';
import { depthKey, toScreen } from './hub-view';
import { LOCKED_SWIRL, REGION_STYLES } from './regions';

/**
 * The ring and the lock sort this far in front of the portal's row: a bean on the same row (one
 * entering the portal, which sorts CHARACTER_TIE_BREAK = 0.5 in front) draws between the swirl
 * and the ring, so it floats into the swirl.
 */
export const PORTAL_FRONT_DEPTH = 0.6;
/** The swirl turns this fast (degrees per second of sim time); still under reduced motion. */
export const SWIRL_DEG_PER_S = 40;

/** A region portal (D2), drawn from `art/props/portal.svg`, its swirl tinted in the region's colour. */
export class PortalView {
  /** Shadow, base and swirl: behind a bean on the portal's row. Its bounds take the taps. */
  readonly back: Phaser.GameObjects.Container;
  /** Ring (and the lock on a locked portal): in front of a bean on the portal's row. */
  readonly front: Phaser.GameObjects.Container;
  private readonly swirl: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, readonly spec: PortalSpec) {
    this.swirl = propPart(scene, 'portal', 'swirl').setTint(spec.locked ? LOCKED_SWIRL : REGION_STYLES[spec.region].portal);
    const at = toScreen(spec.x, spec.y);
    this.back = scene.add
      .container(at.x, at.y, [propPart(scene, 'portal', 'shadow'), propPart(scene, 'portal', 'base'), this.swirl])
      .setDepth(depthKey(spec.y));
    const front = [propPart(scene, 'portal', 'ring'), ...(spec.locked ? [propPart(scene, 'portal', 'lock')] : [])];
    this.front = scene.add.container(at.x, at.y, front).setDepth(depthKey(spec.y) + PORTAL_FRONT_DEPTH);
  }

  /** Turn the swirl to sim time `time` (s). */
  draw(time: number, reducedMotion: boolean): void {
    this.swirl.setAngle(reducedMotion ? 0 : (time * SWIRL_DEG_PER_S) % 360);
  }
}
