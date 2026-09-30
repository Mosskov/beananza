import Phaser from 'phaser';
import { effectImage, effectParts } from '../art/effects';
import { ART_RESOLUTION, partImage } from '../art/raster';
import { DEFAULT_LOOK, type BeanLook } from '@beananza/shared';
import { SHADOW_TEXTURE, addBeanTextures, beanArt, textureKey } from './bean-art';
import { viewKey, type RigView } from './bean-contract';
import { lookParts } from './looks';
import type { ParticleOffset } from './particles';
import type { Pose, SlotTransform } from './player';
import type { Point } from './svg-parts';
import {
  EFFECT_SLOTS,
  EFFECT_SLOT_ANCHORS,
  SLOTS,
  SLOT_PARTS,
  isGroundPart,
  screenReach,
  type EffectSlot,
  type Slot,
  type ViewChoice,
} from './views';

interface PartImage {
  image: Phaser.GameObjects.Image;
  /** Where the image sits at rest, in the view's frame (clips add their slot's x and y to it). */
  base: Point;
  /**
   * -1 for a drawing that is counter-flipped inside a mirrored view so that it shows as drawn
   * (a screen-space part, or an effect); otherwise 1.
   */
  sign: 1 | -1;
  /** Top of the drawing (art units, the view's frame). */
  top: number;
}

interface BuiltView {
  container: Phaser.GameObjects.Container;
  /** Every run of consecutive body parts shares the body transform (feet stay on the ground). */
  bodySegments: Phaser.GameObjects.Container[];
  parts: Map<string, PartImage>;
  /** The effect parts on each effect slot (hidden until shown by part id). */
  effects: Map<EffectSlot, { id: string; part: PartImage }[]>;
  effectIds: Set<string>;
}

const DEG = Math.PI / 180;
const NO_OFFSET: ParticleOffset = { x: 0, y: 0, scale: 1 };
const NEUTRAL_SLOT: SlotTransform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

/**
 * The ground shadow under a bean, origin at the ground point between the feet, in art units
 * like the rig (scale it like the rig). The scene puts it on the ground layer.
 */
export function createBeanShadow(scene: Phaser.Scene): Phaser.GameObjects.Container {
  addBeanTextures(scene.textures);
  const tex = beanArt().textures.get(SHADOW_TEXTURE);
  if (!tex) throw new Error('No bean shadow texture.');
  return scene.add.container(0, 0, [partImage(scene, tex, { x: 0, y: 0 })]);
}

/**
 * A bean built from its drawn parts (D3), animated by poses from the rig player. The root is
 * at the ground point between the feet in art units (1 unit = 1 px at scale 1): the scene sets
 * its position, depth and scale. The rig mirrors itself for the mirrored views (D12). Its look
 * (colour, pattern, headwear, face; D25) picks the textures and adds the cosmetic parts; the
 * look's colour must have been loaded (`loadBeanArt`).
 */
export class BeanRig {
  readonly root: Phaser.GameObjects.Container;
  private readonly flip: Phaser.GameObjects.Container;
  private readonly built = new Map<string, BuiltView>();
  /** Parts shown or hidden with `setPartVisible`, applied to views built later too. */
  private readonly visibility = new Map<string, boolean>();
  private current: BuiltView | null = null;
  private choice: ViewChoice = { view: 'front', mirrored: false };

  constructor(
    private readonly scene: Phaser.Scene,
    readonly look: BeanLook = DEFAULT_LOOK,
  ) {
    addBeanTextures(scene.textures);
    this.flip = scene.add.container(0, 0);
    this.root = scene.add.container(0, 0, [this.flip]);
    this.setView(this.choice);
  }

  get view(): ViewChoice {
    return this.choice;
  }

  setView(choice: ViewChoice): void {
    const key = viewKey(choice.view, choice.mirrored);
    let next = this.built.get(key);
    if (!next) {
      const spec = beanArt().spec.views.find((v) => v.view === choice.view && v.mirrored === choice.mirrored);
      if (!spec) throw new Error(`No bean view ${key}.`);
      next = this.build(spec);
      this.built.set(key, next);
    }
    if (this.current && this.current !== next) this.current.container.setVisible(false);
    next.container.setVisible(true);
    this.current = next;
    this.choice = choice;
    this.flip.setScale(choice.mirrored ? -1 : 1, 1);
  }

  private build(spec: RigView): BuiltView {
    const container = this.scene.add.container(0, 0);
    this.flip.add(container);
    const parts = new Map<string, PartImage>();
    const bodySegments: Phaser.GameObjects.Container[] = [];
    let segment: Phaser.GameObjects.Container | null = null;
    let segmentIsBody = false;
    const art = beanArt();
    for (const part of lookParts(spec.parts, art.cosmetics, this.look, spec.view, spec.mirrored)) {
      const key = textureKey(part.keyed ? this.look.colour : null, part.source, part.id);
      const tex = art.textures.get(key);
      if (!tex) throw new Error(`No texture ${key} (is the colour "${this.look.colour}" loaded?).`);
      const onBody = !isGroundPart(part.id);
      if (!segment || segmentIsBody !== onBody) {
        segment = this.scene.add.container(0, 0);
        container.add(segment);
        segmentIsBody = onBody;
        if (onBody) bodySegments.push(segment);
      }
      // A screen-space part inside the flipped view is placed at its mirrored pivot and flipped back.
      const base = { x: part.screenSpace ? -part.pivot.x : part.pivot.x, y: part.pivot.y };
      const sign = part.screenSpace ? -1 : 1;
      const image = partImage(this.scene, tex, part.pivot)
        .setPosition(base.x, base.y)
        .setVisible(this.visibility.get(part.id) ?? !part.hiddenByDefault);
      if (part.screenSpace) image.setScale(-1 / ART_RESOLUTION, 1 / ART_RESOLUTION);
      segment.add(image);
      parts.set(part.id, { image, base, sign, top: tex.bounds.y });
    }

    // Effects go in front of everything, at their slot's anchor in this view (mirrored views mirror
    // the anchor with the rest of the view, and the drawing is flipped back). The head and brow
    // slots ride with the body; the ground slot stays on the ground like the feet.
    const anchors = art.spec.anchors[spec.view];
    const head = this.scene.add.container(0, 0);
    const ground = this.scene.add.container(0, 0);
    container.add([head, ground]);
    bodySegments.push(head);
    const effects = new Map<EffectSlot, { id: string; part: PartImage }[]>();
    for (const ep of effectParts()) {
      const anchor = anchors[EFFECT_SLOT_ANCHORS[ep.slot]] as Point;
      const base = { x: anchor.x + ep.pivot.x, y: anchor.y + ep.pivot.y };
      const sign = spec.mirrored ? -1 : 1;
      const image = effectImage(this.scene, ep).setPosition(base.x, base.y).setScale(sign / ART_RESOLUTION, 1 / ART_RESOLUTION).setVisible(this.visibility.get(ep.partId) ?? false);
      (ep.slot === 'fxGround' ? ground : head).add(image);
      const placed = { image, base, sign, top: anchor.y + ep.texture.bounds.y } satisfies PartImage;
      parts.set(ep.partId, placed);
      effects.set(ep.slot, [...(effects.get(ep.slot) ?? []), { id: ep.partId, part: placed }]);
    }
    return { container, bodySegments, parts, effects, effectIds: new Set([...effects.values()].flat().map((e) => e.id)) };
  }

  /**
   * How far the body reaches west and east of the feet on screen, in art units at scale 1, for
   * the current view (from the body part's drawn bounds, so it follows the art).
   */
  bodySpan(): { west: number; east: number } {
    const { view, mirrored } = this.choice;
    const tex = beanArt().textures.get(textureKey(this.look.colour, view, 'body'));
    if (!tex) return { west: 0, east: 0 };
    return screenReach(tex.bounds.x, tex.bounds.x + tex.bounds.w, mirrored);
  }

  /**
   * The top of the body part alone in the current view (art units above the feet, as a negative
   * y): the same for every look, unlike `drawnTop`, which headwear raises. What a tap on the bean
   * uses, because a cosmetic must never change what a tap does (the sim).
   */
  bodyTop(): number {
    const tex = beanArt().textures.get(textureKey(this.look.colour, this.choice.view, 'body'));
    return tex ? Math.min(0, tex.bounds.y) : 0;
  }

  /**
   * The highest point of the visible drawing in the current view (art units above the feet, as
   * a negative y), headwear included: what a label above the bean must clear. Ignores the pose.
   */
  drawnTop(): number {
    let top = 0;
    for (const p of this.current?.parts.values() ?? []) if (p.image.visible) top = Math.min(top, p.top);
    return top;
  }

  /** Show or hide a part in every view, e.g. goggles or the pushing arm, including views built later. */
  setPartVisible(partId: string, visible: boolean): void {
    this.visibility.set(partId, visible);
    for (const v of this.built.values()) v.parts.get(partId)?.image.setVisible(visible);
  }

  /** Pose the current view; `particles` (`particleOffsets`) moves single effect parts on from their slot. */
  applyPose(pose: Pose, particles: Readonly<Record<string, ParticleOffset>> = {}): void {
    const view = this.current;
    if (!view) return;
    const b = pose.body;
    for (const seg of view.bodySegments) seg.setPosition(b.x, b.y).setRotation(b.rotation * DEG).setScale(b.scaleX, b.scaleY);
    // A flipped-back part shows as drawn while its motion mirrors like every other part.
    const place = (part: PartImage, s: SlotTransform, p: ParticleOffset = NO_OFFSET) => {
      const k = p.scale / ART_RESOLUTION;
      part.image
        .setPosition(part.base.x + s.x + p.x, part.base.y + s.y + p.y)
        .setRotation((s.rotation + (p.rotation ?? 0)) * DEG)
        .setScale(part.sign * k * s.scaleX, k * s.scaleY);
    };
    for (const slot of SLOTS) {
      if (slot === 'body') continue;
      if ((EFFECT_SLOTS as readonly Slot[]).includes(slot)) {
        for (const { id, part } of view.effects.get(slot as EffectSlot) ?? []) place(part, pose[slot], particles[id]);
        continue;
      }
      const part = view.parts.get(SLOT_PARTS[this.choice.view][slot as Exclude<Slot, 'body' | EffectSlot>]);
      if (part) place(part, pose[slot]);
    }
    // Parts with no slot that still move on their own (the spiral eyes): the offset alone.
    for (const [id, p] of Object.entries(particles)) {
      const part = view.parts.get(id);
      if (part && !view.effectIds.has(id)) place(part, NEUTRAL_SLOT, p);
    }
  }

  destroy(): void {
    this.root.destroy();
  }
}
