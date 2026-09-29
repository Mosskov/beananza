import Phaser from 'phaser';
import { PIXELS_PER_METER } from '@beananza/shared';
import type { RailLayout } from '@beananza/sim';
import { PALETTE, cssColor } from '../config';
import { depthKey, toScreen } from './hub-view';

const m = (meters: number) => meters * PIXELS_PER_METER;

// PLACEHOLDER art for the rail and carts until the prop art exists (D12: carts on a straight
// rail never turn, so one drawing each). Sizes in metres: 0.8 m long, rim 0.48 m high.
const WHEEL_R = 0.09;
const WHEEL_X = 0.24;
const RIM_Y = 0.48;
const BACK_RIM_Y = 0.58;
/** Height of the cart floor a rider stands on (m); the front of the cart hides the bean's feet. */
export const CART_FLOOR_M = 0.1;
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
  for (const dy of [-0.1, 0.1]) g.lineBetween(west.x, west.y - m(dy), east.x, east.y - m(dy));
  g.fillStyle(0xb8532f, 1);
  for (const x of [rail.minX - 0.08, rail.maxX + 0.08]) {
    const at = toScreen(x, rail.y);
    g.fillRoundedRect(at.x - 8, at.y - m(0.22), 16, m(0.44), 4);
  }
}

export class CartView {
  private readonly back: Phaser.GameObjects.Container;
  private readonly front: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly wheels: Phaser.GameObjects.Graphics[] = [];
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
    this.shadow = scene.add.ellipse(0, m(0.04), m(0.9), m(0.16), PALETTE.ink, 0.16).setDepth(shadowDepth);
    const pts = (list: [number, number][]) => list.map(([x, y]) => new Phaser.Math.Vector2(m(x), -m(y)));
    const backRim = scene.add.graphics();
    backRim.fillStyle(0x5e3f2a, 1).fillPoints(pts([[-0.4, RIM_Y], [0.4, RIM_Y], [0.34, BACK_RIM_Y], [-0.34, BACK_RIM_Y]]), true);
    const backParts: Phaser.GameObjects.GameObject[] = [backRim];
    if (loaded) {
      // The 20 kg cart carries rocks (it cannot be ridden).
      backParts.push(
        scene.add.circle(m(-0.18), -m(0.6), m(0.11), 0x9a948a),
        scene.add.circle(m(0.02), -m(0.65), m(0.12), 0xada79d),
        scene.add.circle(m(0.2), -m(0.59), m(0.1), 0x9a948a),
      );
    }
    this.back = scene.add.container(0, 0, backParts);

    const body = scene.add.graphics();
    body.fillStyle(0x8a5c3c, 1).fillPoints(pts([[-0.4, RIM_Y], [0.4, RIM_Y], [0.34, 0.06], [-0.34, 0.06]]), true);
    body.lineStyle(1.5, 0x6b4a36, 1);
    body.lineBetween(m(-0.38), -m(0.34), m(0.38), -m(0.34)).lineBetween(m(-0.36), -m(0.2), m(0.36), -m(0.2));
    body.lineStyle(3, 0xc99a6b, 1).lineBetween(m(-0.4), -m(RIM_Y), m(0.4), -m(RIM_Y));
    const frontParts: Phaser.GameObjects.GameObject[] = [body];
    for (const wx of [-WHEEL_X, WHEEL_X]) {
      const wheel = scene.add.graphics({ x: m(wx), y: -m(WHEEL_R) });
      wheel.fillStyle(0x3b4a6b, 1).fillCircle(0, 0, m(WHEEL_R));
      wheel.lineStyle(2, 0x8e9aae, 1).lineBetween(-m(0.07), 0, m(0.07), 0).lineBetween(0, -m(0.07), 0, m(0.07));
      this.wheels.push(wheel);
      frontParts.push(wheel);
    }
    this.front = scene.add.container(0, 0, frontParts);
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
    const at = toScreen(x, railY);
    const depth = depthKey(railY);
    this.screenX = at.x;
    this.screenY = at.y;
    this.back.setPosition(at.x, at.y).setDepth(depth + CART_BACK_DEPTH);
    this.front.setPosition(at.x, at.y).setDepth(depth + CART_FRONT_DEPTH);
    this.shadow.setPosition(at.x, at.y + m(0.04));
    // Wheels roll without slipping: angle = distance / radius.
    for (const w of this.wheels) w.setRotation(x / WHEEL_R);
    this.readout.setPosition(at.x, at.y - m(ridden ? 1.35 : 0.95)).setText(speedReadout(v));
  }

  get screen(): { x: number; y: number } {
    return { x: this.screenX, y: this.screenY };
  }
}
