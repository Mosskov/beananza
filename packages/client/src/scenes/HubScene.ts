import Phaser from 'phaser';
import { PIXELS_PER_METER } from '@beananza/shared';
import { FIXED_DT, Sim, createHubScenario, type HubCommand, type HubInput, type HubState } from '@beananza/sim';
import { prefersReducedMotion } from '../accessibility';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, cssColor } from '../config';
import { BeanRig, createBeanShadow } from '../rig/BeanRig';
import { chooseClip, samplePose } from '../rig/player';
import { viewForFacing } from '../rig/views';
import { SimScene } from './SimScene';
import { CART_FLOOR_M, CART_RIDER_DEPTH, CartView, drawRail, speedReadout } from './hub-carts';
import { characterScreen, depthKey, depthScale, groundFromScreen, toScreen } from './hub-view';

const m = (meters: number) => meters * PIXELS_PER_METER;

/** Ground point the camera centres on (m): the middle of the walkable area, a bit north. */
const VIEW_CENTER = { x: 0, y: -0.5 };
/** Ground, backdrop and shadows sit below everything that is depth-sorted. */
const GROUND_DEPTH = -1e6;
/**
 * Characters draw in front of props on the same ground row. Explicit, so the draw order never
 * depends on which object was created first (depth keys are whole pixels apart otherwise).
 */
const CHARACTER_TIE_BREAK = 0.5;
const UI_DEPTH = 1e6;

// PLACEHOLDER art: a round tree (trunk plus canopy) standing on the prop footprint.
const TRUNK_WIDTH_M = 0.2;
const TRUNK_HEIGHT_M = 1.35;
const CANOPY_RADIUS_M = 0.72;
const CANOPY_HEIGHT_M = 1.75;

const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';
/** Pushing a cart this heavy or heavier plays the heavy push (lean 16°, slower steps). */
const HEAVY_PUSH_KG = 10;

interface BeanView {
  rig: BeanRig;
  shadow: Phaser.GameObjects.Container;
}

/** What the rig showed last frame, for the shot logs. */
interface RigShown {
  view: string;
  mirrored: boolean;
  clip: string;
  clipT: number;
  /** Body transform of the pose (art units, degrees): bob y, lean or waddle, squash. */
  body: { y: number; rotation: number; scaleX: number; scaleY: number };
}

/**
 * The hub plaza (D1: ¾ top-down). Walk with arrows or WASD, run with Shift, jump with Space,
 * or tap a spot to walk there. Walk into a cart's end to push it; E gets in or out of the
 * light cart. The scene only draws sim state and turns input into commands.
 */
export class HubScene extends SimScene<HubState, HubCommand> {
  private bean!: BeanView;
  private props = new Map<string, Phaser.GameObjects.Container>();
  private prev = { x: 0, y: 0, z: 0 };
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'shift', Phaser.Input.Keyboard.Key>;
  private sentInput: HubInput = { x: 0, y: 0, run: false };
  private reducedMotion = false;
  private rigShown: RigShown | null = null;
  private carts = new Map<string, CartView>();
  private prevCarts = new Map<string, number>();

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
    if (layout.rail) {
      drawRail(this, layout.rail, GROUND_DEPTH + 0.5);
      for (const c of layout.rail.carts) {
        this.carts.set(c.id, new CartView(this, c.id, !c.ridable, GROUND_DEPTH + 1, UI_DEPTH - 1));
      }
    }
    this.reducedMotion = prefersReducedMotion();
    this.bean = { rig: new BeanRig(this), shadow: createBeanShadow(this).setDepth(GROUND_DEPTH + 1) };

    const center = toScreen(VIEW_CENTER.x, VIEW_CENTER.y);
    this.cameras.main.centerOn(center.x, center.y);

    // Controls hint only (allowed by the no-text rule). PLACEHOLDER UI font and style.
    this.add
      .text(GAME_WIDTH - 20, GAME_HEIGHT - 16, 'Move: arrows or WASD   Run: Shift   Jump: Space   Action: E', {
        fontFamily: FONT,
        fontSize: '18px',
        color: cssColor(PALETTE.inkSecondary),
      })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);

    this.setUpInput();
    this.beforeStep();
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
    kb.on('keydown-E', (event: KeyboardEvent) => {
      if (!event.repeat) this.sim.enqueue({ type: 'action' });
    });
    kb.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, () => this.syncHeldInput());
    kb.on(Phaser.Input.Keyboard.Events.ANY_KEY_UP, () => this.syncHeldInput());

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return; // Primary button or touch only.
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
    for (const c of this.sim.state.rail?.carts ?? []) this.prevCarts.set(c.id, c.x);
  }

  protected drawState(alpha: number): void {
    const b = this.sim.state.bean;
    const lerp = (a: number, c: number) => a + (c - a) * alpha;
    const x = lerp(this.prev.x, b.x);
    const y = lerp(this.prev.y, b.y);
    const z = lerp(this.prev.z, b.z);
    const scale = depthScale(y, this.sim.state.layout.walkable);
    const rail = this.sim.state.layout.rail;
    for (const c of this.sim.state.rail?.carts ?? []) {
      this.carts.get(c.id)?.draw(lerp(this.prevCarts.get(c.id) ?? c.x, c.x), rail?.y ?? 0, c.v);
    }

    // The sim's z and the draw order are unchanged; only the drawn height is scaled (D18).
    // A rider stands on the cart floor, drawn between the back and the front of its cart.
    const riding = b.riding !== null && rail !== null;
    const feet = characterScreen(x, y, riding ? CART_FLOOR_M : z, scale);
    const { rig, shadow } = this.bean;
    const depth = riding ? depthKey(rail.y) + CART_RIDER_DEPTH : depthKey(y) + CHARACTER_TIE_BREAK;
    rig.root.setPosition(feet.x, feet.y).setScale(scale).setDepth(depth);
    const ground = toScreen(x, y);
    // The shadow stays on the ground and shrinks as the bean rises.
    const lift = Math.max(0, 1 - z / 1.5);
    shadow.setPosition(ground.x, ground.y).setScale(scale * (0.55 + 0.45 * lift)).setVisible(!riding);

    // Animation runs on sim time (interpolated like the positions), never on wall-clock time,
    // so paused and scripted shots are deterministic. Idle keeps the last facing.
    const time = this.sim.time - (1 - alpha) * FIXED_DT;
    const choice = viewForFacing(b.facingX, b.facingY);
    const pushedCart = b.pushing ? this.sim.state.rail?.carts.find((c) => c.id === b.pushing?.cart) : undefined;
    const heavy = (pushedCart?.mass ?? 0) >= HEAVY_PUSH_KG;
    const { clip, t } = chooseClip(b, time, this.sim.state.gravity, heavy);
    rig.setView(choice);
    rig.setPartVisible('arm-far-push', b.pushing !== null);
    const pose = samplePose({ clip, t, time, view: choice.view, reducedMotion: this.reducedMotion });
    rig.applyPose(pose);
    const r = (n: number) => Math.round(n * 1e4) / 1e4;
    const { y: by, rotation, scaleX, scaleY } = pose.body;
    this.rigShown = {
      view: choice.view,
      mirrored: choice.mirrored,
      clip,
      clipT: r(t),
      body: { y: r(by), rotation: r(rotation), scaleX: r(scaleX), scaleY: r(scaleY) },
    };
  }

  override debugState(): unknown {
    const base = super.debugState() as Record<string, unknown>;
    const cam = this.cameras.main;
    const onScreen = (o: Phaser.GameObjects.Components.Transform) => ({
      x: Math.round((o.x - cam.scrollX) * 10) / 10,
      y: Math.round((o.y - cam.scrollY) * 10) / 10,
    });
    const beanRoot = this.bean.rig.root;
    const beanDepth = beanRoot.depth;
    return {
      ...base,
      view: {
        bean: { screen: onScreen(beanRoot), scale: beanRoot.scaleX, depth: beanDepth, rig: this.rigShown },
        reducedMotion: this.reducedMotion,
        carts: (this.sim.state.rail?.carts ?? []).map((c) => {
          const view = this.carts.get(c.id);
          return {
            id: c.id,
            mass: c.mass + c.riderMass,
            v: c.v,
            readout: view?.readout.text ?? null,
            expectedReadout: speedReadout(c.v),
            screen: view ? { x: Math.round((view.screen.x - cam.scrollX) * 10) / 10, y: Math.round((view.screen.y - cam.scrollY) * 10) / 10 } : null,
          };
        }),
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
