import Phaser from 'phaser';
import { PIXELS_PER_METER } from '@beananza/shared';
import { Sim, createHubScenario, type HubCommand, type HubInput, type HubState } from '@beananza/sim';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, cssColor } from '../config';
import { SimScene } from './SimScene';
import { depthKey, depthScale, groundFromScreen, toScreen } from './hub-view';

const m = (meters: number) => meters * PIXELS_PER_METER;

/** Ground point the camera centres on (m): the middle of the walkable area, a bit north. */
const VIEW_CENTER = { x: 0, y: -0.5 };
/** Ground, backdrop and shadows sit below everything that is depth-sorted. */
const GROUND_DEPTH = -1e6;
const UI_DEPTH = 1e6;

// PLACEHOLDER art: a bean-ish ellipse with a belly and eyes until the parts rig (D3) exists.
// Size at scale 1, in metres; the depth scale shrinks it towards the back.
const BEAN_WIDTH_M = 0.62;
const BEAN_HEIGHT_M = 0.8;
const BEAN_COLOR = 0xe8a33d;
const BEAN_BELLY = 0xf6d49a;

// PLACEHOLDER art: a round tree (trunk plus canopy) standing on the prop footprint.
const TRUNK_WIDTH_M = 0.2;
const TRUNK_HEIGHT_M = 1.35;
const CANOPY_RADIUS_M = 0.72;
const CANOPY_HEIGHT_M = 1.75;

const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';

interface BeanView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  eyes: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
}

/**
 * The hub plaza (D1: ¾ top-down). Walk with arrows or WASD, run with Shift, jump with Space,
 * or tap a spot to walk there. The scene only draws sim state and turns input into commands.
 */
export class HubScene extends SimScene<HubState, HubCommand> {
  private bean!: BeanView;
  private props = new Map<string, Phaser.GameObjects.Container>();
  private prev = { x: 0, y: 0, z: 0 };
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'shift', Phaser.Input.Keyboard.Key>;
  private sentInput: HubInput = { x: 0, y: 0, run: false };

  constructor() {
    super({ key: 'hub' });
  }

  protected createSim(): Sim<HubState, HubCommand> {
    return new Sim(createHubScenario(), 1);
  }

  protected createView(): void {
    const { layout } = this.sim.state;
    this.drawGround();
    for (const prop of layout.props) {
      const root = this.drawTree();
      const at = toScreen(prop.x, prop.y);
      root.setPosition(at.x, at.y).setDepth(depthKey(prop.y));
      this.props.set(prop.id, root);
    }
    this.bean = this.drawBean();

    const center = toScreen(VIEW_CENTER.x, VIEW_CENTER.y);
    this.cameras.main.centerOn(center.x, center.y);

    // Controls hint only (allowed by the no-text rule). PLACEHOLDER UI font and style.
    this.add
      .text(GAME_WIDTH - 20, GAME_HEIGHT - 16, 'Move: arrows or WASD   Run: Shift   Jump: Space', {
        fontFamily: FONT,
        fontSize: '18px',
        color: cssColor(PALETTE.inkSecondary),
      })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);

    this.setUpInput();
    const b = this.sim.state.bean;
    this.prev = { x: b.x, y: b.y, z: b.z };
  }

  private drawGround(): void {
    const w = this.sim.state.layout.walkable;
    const g = this.add.graphics().setDepth(GROUND_DEPTH);
    // PLACEHOLDER art: grass everywhere, a hedge band to the north, a stone plaza floor.
    g.fillStyle(PALETTE.grass, 1).fillRect(m(-12), m(-8), m(24), m(16));
    const nw = toScreen(w.minX, w.maxY);
    const se = toScreen(w.maxX, w.minY);
    g.fillStyle(0x7fa86a, 1).fillRect(m(-12), nw.y - m(3.2), m(24), m(2.2));
    g.fillStyle(PALETTE.stone, 1).fillRoundedRect(nw.x, nw.y, se.x - nw.x, se.y - nw.y, 18);
    g.lineStyle(4, PALETTE.cardShadow, 1).strokeRoundedRect(nw.x, nw.y, se.x - nw.x, se.y - nw.y, 18);
  }

  private drawTree(): Phaser.GameObjects.Container {
    // Origin is the middle of the footprint on the ground.
    const shadow = this.add.ellipse(0, 0, m(1.1), m(0.34), PALETTE.ink, 0.18);
    const trunk = this.add
      .rectangle(0, 0, m(TRUNK_WIDTH_M), m(TRUNK_HEIGHT_M), 0x8a5a3b)
      .setOrigin(0.5, 1)
      .setStrokeStyle(3, PALETTE.ink, 0.8);
    const canopy = this.add
      .circle(0, -m(CANOPY_HEIGHT_M), m(CANOPY_RADIUS_M), 0x5f9150)
      .setStrokeStyle(4, PALETTE.ink, 0.8);
    const highlight = this.add.circle(-m(0.22), -m(CANOPY_HEIGHT_M + 0.22), m(0.22), 0x78ad66);
    return this.add.container(0, 0, [shadow, trunk, canopy, highlight]);
  }

  private drawBean(): BeanView {
    const w = m(BEAN_WIDTH_M);
    const h = m(BEAN_HEIGHT_M);
    const shadow = this.add.ellipse(0, 0, w * 0.9, w * 0.3, PALETTE.ink, 0.22).setDepth(GROUND_DEPTH + 1);
    const outline = this.add.ellipse(0, -h / 2, w, h, BEAN_COLOR).setStrokeStyle(4, PALETTE.ink, 1);
    const belly = this.add.ellipse(0, -h * 0.34, w * 0.62, h * 0.46, BEAN_BELLY);
    const eyeY = -h * 0.66;
    const eyes = this.add.container(0, 0, [
      this.add.ellipse(-w * 0.14, eyeY, 9, 13, PALETTE.ink),
      this.add.ellipse(w * 0.14, eyeY, 9, 13, PALETTE.ink),
    ]);
    const body = this.add.container(0, 0, [outline, belly, eyes]);
    const root = this.add.container(0, 0, [body]);
    return { root, body, eyes, shadow };
  }

  private setUpInput(): void {
    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard input is not available.');
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys(
      { up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D, shift: K.SHIFT },
      true,
    ) as typeof this.keys;
    kb.addCapture([K.SPACE]);
    kb.on('keydown-SPACE', (event: KeyboardEvent) => {
      if (!event.repeat) this.sim.enqueue({ type: 'jump' });
    });
    kb.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, () => this.syncHeldInput());
    kb.on(Phaser.Input.Keyboard.Events.ANY_KEY_UP, () => this.syncHeldInput());

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      const ground = groundFromScreen(pointer.worldX, pointer.worldY);
      this.sim.enqueue({ type: 'moveTo', x: ground.x, y: ground.y });
    });
  }

  /** Send a `move` command whenever the held direction or Run changes. */
  private syncHeldInput(): void {
    const k = this.keys;
    const x = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const y = (k.up.isDown || k.w.isDown ? 1 : 0) - (k.down.isDown || k.s.isDown ? 1 : 0);
    const run = k.shift.isDown;
    const sent = this.sentInput;
    if (x === sent.x && y === sent.y && run === sent.run) return;
    this.sentInput = { x, y, run };
    this.sim.enqueue({ type: 'move', x, y, run });
  }

  override update(time: number, deltaMs: number): void {
    // Also catch keys Phaser released without an event (e.g. the window lost focus).
    this.syncHeldInput();
    super.update(time, deltaMs);
  }

  protected override beforeStep(): void {
    const b = this.sim.state.bean;
    this.prev = { x: b.x, y: b.y, z: b.z };
  }

  protected drawState(alpha: number): void {
    const b = this.sim.state.bean;
    const lerp = (a: number, c: number) => a + (c - a) * alpha;
    const x = lerp(this.prev.x, b.x);
    const y = lerp(this.prev.y, b.y);
    const z = lerp(this.prev.z, b.z);
    const scale = depthScale(y, this.sim.state.layout.walkable);

    const feet = toScreen(x, y, z);
    this.bean.root.setPosition(feet.x, feet.y).setScale(scale).setDepth(depthKey(y));
    const ground = toScreen(x, y);
    // The shadow stays on the ground and shrinks as the bean rises.
    const lift = Math.max(0, 1 - z / 1.5);
    this.bean.shadow.setPosition(ground.x, ground.y).setScale(scale * (0.55 + 0.45 * lift));

    // PLACEHOLDER facing: eyes shift towards the movement direction and hide when facing away.
    this.bean.eyes.setX(b.facingX * m(BEAN_WIDTH_M) * 0.16);
    this.bean.eyes.setVisible(b.facingY < 0.5);
  }

  override debugState(): unknown {
    const base = super.debugState() as Record<string, unknown>;
    const cam = this.cameras.main;
    const onScreen = (o: Phaser.GameObjects.Components.Transform) => ({
      x: Math.round((o.x - cam.scrollX) * 10) / 10,
      y: Math.round((o.y - cam.scrollY) * 10) / 10,
    });
    const beanDepth = this.bean.root.depth;
    return {
      ...base,
      view: {
        bean: { screen: onScreen(this.bean.root), scale: this.bean.root.scaleX, depth: beanDepth },
        props: [...this.props].map(([id, root]) => ({
          id,
          screen: onScreen(root),
          depth: root.depth,
          bean: beanDepth > root.depth ? 'in front' : 'behind',
        })),
      },
    };
  }
}
