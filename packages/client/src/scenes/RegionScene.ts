import Phaser from 'phaser';
import { DEFAULT_LOOK, type BeanLook } from '@beananza/shared';
import type { RegionId } from '@beananza/sim';
import { prefersReducedMotion } from '../accessibility';
import { propPart } from '../art/props';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, UI_FONT, cssColor } from '../config';
import { BeanRig, createBeanShadow } from '../rig/BeanRig';
import { samplePose } from '../rig/player';
import { frameMainCamera, sharpText } from '../screen-scale';
import { SWIRL_DEG_PER_S } from './hub-portals';
import { REGION_STYLES, hubUrl, isRegionId, type RegionStyle } from './regions';
import type { SceneStartData, TestableScene } from './TestableScene';

/** Where the ground starts (px from the top) and where the bean and the portal stand. */
const HORIZON_Y = 470;
const GROUND_Y = 560;
const BEAN_X = 520;
const PORTAL_X = 800;
/** The bean and the portal are drawn a bit larger than in the hub: this is a close-up. */
const BEAN_SCALE = 1.1;
const PORTAL_SCALE = 1.3;
const HINT_STYLE = {
  fontFamily: UI_FONT,
  fontSize: '18px',
  color: cssColor(PALETTE.inkSecondary),
  backgroundColor: 'rgba(255, 248, 236, 0.88)',
  padding: { x: 10, y: 5 },
};

/**
 * A region's placeholder scene (D2), reached through its portal on the sky island: its sky,
 * ground and a far landscape in the region's colours, the bean, and a portal back. E, Space or a
 * tap on the portal returns to the hub in front of this region's portal. The region itself (its
 * expedition, D9) is not built yet. No sim, and no text besides the controls hint.
 */
export class RegionScene extends Phaser.Scene implements TestableScene {
  private region: RegionId = 'mechanics';
  private look: BeanLook = DEFAULT_LOOK;
  private rig!: BeanRig;
  private swirl!: Phaser.GameObjects.Image;
  private portal!: Phaser.GameObjects.Container;
  private reducedMotion = false;
  private leaving = false;

  constructor() {
    super({ key: 'region' });
  }

  init(data: SceneStartData): void {
    this.region = isRegionId(data.region ?? null) ? (data.region as RegionId) : 'mechanics';
    this.look = data.look ?? DEFAULT_LOOK;
  }

  create(): void {
    const style = REGION_STYLES[this.region];
    this.reducedMotion = prefersReducedMotion();
    const sky = this.add.graphics();
    sky.fillGradientStyle(style.skyTop, style.skyTop, style.skyBottom, style.skyBottom, 1).fillRect(0, 0, GAME_WIDTH, HORIZON_Y + 40);
    this.drawLandscape(this.add.graphics(), style);
    const ground = this.add.graphics();
    ground.fillStyle(style.ground, 1).fillRect(0, HORIZON_Y + 30, GAME_WIDTH, GAME_HEIGHT - HORIZON_Y);
    ground.fillStyle(0xffffff, 0.18).fillRect(0, HORIZON_Y + 30, GAME_WIDTH, 8);

    this.swirl = propPart(this, 'portal', 'swirl').setTint(style.portal);
    this.portal = this.add
      .container(PORTAL_X, GROUND_Y, [propPart(this, 'portal', 'shadow'), propPart(this, 'portal', 'base'), this.swirl, propPart(this, 'portal', 'ring')])
      .setScale(PORTAL_SCALE);

    createBeanShadow(this).setPosition(BEAN_X, GROUND_Y).setScale(BEAN_SCALE);
    this.rig = new BeanRig(this, this.look);
    this.rig.setView({ view: 'front', mirrored: false });
    this.rig.root.setPosition(BEAN_X, GROUND_Y).setScale(BEAN_SCALE);

    sharpText(this.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 16, 'Back: E, Space or tap the portal', HINT_STYLE).setOrigin(1, 1));
    // The 1280×720 layout at the canvas's real resolution (screen-scale.ts).
    frameMainCamera(this);

    const kb = this.input.keyboard;
    kb?.on('keydown-E', () => this.back());
    kb?.on('keydown-SPACE', () => this.back());
    kb?.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE]);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (this.portal.getBounds().contains(pointer.worldX, pointer.worldY)) this.back();
    });
    this.draw(0);
  }

  override update(time: number): void {
    this.draw(time / 1000);
  }

  private draw(seconds: number): void {
    this.swirl.setAngle(this.reducedMotion ? 0 : (seconds * SWIRL_DEG_PER_S) % 360);
    this.rig.applyPose(samplePose({ clip: 'idle', t: seconds, time: seconds, view: 'front', reducedMotion: this.reducedMotion }));
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    window.location.assign(hubUrl(window.location.href, this.region));
  }

  /** The far landscape: soft silhouettes in the region's colour. PLACEHOLDER shapes. */
  private drawLandscape(g: Phaser.GameObjects.Graphics, style: RegionStyle): void {
    const y = HORIZON_Y + 30;
    g.fillStyle(style.far, 1);
    if (style.landscape === 'hills') {
      for (const [x, w, h] of [[120, 520, 150], [520, 640, 200], [980, 560, 170], [1260, 420, 130]] as const) g.fillEllipse(x, y, w, h * 2);
    } else if (style.landscape === 'waves') {
      g.fillRect(0, y - 70, GAME_WIDTH, 70);
      g.fillStyle(0xffffff, 0.5);
      for (let x = 20; x < GAME_WIDTH; x += 90) g.fillEllipse(x, y - 70, 60, 14);
    } else if (style.landscape === 'clouds') {
      for (const [x, cy, w] of [[160, 110, 380], [560, 70, 460], [980, 120, 420], [1240, 60, 300]] as const) g.fillEllipse(x, cy, w, w * 0.32);
      for (const [x, w, h] of [[260, 600, 120], [900, 700, 150]] as const) g.fillEllipse(x, y, w, h * 2);
    } else {
      for (let x = 40; x < GAME_WIDTH; x += 140) g.fillTriangle(x - 40, y, x, y - 110 - ((x * 7) % 60), x + 40, y);
    }
  }

  simTime(): number | null {
    return null;
  }

  pauseSim(): void {}

  resumeSim(): void {}

  stepTo(): number {
    throw new Error('Scene "region" has no sim to step.');
  }

  stepBy(): number {
    throw new Error('Scene "region" has no sim to step.');
  }

  debugState(): unknown {
    return { region: this.region, style: REGION_STYLES[this.region].name };
  }
}
