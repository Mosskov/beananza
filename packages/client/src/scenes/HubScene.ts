import Phaser from 'phaser';
import { PIXELS_PER_METER } from '@beananza/shared';
import { CART_HALF_DEPTH, CART_HALF_LENGTH, DEFAULT_LAYOUT, FIXED_DT, HUB_BEAN_RADIUS_M, HUB_LAYOUTS, Sim, createHubScenario, polygonBounds, seatSpot, standSpot, type HubCommand, type HubInput, type HubState, type Rect } from '@beananza/sim';
import { prefersReducedMotion } from '../accessibility';
import { PROP_PARTS, propAnchor, propPart } from '../art/props';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, UI_FONT, cssColor } from '../config';
import { BeanRig, createBeanShadow } from '../rig/BeanRig';
import { beanArt } from '../rig/bean-art';
import { chooseClip, samplePose } from '../rig/player';
import { viewForFacing } from '../rig/views';
import { SimScene } from './SimScene';
import { CART_RIDER_DEPTH, CartView, drawRiderMask, drawRail, speedReadout } from './hub-carts';
import { CLASSMATES, greetingAt, type Classmate } from './classmates';
import { PART_DEFAULTS, presentAct, type Placement, type ToggledPart } from './hub-presentation';
import { cartStandOff, characterScreen, depthKey, depthScale, groundFromScreen, toScreen } from './hub-view';

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
/** Seated classmates sort just behind a character on their row (Priya and the bean on the bench row). */
const CLASSMATE_TIE_BREAK = 0.4;
const UI_DEPTH = 1e6;

/** Gap between a bean's head and the readout of the cart it is using (art units). */
const READOUT_GAP_UNITS = 12;

/** Controls hint, bottom right (allowed by the no-text rule). PLACEHOLDER style. */
const HINT_STYLE = { fontFamily: UI_FONT, fontSize: '18px', color: cssColor(PALETTE.inkSecondary) };
/** A classmate's greeting bubble. PLACEHOLDER style. */
const BUBBLE_STYLE = {
  fontFamily: UI_FONT,
  fontSize: '20px',
  fontStyle: 'bold',
  color: cssColor(PALETTE.ink),
  backgroundColor: cssColor(PALETTE.panel),
  padding: { x: 10, y: 4 },
};

/**
 * PLACEHOLDER ground (m, around the plaza's origin): grass over the whole backdrop, a hedge band
 * north of the plaza, and the plaza's stone floor with a rounded edge (px).
 */
const BACKDROP = { minX: -12, minY: -8, width: 24, height: 16 };
const HEDGE = { gapM: 1, depthM: 2.2 };
const PLAZA_CORNER_PX = 18;
const PLAZA_EDGE_PX = 4;

/** The shadow shrinks as the bean rises, to this share of its size at SHADOW_FADE_M up. */
const SHADOW_MIN_SCALE = 0.55;
const SHADOW_FADE_M = 1.5;

interface BeanView {
  rig: BeanRig;
  shadow: Phaser.GameObjects.Container;
}

/** What the rig showed last frame, for the shot logs. */
interface RigShown {
  /** The sim's interaction state and how the presentation table drew it. */
  act: string;
  placement: string;
  /** The rider mask was on (in a cart). */
  masked: boolean;
  /** Height drawn (m): the sim's z, or the flat hop under reduced motion. */
  drawnZ: number;
  /** The feet's pose offsets (art units): dangling and swinging on the bench. */
  feet: { a: { x: number; y: number }; b: { x: number; y: number } };
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
  /** Props a tap uses (sends `use`) instead of walking there. */
  private usable = new Set<string>();
  /** Seated classmates (Priya), drawn on the seats the sim keeps for them. */
  private classmates: { who: Classmate; rig: BeanRig; bubble: Phaser.GameObjects.Text; greeting: number | null; clip: string }[] = [];
  /** The rider's mask shape (world coordinates), used while the bean is in a cart. */
  private riderMaskShape!: Phaser.GameObjects.Graphics;
  /** The walkable area's bounding box (m), for the depth scale. */
  private bounds!: Rect;

  constructor() {
    super({ key: 'hub' });
  }

  /** The plaza, or a test yard (`?layout=`). */
  private get layoutName(): string {
    return this.layout ?? DEFAULT_LAYOUT;
  }

  protected createSim(): Sim<HubState, HubCommand> {
    const layout = HUB_LAYOUTS[this.layoutName];
    if (!layout) throw new Error(`No hub layout "${this.layoutName}".`);
    this.bounds = polygonBounds(layout.walkable);
    return new Sim(createHubScenario({ layout }), 1);
  }

  protected createView(): void {
    const { layout } = this.sim.state;
    this.drawGround();
    // Props that never turn: every part of their drawing, origin at the middle of the footprint.
    for (const prop of [...layout.props, ...layout.benches]) {
      const parts = PROP_PARTS[prop.art];
      if (!parts) throw new Error(`Prop ${prop.id}: no drawing "${prop.art}" in art/props/.`);
      const root = this.add.container(0, 0, parts.map((part) => propPart(this, prop.art, part)));
      const at = toScreen(prop.x, prop.y);
      root.setPosition(at.x, at.y).setDepth(depthKey(prop.y));
      this.props.set(prop.id, root);
      if (prop.usable) this.usable.add(prop.id);
    }
    if (layout.rail) {
      drawRail(this, layout.rail, GROUND_DEPTH + 0.5);
      for (const c of layout.rail.carts) {
        this.carts.set(c.id, new CartView(this, c.id, !c.ridable, GROUND_DEPTH + 1, UI_DEPTH - 1));
      }
    }
    this.reducedMotion = prefersReducedMotion();
    this.createClassmates();
    this.bean = { rig: new BeanRig(this, this.look), shadow: createBeanShadow(this).setDepth(GROUND_DEPTH + 1) };
    // The rider mask (D23): a WebGL mask filter on the rig, rendered only while in a cart.
    this.riderMaskShape = this.make.graphics({}, false);
    this.bean.rig.root.enableFilters();
    this.bean.rig.root.filters?.internal.addMask(this.riderMaskShape, false, undefined, 'world');
    this.bean.rig.root.renderFilters = false;

    const center = toScreen(VIEW_CENTER.x, VIEW_CENTER.y);
    this.cameras.main.centerOn(center.x, center.y);

    // Controls hint only (allowed by the no-text rule). PLACEHOLDER UI font and style.
    this.add
      .text(GAME_WIDTH - 20, GAME_HEIGHT - 16, 'Move: arrows or WASD   Run: Shift   Jump: Space   Action: E', HINT_STYLE)
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);

    this.setUpInput();
    this.beforeStep();
  }

  private drawGround(): void {
    const w = this.bounds;
    const g = this.add.graphics().setDepth(GROUND_DEPTH);
    const b = BACKDROP;
    g.fillStyle(PALETTE.grass, 1).fillRect(m(b.minX), m(b.minY), m(b.width), m(b.height));
    const nw = toScreen(w.minX, w.maxY);
    const se = toScreen(w.maxX, w.minY);
    g.fillStyle(PALETTE.hedge, 1).fillRect(m(b.minX), nw.y - m(HEDGE.gapM + HEDGE.depthM), m(b.width), m(HEDGE.depthM));
    g.fillStyle(PALETTE.stone, 1).fillRoundedRect(nw.x, nw.y, se.x - nw.x, se.y - nw.y, PLAZA_CORNER_PX);
    g.lineStyle(PLAZA_EDGE_PX, PALETTE.cardShadow, 1).strokeRoundedRect(nw.x, nw.y, se.x - nw.x, se.y - nw.y, PLAZA_CORNER_PX);
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
      // A tap on a usable prop's drawing uses it (the bench: walk over and sit); anywhere else
      // walks there.
      for (const id of this.usable) {
        if (this.props.get(id)?.getBounds().contains(pointer.worldX, pointer.worldY)) {
          this.sim.enqueue({ type: 'use', id });
          return;
        }
      }
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
    const scale = depthScale(y, this.bounds);
    const rail = this.sim.state.layout.rail;
    const act = b.act;
    // Animation runs on sim time (interpolated like the positions), never on wall-clock time,
    // so paused and scripted shots are deterministic. Idle keeps the last facing.
    const time = this.sim.time - (1 - alpha) * FIXED_DT;
    const look = presentAct(act, this.sim.state, time);
    this.drawClassmates(time);
    const inCart = look.placement.kind === 'cart' ? look.placement.cart : null;
    for (const c of this.sim.state.rail?.carts ?? []) {
      this.carts.get(c.id)?.draw(lerp(this.prevCarts.get(c.id) ?? c.x, c.x), rail?.y ?? 0, c.v, look.usingCart === c.id);
    }

    // The sim's z and the draw order are unchanged; only the drawn height is scaled (D18).
    // Under reduced motion a hop moves in a straight line (no arc).
    let drawnZ = this.reducedMotion && look.flatZ !== null ? look.flatZ : z;
    let feet = characterScreen(x, y, drawnZ, scale);
    const { rig, shadow } = this.bean;
    // In a cart the bean draws between the back and the front of the cart, and below the rim
    // only inside the cart's front (it is wider than the cart).
    const cartView = inCart !== null && rail !== null ? this.carts.get(inCart) : undefined;
    let depth = cartView && rail ? depthKey(rail.y) + CART_RIDER_DEPTH : depthKey(y) + CHARACTER_TIE_BREAK;
    if (look.placement.kind === 'seat') {
      const seated = this.seatPlacement(look.placement, scale);
      if (seated) ({ feet, depth, drawnZ } = seated);
    }
    rig.root.setPosition(feet.x, feet.y).setScale(scale).setDepth(depth);
    if (cartView) drawRiderMask(this.riderMaskShape, cartView.screen);
    rig.root.renderFilters = cartView !== undefined;
    const ground = toScreen(x, y);
    // The shadow stays on the ground and shrinks as the bean rises.
    const lift = Math.max(0, 1 - drawnZ / SHADOW_FADE_M);
    shadow.setPosition(ground.x, ground.y).setScale(scale * (SHADOW_MIN_SCALE + (1 - SHADOW_MIN_SCALE) * lift)).setVisible(look.shadow);

    const choice = viewForFacing(b.facingX, b.facingY);
    const { clip, t } = chooseClip(b, time, this.sim.state.gravity, look.clip);
    rig.setView(choice);
    for (const [part, shown] of Object.entries(PART_DEFAULTS)) rig.setPartVisible(part, look.parts[part as ToggledPart] ?? shown);
    // Keep the readout of the cart in use above the bean's head (headwear included), with a gap.
    if (look.usingCart) this.carts.get(look.usingCart)?.keepReadoutAbove(feet.y + (rig.drawnTop() - READOUT_GAP_UNITS) * scale);
    const pose = samplePose({ clip, t, time, view: choice.view, reducedMotion: this.reducedMotion });
    rig.applyPose(pose);
    // The bean's body is wider than its footprint: next to a cart's end (pushing or not), draw
    // it back so the body meets the end instead of overlapping it. Drawing only (and its shadow).
    const onRail = look.standOffCarts > 0 && rail !== null && Math.abs(y - rail.y) < CART_HALF_DEPTH + HUB_BEAN_RADIUS_M;
    if (onRail) {
      const span = rig.bodySpan();
      const pushDir = act.kind === 'pushing' ? act.dir : 0;
      // Leaning while pushing tips the side view's `lean` anchor forward by its height · sin(lean).
      const leanHeight = -(beanArt().spec.anchors.side.lean?.y ?? 0);
      const lean = pushDir !== 0 ? Math.sin((pose.body.rotation * Math.PI) / 180) * leanHeight : 0;
      const cartXs = (this.sim.state.rail?.carts ?? []).map((c) => lerp(this.prevCarts.get(c.id) ?? c.x, c.x));
      const unit = scale / PIXELS_PER_METER; // art units to metres at this depth
      const off = cartStandOff(
        x,
        cartXs,
        CART_HALF_LENGTH,
        (span.west + Math.max(0, -pushDir) * lean) * unit,
        (span.east + Math.max(0, pushDir) * lean) * unit,
      );
      rig.root.x += m(off * look.standOffCarts);
      shadow.x += m(off * look.standOffCarts);
    }
    const r = (n: number) => Math.round(n * 1e4) / 1e4;
    const { y: by, rotation, scaleX, scaleY } = pose.body;
    this.rigShown = {
      act: act.kind,
      placement: look.placement.kind,
      masked: rig.root.renderFilters,
      drawnZ: r(drawnZ),
      feet: { a: { x: r(pose.footA.x), y: r(pose.footA.y) }, b: { x: r(pose.footB.x), y: r(pose.footB.y) } },
      view: choice.view,
      mirrored: choice.mirrored,
      clip,
      clipT: r(t),
      body: { y: r(by), rotation: r(rotation), scaleX: r(scaleX), scaleY: r(scaleY) },
    };
  }

  /**
   * Classmates sit on bench seats the sim marks as taken, facing the camera, in front of the
   * bench like a seated bean. Priya's "Hi!" is the one text in the hub besides readouts and the
   * controls hint (docs/IMPLEMENTATION.md §7). PLACEHOLDER font and bubble style.
   */
  private createClassmates(): void {
    for (const who of CLASSMATES) {
      const bench = this.sim.state.layout.benches.find((b) => b.id === who.bench);
      const seat = bench?.seats.find((q) => q.id === who.seat);
      if (!bench || !seat?.taken) continue;
      const rig = new BeanRig(this, who.look);
      rig.setView({ view: 'front', mirrored: false });
      const at = toScreen(bench.x, bench.y);
      const anchor = propAnchor('bench', `seat-${seat.id}`);
      const scale = depthScale(seatSpot(bench, seat).y, this.bounds);
      // Just behind a bean on the same row (the player draws in front of a classmate on a tie).
      rig.root.setPosition(at.x + anchor.x, at.y + anchor.y).setScale(scale).setDepth(depthKey(bench.y) + CLASSMATE_TIE_BREAK);
      const bubble = this.add
        .text(rig.root.x, rig.root.y + (rig.drawnTop() - READOUT_GAP_UNITS) * scale, 'Hi!', BUBBLE_STYLE)
        .setOrigin(0.5, 1)
        .setDepth(UI_DEPTH - 2)
        .setVisible(false);
      this.classmates.push({ who, rig, bubble, greeting: null, clip: 'sit' });
    }
  }

  /** Classmates sit (feet swinging), and wave and say "Hi!" while greeting the bean. */
  private drawClassmates(time: number): void {
    for (const c of this.classmates) {
      c.greeting = greetingAt(this.sim.state, c.who, time);
      const clip = c.greeting === null ? 'sit' : 'wave';
      c.clip = clip;
      c.rig.applyPose(samplePose({ clip, t: time + c.who.swingOffset, time: time + c.who.swingOffset, view: 'front', reducedMotion: this.reducedMotion }));
      c.bubble.setVisible(c.greeting !== null);
    }
  }

  /**
   * Where a bean on a bench (or hopping on or off it) draws: from its stand spot on the ground
   * (p = 0) to the seat anchor of the bench's drawing (p = 1), plus the hop's arc, which reduced
   * motion drops. It sorts just in front of the bench.
   */
  private seatPlacement(placement: Extract<Placement, { kind: 'seat' }>, scale: number): { feet: { x: number; y: number }; depth: number; drawnZ: number } | null {
    const bench = this.sim.state.layout.benches.find((q) => q.id === placement.bench);
    const seat = bench?.seats.find((q) => q.id === placement.seat);
    if (!bench || !seat) return null;
    const at = toScreen(bench.x, bench.y);
    const anchor = propAnchor('bench', `seat-${seat.id}`);
    const spot = standSpot(bench, seat);
    const from = toScreen(spot.x, spot.y);
    const { p, arc } = placement;
    const arcZ = this.reducedMotion ? 0 : 4 * arc * p * (1 - p);
    const up = arcZ * PIXELS_PER_METER * scale;
    return {
      // For the log: the height drawn (m), the seat's height along the way plus the arc.
      drawnZ: bench.seatHeight * p + arcZ,
      feet: { x: from.x + (at.x + anchor.x - from.x) * p, y: from.y + (at.y + anchor.y - from.y) * p - up },
      depth: depthKey(bench.y) + CHARACTER_TIE_BREAK,
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
      layout: this.layoutName,
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
        classmates: this.classmates.map((c) => ({
          name: c.who.name,
          clip: c.clip,
          greeting: c.greeting === null ? null : Math.round(c.greeting * 1e4) / 1e4,
          bubble: c.bubble.visible ? c.bubble.text : null,
          screen: onScreen(c.rig.root),
          depth: c.rig.root.depth,
        })),
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
