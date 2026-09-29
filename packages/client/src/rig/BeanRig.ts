import Phaser from 'phaser';
import { ART_RESOLUTION, partImage } from '../art/raster';
import { SHADOW_TEXTURE, addBeanTextures, beanArt } from './bean-art';
import { viewKey, type RigView } from './bean-contract';
import type { Pose } from './player';
import type { Point } from './svg-parts';
import { SLOTS, SLOT_PARTS, isGroundPart, type Slot, type ViewChoice } from './views';

interface PartImage {
  image: Phaser.GameObjects.Image;
  pivot: Point;
  /** Drawn as seen on screen inside a mirrored view: counter-flipped. */
  screenSpace: boolean;
}

interface BuiltView {
  container: Phaser.GameObjects.Container;
  /** Every run of consecutive body parts shares the body transform (feet stay on the ground). */
  bodySegments: Phaser.GameObjects.Container[];
  parts: Map<string, PartImage>;
}

const DEG = Math.PI / 180;

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
 * its position, depth and scale. The rig mirrors itself for the mirrored views (D12).
 */
export class BeanRig {
  readonly root: Phaser.GameObjects.Container;
  private readonly flip: Phaser.GameObjects.Container;
  private readonly built = new Map<string, BuiltView>();
  private current: BuiltView | null = null;
  private choice: ViewChoice = { view: 'front', mirrored: false };

  constructor(private readonly scene: Phaser.Scene) {
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
    for (const part of spec.parts) {
      const tex = beanArt().textures.get(`bean:${part.source}:${part.id}`);
      if (!tex) throw new Error(`No texture for ${part.source}:${part.id}.`);
      const onBody = !isGroundPart(part.id);
      if (!segment || segmentIsBody !== onBody) {
        segment = this.scene.add.container(0, 0);
        container.add(segment);
        segmentIsBody = onBody;
        if (onBody) bodySegments.push(segment);
      }
      const image = partImage(this.scene, tex, part.pivot)
        .setPosition(part.screenSpace ? -part.pivot.x : part.pivot.x, part.pivot.y)
        .setVisible(!part.hiddenByDefault);
      if (part.screenSpace) image.setScale(-1 / ART_RESOLUTION, 1 / ART_RESOLUTION);
      segment.add(image);
      parts.set(part.id, { image, pivot: part.pivot, screenSpace: part.screenSpace });
    }
    return { container, bodySegments, parts };
  }

  /**
   * How far the body reaches west and east of the feet on screen, in art units at scale 1, for
   * the current view (from the body part's drawn bounds, so it follows the art).
   */
  bodySpan(): { west: number; east: number } {
    const { view, mirrored } = this.choice;
    const tex = beanArt().textures.get(`bean:${view}:body`);
    if (!tex) return { west: 0, east: 0 };
    const x0 = tex.bounds.x;
    const x1 = tex.bounds.x + tex.bounds.w;
    return mirrored ? { west: -x1, east: -x0 } : { west: -x0, east: x1 };
  }

  /** Show or hide a part in every view, e.g. goggles or the pushing arm. */
  setPartVisible(partId: string, visible: boolean): void {
    for (const v of this.built.values()) v.parts.get(partId)?.image.setVisible(visible);
  }

  applyPose(pose: Pose): void {
    const view = this.current;
    if (!view) return;
    const b = pose.body;
    for (const seg of view.bodySegments) seg.setPosition(b.x, b.y).setRotation(b.rotation * DEG).setScale(b.scaleX, b.scaleY);
    for (const slot of SLOTS) {
      if (slot === 'body') continue;
      const part = view.parts.get(SLOT_PARTS[this.choice.view][slot as Exclude<Slot, 'body'>]);
      if (!part) continue;
      const s = pose[slot];
      const k = 1 / ART_RESOLUTION;
      // A screen-space part inside the flipped view is placed at its mirrored pivot and flipped
      // back, so it shows as drawn while its motion mirrors like every other part.
      const baseX = part.screenSpace ? -part.pivot.x : part.pivot.x;
      part.image
        .setPosition(baseX + s.x, part.pivot.y + s.y)
        .setRotation(s.rotation * DEG)
        .setScale((part.screenSpace ? -k : k) * s.scaleX, k * s.scaleY);
    }
  }

  destroy(): void {
    this.root.destroy();
  }
}
