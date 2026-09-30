import Phaser from 'phaser';
import type { BeanLook } from '@beananza/shared';
import { SIM_HZ, type ReactionKind } from '@beananza/sim';
import { prefersReducedMotion } from '../accessibility';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, UI_FONT as FONT, cssColor } from '../config';
import { BeanRig, createBeanShadow } from '../rig/BeanRig';
import { CLIP_PARTS } from '../rig/clip-parts';
import { clipParticles, particleOffsets } from '../rig/particles';
import { reactionParts } from '../rig/reaction-parts';
import { CLIP_NAMES, CLIPS, familyOf } from '../rig/clips';
import { samplePose, type Pose, type ReactionLayer } from '../rig/player';
import { pickDirections, screenAngleDeg, type ViewChoice } from '../rig/views';
import { frameMainCamera, sharpText } from '../screen-scale';
import { ANIM_SPEEDS, DEFAULT_ANIM, DIRECTION_NAMES, animQuery, animSpan, isReactionClip, parseAnimParams, reactionGroups, type AnimOptions } from './anim-params';
import { PART_DEFAULTS } from './hub-presentation';
import type { SceneStartData, TestableScene } from './TestableScene';

/** One press of `,` or `.`: a sim tick. */
const FRAME_S = 1 / SIM_HZ;
/** Rewriting the address on every scrub step would trip the browser's navigation throttle. */
const URL_WRITE_MS = 250;
/** One large bean. */
const SINGLE = { x: GAME_WIDTH / 2, feetY: 500, scale: 2 };
/** Eight beans on an ellipse, each where its facing points on screen (south at the bottom). */
const RING = { x: GAME_WIDTH / 2, y: 390, rx: 400, ry: 200, scale: 0.8 };

const HINT = 'Play/pause: Space   Direction: ← →   Frame: , .   Clip: [ ]   Speed: 1–4   Reduced motion: R   Ring: G';

/** What the dev panel drives (`whenAnimViewer`). */
export interface AnimViewerControl {
  readonly options: Readonly<AnimOptions>;
  readonly playing: boolean;
  readonly reducedMotion: boolean;
  /** Seconds into the current pass, and the pass: what it shows (`span`), when it restarts (`cycle`). */
  readonly position: number;
  readonly span: number;
  readonly cycle: number;
  set(change: Partial<AnimOptions>): void;
  setPlaying(playing: boolean): void;
  /** Go to `position` s in the current pass, paused. */
  seek(position: number): void;
  /** Step whole sim ticks, paused. */
  step(frames: number): void;
}

let viewer: AnimViewerControl | null = null;
const waiting: ((control: AnimViewerControl) => void)[] = [];

function announce(control: AnimViewerControl | null): void {
  viewer = control;
  if (control) for (const ready of waiting.splice(0)) ready(control);
}

/** Calls `ready` once the anim scene has started (at once if it has). */
export function whenAnimViewer(ready: (control: AnimViewerControl) => void): void {
  if (viewer) ready(viewer);
  else waiting.push(ready);
}

interface Bean {
  direction: string;
  choice: ViewChoice;
  rig: BeanRig;
  shadow: Phaser.GameObjects.Container;
  pose: Pose | null;
}

const r = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Animation viewer (no sim): one clip played live by the real rig and rig player, in one
 * direction or all 8 in a ring, with a reaction laid over it as the hub plays it (the groups
 * come from D26's compatibility table for the act that plays the clip). A tool scene: the
 * labels are for reviewers. The address holds its state (`ANIM_PARAMS`); the dev panel and the
 * keys in `HINT` change it live.
 *
 * One clock, `clock`, runs as the hub's animation time does: looping clips and blinking read it
 * directly, so tracks with their own period never jump; one-shot clips and reactions play from
 * the start of each pass (`cycle` long).
 */
export class AnimViewerScene extends Phaser.Scene implements TestableScene, AnimViewerControl {
  options: AnimOptions = { ...DEFAULT_ANIM };
  playing = true;
  span = 1;
  cycle = 1;
  private clock = 0;
  private look: BeanLook | undefined;
  private beans: Bean[] = [];
  private reaction: ReactionLayer | null = null;
  private readout!: Phaser.GameObjects.Text;
  private urlDirty = false;
  private urlWrittenAt = 0;

  constructor() {
    super({ key: 'anim' });
  }

  get reducedMotion(): boolean {
    return this.options.reducedMotion ?? prefersReducedMotion();
  }

  get position(): number {
    return this.clock % this.cycle;
  }

  create(data: SceneStartData): void {
    frameMainCamera(this);
    this.look = data.look;
    const start = parseAnimParams(new URLSearchParams(window.location.search));
    this.options = start.options;
    this.playing = !start.paused;
    this.clock = start.t;

    const ink = cssColor(PALETTE.inkSecondary);
    // Top right: the dev panel sits at the top left.
    sharpText(this.add.text(GAME_WIDTH - 20, 8, 'anim', { fontFamily: FONT, fontSize: '14px', color: cssColor(PALETTE.ink) }).setOrigin(1, 0));
    this.readout = sharpText(this.add.text(GAME_WIDTH - 20, 28, '', { fontFamily: FONT, fontSize: '16px', color: ink }).setOrigin(1, 0));
    sharpText(this.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 16, HINT, { fontFamily: FONT, fontSize: '14px', color: ink }).setOrigin(1, 1));

    this.rebuild();
    this.draw();

    // A DOM listener rather than Phaser's keys, so typing in the dev panel's controls is not
    // also read as a key here.
    window.addEventListener('keydown', this.onKey);
    // The canvas takes no focus, so a click on it releases the panel control that had it.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    announce(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.onKey);
      announce(null);
    });
  }

  override update(now: number, deltaMs: number): void {
    if (this.playing) {
      const passStart = Math.floor(this.clock / this.cycle) * this.cycle;
      this.clock += (deltaMs / 1000) * this.options.speed;
      if (!this.options.loop && this.clock >= passStart + this.span) {
        this.clock = passStart + this.span;
        this.playing = false;
        this.urlDirty = true;
      }
      this.draw();
    }
    if (this.urlDirty && now - this.urlWrittenAt >= URL_WRITE_MS) {
      this.urlDirty = false;
      this.urlWrittenAt = now;
      window.history.replaceState(window.history.state, '', animQuery(new URLSearchParams(window.location.search), this.options, this.playing ? null : this.clock));
    }
  }

  set(change: Partial<AnimOptions>): void {
    const before = this.options;
    this.options = { ...before, ...change };
    // A new clip or reaction starts from its beginning; a new direction keeps the time.
    const { clip, reaction, dir, ring } = this.options;
    if (clip !== before.clip || reaction !== before.reaction) this.clock = 0;
    if (clip !== before.clip || reaction !== before.reaction || dir !== before.dir || ring !== before.ring) this.rebuild();
    this.urlDirty = true;
    this.draw();
  }

  setPlaying(playing: boolean): void {
    // Played to its end (loop off): play again from the next pass.
    if (playing && !this.options.loop && this.position >= this.span - 1e-9) this.clock = (Math.floor(this.clock / this.cycle) + 1) * this.cycle;
    this.playing = playing;
    this.urlDirty = true;
    this.draw();
  }

  seek(position: number): void {
    this.playing = false;
    this.clock = Math.floor(this.clock / this.cycle) * this.cycle + Math.min(Math.max(position, 0), this.cycle - 1e-9);
    this.urlDirty = true;
    this.draw();
  }

  step(frames: number): void {
    this.playing = false;
    this.clock = Math.max(0, this.clock + frames * FRAME_S);
    this.urlDirty = true;
    this.draw();
  }

  /** The reaction laid over the clip, if one is chosen and the clip is an act's (none over a reaction). */
  private activeReaction(): ReactionKind | null {
    return this.options.reaction && !isReactionClip(this.options.clip) ? this.options.reaction : null;
  }

  /** New beans for the clip, direction or ring, in the order they overlap (back to front). */
  private rebuild(): void {
    for (const bean of this.beans) {
      bean.rig.destroy();
      bean.shadow.destroy();
    }
    const { clip, ring, dir } = this.options;
    const dirs = pickDirections(ring ? 'all' : dir);
    const placed = dirs.map((d) => {
      if (!ring) return { d, x: SINGLE.x, feetY: SINGLE.feetY, scale: SINGLE.scale };
      const a = (screenAngleDeg(...d.facing) * Math.PI) / 180;
      return { d, x: RING.x + RING.rx * Math.cos(a), feetY: RING.y + RING.ry * Math.sin(a), scale: RING.scale };
    });
    placed.sort((a, b) => a.feetY - b.feetY);
    this.beans = placed.map(({ d, x, feetY, scale }) => {
      const shadow = createBeanShadow(this).setPosition(x, feetY).setScale(scale);
      const rig = new BeanRig(this, this.look);
      rig.setView(d.choice);
      rig.root.setPosition(x, feetY).setScale(scale);
      return { direction: d.name, choice: d.choice, rig, shadow, pose: null };
    });
    const first = this.beans[0];
    const data = CLIPS[clip][familyOf(first ? first.choice.view : 'front')];
    ({ span: this.span, cycle: this.cycle } = animSpan(data.duration, data.loop, this.activeReaction()));
    this.urlDirty = true;
  }

  private draw(): void {
    const { clip } = this.options;
    const kind = this.activeReaction();
    const p = this.position;
    this.reaction = null;
    if (kind && p < this.span) this.reaction = { kind, t: p, groups: reactionGroups(clip, kind) ?? [] };
    const reducedMotion = this.reducedMotion;
    // The clip's parts (as its act shows them), then the reaction's face and effect over them.
    const parts = { ...PART_DEFAULTS, ...CLIP_PARTS[clip], ...reactionParts(this.reaction) };
    for (const bean of this.beans) {
      for (const [part, visible] of Object.entries(parts)) bean.rig.setPartVisible(part, visible);
      const data = CLIPS[clip][familyOf(bean.choice.view)];
      // As in the hub: a looping clip runs on the clock, a one-shot clip from the start of the pass.
      const t = data.loop ? this.clock : p;
      bean.pose = samplePose({ clip, t, time: this.clock, view: bean.choice.view, mirrored: bean.choice.mirrored, reducedMotion, reaction: this.reaction });
      bean.rig.applyPose(bean.pose, { ...clipParticles(clip, t, reducedMotion), ...particleOffsets(this.reaction, reducedMotion) });
    }
    this.readout.setText(this.describe(p, kind));
  }

  private describe(p: number, kind: ReactionKind | null): string {
    const { clip, reaction, ring, speed, loop } = this.options;
    const bean = this.beans[0];
    const where = ring || !bean ? 'all 8 directions' : `${bean.direction} (${bean.choice.view}${bean.choice.mirrored ? ', mirrored' : ''})`;
    const layer = kind
      ? ` + ${kind} [${(reactionGroups(clip, kind) ?? []).join(', ')}]`
      : reaction
        ? ` (${reaction}: not over a reaction clip)`
        : '';
    const state = [`${speed}×`, loop ? '' : 'once', this.playing ? '' : 'paused', this.reducedMotion ? 'reduced motion' : ''].filter(Boolean);
    return `${clip}${layer}   ${where}   t ${p.toFixed(2)} / ${this.span.toFixed(2)} s   ${state.join('   ')}`;
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.target instanceof Element && event.target.closest('input, select, textarea, button')) return;
    const { clip, dir, ring } = this.options;
    const next = <T>(list: readonly T[], item: T, by: number) => list[(list.indexOf(item) + by + list.length) % list.length] as T;
    const speed = ANIM_SPEEDS[Number(event.key) - 1];
    if (event.key === ' ') this.setPlaying(!this.playing);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') this.set({ dir: next(DIRECTION_NAMES, dir, event.key === 'ArrowRight' ? 1 : -1) });
    else if (event.key === ',' || event.key === '.') this.step(event.key === '.' ? 1 : -1);
    else if (event.key === '[' || event.key === ']') this.set({ clip: next(CLIP_NAMES, clip, event.key === ']' ? 1 : -1) });
    else if (speed !== undefined) this.set({ speed });
    else if (event.key === 'r' || event.key === 'R') this.set({ reducedMotion: !this.reducedMotion });
    else if (event.key === 'g' || event.key === 'G') this.set({ ring: !ring });
    else return;
    event.preventDefault();
  };

  simTime(): number | null {
    return null;
  }

  pauseSim(): void {}

  resumeSim(): void {}

  stepTo(): number {
    throw new Error('Scene "anim" has no sim to step.');
  }

  stepBy(): number {
    throw new Error('Scene "anim" has no sim to step.');
  }

  debugState(): unknown {
    const round = (s: Pose[keyof Pose]) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, r(v)]));
    return {
      options: this.options,
      reducedMotion: this.reducedMotion,
      playing: this.playing,
      clock: r(this.clock),
      position: r(this.position),
      span: r(this.span),
      cycle: r(this.cycle),
      reaction: this.reaction && { kind: this.reaction.kind, t: r(this.reaction.t), groups: this.reaction.groups },
      beans: this.beans.map(({ direction, choice, pose }) => ({
        direction,
        view: choice.view,
        mirrored: choice.mirrored,
        pose: pose && Object.fromEntries(Object.entries(pose).map(([slot, s]) => [slot, round(s)])),
      })),
    };
  }
}
