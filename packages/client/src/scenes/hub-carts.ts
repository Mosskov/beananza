import Phaser from 'phaser';
import { PIXELS_PER_METER } from '@beananza/shared';
import type { RailLayout } from '@beananza/sim';
import { CART_WHEEL_RADIUS_M, propPart } from '../art/props';
import { PALETTE, cssColor } from '../config';
import { RAIL_GAUGE_M, depthKey, toScreen } from './hub-view';

const m = (meters: number) => meters * PIXELS_PER_METER;

// The carts are drawn once in art/props/cart.svg (they run on a straight rail and never turn,
// D12). The rail itself is still PLACEHOLDER art, drawn in code below.
/** Draw order inside a cart's row: back of the cart, a rider, then the front. */
export const CART_BACK_DEPTH = 0;
export const CART_RIDER_DEPTH = 0.2;
const CART_FRONT_DEPTH = 0.3;

const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';

/** Speed readout (D17: a measurement with its unit). Magnitude, two decimals. */
export function speedReadout(v: number): string {
  return `${Math.abs(v).toFixed(2)} m/s`;
}

/** Rails, sleepers and bumpers, drawn flat on the ground layer. */
export function drawRail(scene: Phaser.Scene, rail: RailLayout, depth: number): void {
  const g = scene.add.graphics().setDepth(depth);
  const west = toScreen(rail.minX - 0.15, rail.y);
  const east = toScreen(rail.maxX + 0.15, rail.y);
  g.fillStyle(0xc9a878, 1);
  for (let x = rail.minX; x <= rail.maxX + 1e-9; x += 0.4) {
    const at = toScreen(x, rail.y);
    g.fillRect(at.x - 5, at.y - m(0.17), 10, m(0.34));
  }
  g.lineStyle(4, 0x6b6f7a, 1);
  for (const dy of [-RAIL_GAUGE_M / 2, RAIL_GAUGE_M / 2]) g.lineBetween(west.x, west.y - m(dy), east.x, east.y - m(dy));
  g.fillStyle(0xb8532f, 1);
  for (const x of [rail.minX - 0.08, rail.maxX + 0.08]) {
    const at = toScreen(x, rail.y);
    g.fillRoundedRect(at.x - 8, at.y - m(0.22), 16, m(0.44), 4);
  }
}

export class CartView {
  private readonly back: Phaser.GameObjects.Container;
  private readonly front: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Container;
  private readonly wheels: Phaser.GameObjects.Image[];
  readonly readout: Phaser.GameObjects.Text;
  private screenX = 0;
  private screenY = 0;

  constructor(
    scene: Phaser.Scene,
    readonly id: string,
    loaded: boolean,
    shadowDepth: number,
    readoutDepth: number,
  ) {
    // Parts of art/props/cart.svg: the back (and the rocks of the loaded cart) behind a rider,
    // the front and wheels in front of one.
    this.shadow = scene.add.container(0, 0, [propPart(scene, 'cart', 'shadow')]).setDepth(shadowDepth);
    this.back = scene.add.container(0, 0, [propPart(scene, 'cart', 'back'), ...(loaded ? [propPart(scene, 'cart', 'rocks')] : [])]);
    this.wheels = [propPart(scene, 'cart', 'wheel-west'), propPart(scene, 'cart', 'wheel-east')];
    this.front = scene.add.container(0, 0, [propPart(scene, 'cart', 'front'), ...this.wheels]);
    this.readout = scene.add
      .text(0, 0, speedReadout(0), {
        fontFamily: FONT,
        fontSize: '16px',
        color: cssColor(PALETTE.ink),
        backgroundColor: cssColor(PALETTE.panel),
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(readoutDepth);
  }

  /**
   * Draw at rail position `x` (m, interpolated) with the sim's current velocity `v`. With a
   * rider the readout moves up, clear of the bean's head.
   */
  draw(x: number, railY: number, v: number, ridden = false): void {
    const at = toScreen(x, railY - RAIL_GAUGE_M / 2); // on the near rail
    const depth = depthKey(railY);
    this.screenX = at.x;
    this.screenY = at.y;
    this.back.setPosition(at.x, at.y).setDepth(depth + CART_BACK_DEPTH);
    this.front.setPosition(at.x, at.y).setDepth(depth + CART_FRONT_DEPTH);
    this.shadow.setPosition(at.x, at.y);
    // Wheels roll without slipping: angle = distance / radius.
    for (const w of this.wheels) w.setRotation(x / CART_WHEEL_RADIUS_M);
    this.readout.setPosition(at.x, at.y - m(ridden ? 1.35 : 0.95)).setText(speedReadout(v));
  }

  get screen(): { x: number; y: number } {
    return { x: this.screenX, y: this.screenY };
  }
}
