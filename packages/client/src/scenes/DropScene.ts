import Phaser from 'phaser';
import { PIXELS_PER_METER } from '@beananza/shared';
import { Sim, createDropScenario, type DropCommand, type DropState } from '@beananza/sim';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, UI_FONT as FONT, cssColor } from '../config';
import { SimScene } from './SimScene';

/** Side view: world metres to scene pixels. +Y up in the sim, +Y down on screen. */
const px = (meters: number) => meters * PIXELS_PER_METER;
const py = (meters: number) => -meters * PIXELS_PER_METER;

/** How much of the world the camera frames vertically (ground to a bit above the release). */
const VIEW_BOTTOM_M = -0.8;
const VIEW_TOP_M = 11.2;
/** Horizontal centre of the framed content (ruler on the left, balls to its right). */
const VIEW_CENTER_X_M = -0.6;

// PLACEHOLDER art: plain circles until real props exist. The sim treats each ball as a point
// mass at its lowest point. Both are drawn the same size (think wood and iron) so that level
// bottoms also mean level centres; mass shows in the color and the label.
const BALL_RADIUS_M = 0.35;
const BALL_LOOK: Record<string, { radiusM: number; color: number; label: string }> = {
  light: { radiusM: BALL_RADIUS_M, color: 0xe07a55, label: '1 kg' },
  heavy: { radiusM: BALL_RADIUS_M, color: PALETTE.inkSecondary, label: '10 kg' },
};


/** Proof scene: a 1 kg and a 10 kg ball dropped together from 10 m land together. */
export class DropScene extends SimScene<DropState, DropCommand> {
  private balls = new Map<string, { circle: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text; prevY: number }>();
  private levelLine!: Phaser.GameObjects.Graphics;
  private timerText!: Phaser.GameObjects.Text;
  private landedText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'drop' });
  }

  protected createSim(): Sim<DropState, DropCommand> {
    return new Sim(createDropScenario(), 1);
  }

  protected createView(): void {
    const world: Phaser.GameObjects.GameObject[] = [];
    const height = this.sim.state.releaseHeight;

    // PLACEHOLDER art: ground strip.
    world.push(this.add.rectangle(0, 0, px(40), px(3), PALETTE.grass).setOrigin(0.5, 0));
    world.push(this.add.rectangle(0, 0, px(40), 6, PALETTE.ink, 0.35).setOrigin(0.5, 0.5));

    // Measuring ruler: a tick every metre, labels at 0, 5 and 10 m.
    const rulerX = px(-3.4);
    const ruler = this.add.graphics();
    ruler.lineStyle(6, PALETTE.inkSecondary, 1);
    ruler.lineBetween(rulerX, py(0), rulerX, py(height));
    for (let m = 0; m <= height; m++) {
      const major = m % 5 === 0;
      ruler.lineBetween(rulerX, py(m), rulerX + (major ? 40 : 22), py(m));
      if (major) {
        world.push(
          this.add
            .text(rulerX - 18, py(m), `${m} m`, { fontFamily: FONT, fontSize: '40px', color: cssColor(PALETTE.inkSecondary) })
            .setOrigin(1, 0.5),
        );
      }
    }
    world.push(ruler);

    // Release height marker.
    const release = this.add.graphics();
    release.lineStyle(4, PALETTE.labelAccent, 0.8);
    for (let x = -2.6; x < 2.6; x += 0.3) release.lineBetween(px(x), py(height), px(x + 0.15), py(height));
    world.push(release);

    // Line joining the two ball bottoms: level when they are at the same height.
    this.levelLine = this.add.graphics();
    world.push(this.levelLine);

    for (const ball of this.sim.state.balls) {
      const look = BALL_LOOK[ball.id];
      if (!look) throw new Error(`No look for ball "${ball.id}"`);
      const circle = this.add.circle(px(ball.x), py(ball.y + look.radiusM), px(look.radiusM), look.color);
      const side = ball.x < 0 ? -1 : 1;
      const label = this.add
        .text(0, 0, look.label, { fontFamily: FONT, fontSize: '44px', color: cssColor(PALETTE.ink) })
        .setOrigin(side < 0 ? 1 : 0, 0.5);
      this.balls.set(ball.id, { circle, label, prevY: ball.y });
      world.push(circle, label);
    }

    const main = this.cameras.main;
    main.setZoom(GAME_HEIGHT / px(VIEW_TOP_M - VIEW_BOTTOM_M));
    main.centerOn(px(VIEW_CENTER_X_M), py((VIEW_TOP_M + VIEW_BOTTOM_M) / 2));

    // Readouts live on a second, unzoomed camera.
    // PLACEHOLDER UI: plain system-font text until the field-notebook overlay style exists.
    this.timerText = this.add.text(32, 24, '', { fontFamily: FONT, fontSize: '40px', color: cssColor(PALETTE.ink) });
    this.landedText = this.add.text(32, 76, '', {
      fontFamily: FONT,
      fontSize: '24px',
      color: cssColor(PALETTE.inkSecondary),
      lineSpacing: 6,
    });
    const hint = this.add
      .text(GAME_WIDTH - 24, GAME_HEIGHT - 20, 'R or tap: drop again', {
        fontFamily: FONT,
        fontSize: '20px',
        color: cssColor(PALETTE.inkSecondary),
      })
      .setOrigin(1, 1);
    const ui = [this.timerText, this.landedText, hint];
    const uiCamera = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT);
    uiCamera.ignore(world);
    main.ignore(ui);

    // Input only becomes commands for the sim.
    const reset = () => this.sim.enqueue({ type: 'reset' });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, reset);
    this.input.keyboard?.on('keydown-R', reset);
  }

  protected override beforeStep(): void {
    for (const ball of this.sim.state.balls) {
      const view = this.balls.get(ball.id);
      if (view) view.prevY = ball.y;
    }
  }

  protected drawState(alpha: number): void {
    const bottoms: { x: number; y: number }[] = [];
    for (const ball of this.sim.state.balls) {
      const view = this.balls.get(ball.id);
      const look = BALL_LOOK[ball.id];
      if (!view || !look) continue;
      // Interpolate between the last two steps; a ball only moves up on reset, so snap then.
      const y = view.prevY < ball.y ? ball.y : view.prevY + (ball.y - view.prevY) * alpha;
      view.circle.setPosition(px(ball.x), py(y + look.radiusM));
      const side = ball.x < 0 ? -1 : 1;
      view.label.setPosition(px(ball.x + side * (look.radiusM + 0.25)), py(y + look.radiusM));
      bottoms.push({ x: px(ball.x), y: py(y) });
    }

    this.levelLine.clear();
    const [a, b] = bottoms;
    if (a && b) {
      this.levelLine.lineStyle(5, PALETTE.gold, 1);
      this.levelLine.lineBetween(a.x, a.y, b.x, b.y);
    }

    this.timerText.setText(`t = ${this.sim.time.toFixed(3)} s`);
    this.landedText.setText(
      this.sim.state.balls.map((ball) => {
        const label = BALL_LOOK[ball.id]?.label ?? ball.id;
        return ball.landedAt === null ? `${label}: falling` : `${label}: landed at ${ball.landedAt.toFixed(3)} s`;
      }),
    );
  }
}
