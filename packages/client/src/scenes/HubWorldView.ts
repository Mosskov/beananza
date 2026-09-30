import Phaser from 'phaser';
import { PIXELS_PER_METER, type BeanLook } from '@beananza/shared';
import {
  CART_HALF_DEPTH,
  CART_HALF_LENGTH,
  HUB_BEAN_RADIUS_M,
  polygonBounds,
  portalExit,
  seatSpot,
  standSpot,
  type HubBean,
  type HubBeanCommand,
  type HubState,
  type Rect,
} from '@beananza/sim';
import { prefersReducedMotion } from '../accessibility';
import { PROP_PARTS, propAnchor, propPart } from '../art/props';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, UI_FONT, cssColor } from '../config';
import { BeanRig, createBeanShadow } from '../rig/BeanRig';
import { beanArt } from '../rig/bean-art';
import { chooseClip, samplePose } from '../rig/player';
import { viewForFacing } from '../rig/views';
import { CART_RIDER_DEPTH, CartView, drawRiderMask, drawRail, speedReadout } from './hub-carts';
import { CLASSMATES, greetingAt, type Classmate } from './classmates';
import { PART_DEFAULTS, presentAct, type Placement, type Presentation, type ToggledPart } from './hub-presentation';
import { cameraCentre, cartStandOff, characterScreen, depthKey, depthScale, groundFromScreen, toScreen, type CameraMargin } from './hub-view';
import { SKY_LAYOUTS, SKY_MARGIN, SkyIsland } from './sky-island';
import { PortalView } from './hub-portals';

/**
 * Everything the hub draws (D1, D2): the ground or the sky island, props, portals, the rail and
 * carts, seated classmates, every bean, the controls hint and the camera. Both hub scenes use it:
 * `HubScene` offline (the local sim, which tools/shot pauses and steps) and `HubOnlineScene` (the
 * server's snapshots). It only reads a hub state; it never changes one.
 */

const m = (meters: number) => meters * PIXELS_PER_METER;

/** Ground point the camera centres on (m) for a layout that fits the view: the plaza's middle, a bit north. */
const VIEW_CENTER = { x: 0, y: -0.5 };
/** Plaza ground has no margin: it fits the view, so the camera stays on VIEW_CENTER. */
const NO_MARGIN: CameraMargin = { north: 0, south: 0, east: 0, west: 0 };
/** The view in metres (the camera is not zoomed). */
const VIEW_M = { width: GAME_WIDTH / PIXELS_PER_METER, height: GAME_HEIGHT / PIXELS_PER_METER };
/** Ground, backdrop and shadows sit below everything that is depth-sorted. */
export const GROUND_DEPTH = -1e6;
/**
 * Characters draw in front of props on the same ground row. Explicit, so the draw order never
 * depends on which object was created first (depth keys are whole pixels apart otherwise).
 */
const CHARACTER_TIE_BREAK = 0.5;
/** Seated classmates sort just behind a character on their row (Priya and the bean on the bench row). */
const CLASSMATE_TIE_BREAK = 0.4;
export const UI_DEPTH = 1e6;
/** A vanishing bean shrinks to this share of its size (and fades out); reduced motion only fades. */
const VANISH_MIN_SCALE = 0.15;

/** Gap between a bean's head and the readout of the cart it is using (art units). */
const READOUT_GAP_UNITS = 12;

/** Controls hint, bottom right (allowed by the no-text rule). PLACEHOLDER style. */
export const HINT_STYLE = {
  fontFamily: UI_FONT,
  fontSize: '18px',
  color: cssColor(PALETTE.inkSecondary),
  // A light panel keeps it readable over grass, rock and sky alike.
  backgroundColor: 'rgba(255, 248, 236, 0.88)',
  padding: { x: 10, y: 5 },
};
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

/** What a bean's rig showed last frame, for the shot logs. */
export interface RigShown {
  /** The sim's interaction state and how the presentation table drew it. */
  act: string;
  placement: string;
  /** The rider mask was on (in a cart). */
  masked: boolean;
  /** Height drawn (m): the sim's z, or the flat hop under reduced motion. */
  drawnZ: number;
  /** How far into a portal's swirl it has vanished (0..1). */
  vanish: number;
  /** The feet's pose offsets (art units): dangling and swinging on the bench. */
  feet: { a: { x: number; y: number }; b: { x: number; y: number } };
  view: string;
  mirrored: boolean;
  clip: string;
  clipT: number;
  /** Body transform of the pose (art units, degrees): bob y, lean or waddle, squash. */
  body: { y: number; rotation: number; scaleX: number; scaleY: number };
}

/** One bean's drawing: its rig, ground shadow and rider mask. */
interface BeanDrawer {
  rig: BeanRig;
  shadow: Phaser.GameObjects.Container;
  /** The rider's mask shape (world coordinates), used while the bean is in a cart. */
  mask: Phaser.GameObjects.Graphics;
  shown: RigShown | null;
}

/** One frame to draw: a hub state plus where to draw each bean and cart (interpolated). */
export interface HubFrame {
  state: HubState;
  /** Animation time (sim seconds, interpolated). */
  time: number;
  /** Where to draw a bean (m): between its last two sim positions. */
  beanAt: (bean: HubBean) => { x: number; y: number; z: number };
  /** Where to draw a cart along the rail (m). */
  cartAt: (cart: { id: string; x: number }) => number;
  /** The bean the camera follows (the player's own). */
  focus: string;
}

export class HubWorldView {
  readonly reducedMotion = prefersReducedMotion();
  /** The walkable area's bounding box (m), for the depth scale and the camera. */
  readonly bounds: Rect;
  private readonly props = new Map<string, Phaser.GameObjects.Container>();
  /** Props a tap uses (sends `use`) instead of walking there. */
  private readonly usable = new Set<string>();
  private readonly carts = new Map<string, CartView>();
  private readonly portals = new Map<string, PortalView>();
  /** Seated classmates (Priya), drawn on the seats the sim keeps for them. */
  private readonly classmates: { who: Classmate; rig: BeanRig; bubble: Phaser.GameObjects.Text; greeting: number | null; clip: string }[] = [];
  private readonly beans = new Map<string, BeanDrawer>();
  /** The sky and clouds, for layouts drawn as the floating island (D2); null on plaza ground. */
  private readonly sky: SkyIsland | null = null;

  /** `state` gives the layout (and Priya's seat); `lookOf` each bean's look. */
  constructor(
    private readonly scene: Phaser.Scene,
    layoutName: string,
    state: HubState,
    private readonly lookOf: (id: string) => BeanLook,
    hint: string,
  ) {
    const { layout } = state;
    this.bounds = polygonBounds(layout.walkable);
    if (SKY_LAYOUTS.has(layoutName)) this.sky = new SkyIsland(scene, layout.walkable, GROUND_DEPTH, layout.portals.map(portalExit));
    else this.drawGround();
    for (const spec of layout.portals) {
      const view = new PortalView(scene, spec);
      this.portals.set(spec.id, view);
      // Taps land on the ring and swirl; the debug log lists it with the props.
      this.props.set(spec.id, view.back);
      if (spec.usable) this.usable.add(spec.id);
    }
    // Props that never turn: every part of their drawing, origin at the middle of the footprint.
    for (const prop of [...layout.props, ...layout.benches]) {
      const parts = PROP_PARTS[prop.art];
      if (!parts) throw new Error(`Prop ${prop.id}: no drawing "${prop.art}" in art/props/.`);
      const root = scene.add.container(0, 0, parts.map((part) => propPart(scene, prop.art, part)));
      const at = toScreen(prop.x, prop.y);
      root.setPosition(at.x, at.y).setDepth(depthKey(prop.y));
      this.props.set(prop.id, root);
      if (prop.usable) this.usable.add(prop.id);
    }
    if (layout.rail) {
      drawRail(scene, layout.rail, GROUND_DEPTH + 0.5);
      for (const c of layout.rail.carts) {
        this.carts.set(c.id, new CartView(scene, c.id, !c.ridable, GROUND_DEPTH + 1, UI_DEPTH - 1));
      }
    }
    this.createClassmates(state);
    // Controls hint only (allowed by the no-text rule). PLACEHOLDER UI font and style.
    scene.add
      .text(GAME_WIDTH - 20, GAME_HEIGHT - 16, hint, HINT_STYLE)
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);
  }

  /** The rig drawn for a bean last frame, for the logs. */
  shownFor(id: string): RigShown | null {
    return this.beans.get(id)?.shown ?? null;
  }

  /** The drawn rig of a bean (its root), or undefined. */
  rigOf(id: string): BeanRig | undefined {
    return this.beans.get(id)?.rig;
  }

  /** What a tap at a world point means: use a usable prop under it, or walk there. */
  tapCommand(worldX: number, worldY: number): HubBeanCommand {
    for (const id of this.usable) {
      if (this.props.get(id)?.getBounds().contains(worldX, worldY)) return { type: 'use', id };
    }
    const ground = groundFromScreen(worldX, worldY);
    return { type: 'moveTo', x: ground.x, y: ground.y };
  }

  private drawGround(): void {
    const w = this.bounds;
    const g = this.scene.add.graphics().setDepth(GROUND_DEPTH);
    const b = BACKDROP;
    g.fillStyle(PALETTE.grass, 1).fillRect(m(b.minX), m(b.minY), m(b.width), m(b.height));
    const nw = toScreen(w.minX, w.maxY);
    const se = toScreen(w.maxX, w.minY);
    g.fillStyle(PALETTE.hedge, 1).fillRect(m(b.minX), nw.y - m(HEDGE.gapM + HEDGE.depthM), m(b.width), m(HEDGE.depthM));
    g.fillStyle(PALETTE.stone, 1).fillRoundedRect(nw.x, nw.y, se.x - nw.x, se.y - nw.y, PLAZA_CORNER_PX);
    g.lineStyle(PLAZA_EDGE_PX, PALETTE.cardShadow, 1).strokeRoundedRect(nw.x, nw.y, se.x - nw.x, se.y - nw.y, PLAZA_CORNER_PX);
  }

  /** Make or drop bean drawings so there is one per bean in the state. */
  private syncBeans(state: HubState): void {
    const ids = new Set(state.beans.map((b) => b.id));
    for (const [id, d] of this.beans) {
      if (ids.has(id)) continue;
      d.rig.root.destroy();
      d.shadow.destroy();
      d.mask.destroy();
      this.beans.delete(id);
    }
    for (const bean of state.beans) {
      if (this.beans.has(bean.id)) continue;
      const rig = new BeanRig(this.scene, this.lookOf(bean.id));
      // The rider mask (D23): a WebGL mask filter on the rig, rendered only while in a cart.
      const mask = this.scene.make.graphics({}, false);
      rig.root.enableFilters();
      rig.root.filters?.internal.addMask(mask, false, undefined, 'world');
      rig.root.renderFilters = false;
      this.beans.set(bean.id, { rig, shadow: createBeanShadow(this.scene).setDepth(GROUND_DEPTH + 1), mask, shown: null });
    }
  }

  draw(frame: HubFrame): void {
    const { state, time } = frame;
    this.syncBeans(state);
    // The camera follows the player's drawn bean on a big layout and stays put on one that fits (D2).
    const focus = state.beans.find((b) => b.id === frame.focus);
    const at = focus ? frame.beanAt(focus) : VIEW_CENTER;
    const centre = cameraCentre(at, this.bounds, VIEW_M, this.sky ? SKY_MARGIN : NO_MARGIN, VIEW_CENTER);
    const centreScreen = toScreen(centre.x, centre.y);
    this.scene.cameras.main.centerOn(centreScreen.x, centreScreen.y);
    this.sky?.update(time, this.reducedMotion);
    for (const p of this.portals.values()) p.draw(time, this.reducedMotion);
    this.drawClassmates(state, time);

    // Every bean's row first: a cart shows it is in use (its readout moves up) if any bean uses it.
    const looks = state.beans.map((bean) => ({ bean, look: presentAct(bean.act, state, time, bean) }));
    const inUse = new Set(looks.map((l) => l.look.usingCart).filter((c): c is string => c !== null));
    const rail = state.layout.rail;
    for (const c of state.rail?.carts ?? []) this.carts.get(c.id)?.draw(frame.cartAt(c), rail?.y ?? 0, c.v, inUse.has(c.id));
    for (const { bean, look } of looks) this.drawBean(frame, bean, look);
  }

  private drawBean(frame: HubFrame, b: HubBean, look: Presentation): void {
    const drawer = this.beans.get(b.id);
    if (!drawer) return;
    const { state, time } = frame;
    const { x, y, z } = frame.beanAt(b);
    const scale = depthScale(y, this.bounds);
    const rail = state.layout.rail;
    const act = b.act;
    const inCart = look.placement.kind === 'cart' ? look.placement.cart : null;

    // The sim's z and the draw order are unchanged; only the drawn height is scaled (D18).
    // Under reduced motion a hop moves in a straight line (no arc).
    let drawnZ = this.reducedMotion && look.flatZ !== null ? look.flatZ : z;
    let feet = characterScreen(x, y, drawnZ, scale);
    const { rig, shadow } = drawer;
    // In a cart the bean draws between the back and the front of the cart, and below the rim
    // only inside the cart's front (it is wider than the cart).
    const cartView = inCart !== null && rail !== null ? this.carts.get(inCart) : undefined;
    let depth = cartView && rail ? depthKey(rail.y) + CART_RIDER_DEPTH : depthKey(y) + CHARACTER_TIE_BREAK;
    if (look.placement.kind === 'seat') {
      const seated = this.seatPlacement(state, look.placement, scale);
      if (seated) ({ feet, depth, drawnZ } = seated);
    }
    // Into a portal's swirl: shrink and fade out (reduced motion: fade only), then gone.
    const vanish = look.vanish ?? 0;
    const shrink = this.reducedMotion ? 1 : 1 - (1 - VANISH_MIN_SCALE) * vanish;
    rig.root.setPosition(feet.x, feet.y).setScale(scale * shrink).setDepth(depth).setAlpha(1 - vanish).setVisible(vanish < 1);
    if (cartView) drawRiderMask(drawer.mask, cartView.screen);
    rig.root.renderFilters = cartView !== undefined;
    const ground = toScreen(x, y);
    // The shadow stays on the ground and shrinks as the bean rises.
    const lift = Math.max(0, 1 - drawnZ / SHADOW_FADE_M);
    shadow
      .setPosition(ground.x, ground.y)
      .setScale(scale * shrink * (SHADOW_MIN_SCALE + (1 - SHADOW_MIN_SCALE) * lift))
      .setAlpha(1 - vanish)
      .setVisible(look.shadow && vanish < 1);

    const choice = viewForFacing(b.facingX, b.facingY);
    const { clip, t } = chooseClip(b, time, state.gravity, look.clip);
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
      const cartXs = (state.rail?.carts ?? []).map((c) => frame.cartAt(c));
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
    drawer.shown = {
      act: act.kind,
      placement: look.placement.kind,
      masked: rig.root.renderFilters,
      drawnZ: r(drawnZ),
      vanish: r(vanish),
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
   * bench like a seated bean. Priya's "Hi!" is the one text in the hub besides readouts, name
   * tags and the controls hint (docs/IMPLEMENTATION.md §7). PLACEHOLDER font and bubble style.
   */
  private createClassmates(state: HubState): void {
    for (const who of CLASSMATES) {
      const bench = state.layout.benches.find((b) => b.id === who.bench);
      const seat = bench?.seats.find((q) => q.id === who.seat);
      if (!bench || !seat?.taken) continue;
      const rig = new BeanRig(this.scene, who.look);
      rig.setView({ view: 'front', mirrored: false });
      const at = toScreen(bench.x, bench.y);
      const anchor = propAnchor('bench', `seat-${seat.id}`);
      const scale = depthScale(seatSpot(bench, seat).y, this.bounds);
      // Just behind a bean on the same row (the player draws in front of a classmate on a tie).
      rig.root.setPosition(at.x + anchor.x, at.y + anchor.y).setScale(scale).setDepth(depthKey(bench.y) + CLASSMATE_TIE_BREAK);
      const bubble = this.scene.add
        .text(rig.root.x, rig.root.y + (rig.drawnTop() - READOUT_GAP_UNITS) * scale, 'Hi!', BUBBLE_STYLE)
        .setOrigin(0.5, 1)
        .setDepth(UI_DEPTH - 2)
        .setVisible(false);
      this.classmates.push({ who, rig, bubble, greeting: null, clip: 'sit' });
    }
  }

  /** Classmates sit (feet swinging), and wave and say "Hi!" while greeting a bean. */
  private drawClassmates(state: HubState, time: number): void {
    for (const c of this.classmates) {
      c.greeting = greetingAt(state, c.who, time);
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
  private seatPlacement(
    state: HubState,
    placement: Extract<Placement, { kind: 'seat' }>,
    scale: number,
  ): { feet: { x: number; y: number }; depth: number; drawnZ: number } | null {
    const bench = state.layout.benches.find((q) => q.id === placement.bench);
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

  /** The drawn world for the logs: the focus bean, carts, classmates and props on screen. */
  debugView(state: HubState, focus: string): unknown {
    const cam = this.scene.cameras.main;
    const onScreen = (o: Phaser.GameObjects.Components.Transform) => ({
      x: Math.round((o.x - cam.scrollX) * 10) / 10,
      y: Math.round((o.y - cam.scrollY) * 10) / 10,
    });
    const me = this.beans.get(focus);
    const beanDepth = me?.rig.root.depth ?? 0;
    return {
      bean: me ? { screen: onScreen(me.rig.root), scale: me.rig.root.scaleX, depth: beanDepth, rig: me.shown } : null,
      reducedMotion: this.reducedMotion,
      carts: (state.rail?.carts ?? []).map((c) => {
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
    };
  }
}
