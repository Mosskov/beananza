import Phaser from 'phaser';
import { prefersReducedMotion } from '../accessibility';
import { PALETTE, UI_FONT as FONT, cssColor } from '../config';
import { BeanRig, createBeanShadow } from '../rig/BeanRig';
import type { ClipName } from '../rig/clips';
import { samplePose, type Pose } from '../rig/player';
import { viewForFacing } from '../rig/views';
import type { TestableScene } from './TestableScene';

const S = Math.SQRT1_2;

/** Sim facings (x east, y north) by compass name. */
const FACING: Record<string, [number, number]> = {
  S: [0, -1],
  SE: [S, -S],
  E: [1, 0],
  NE: [S, S],
  N: [0, 1],
  NW: [-S, S],
  W: [-1, 0],
  SW: [-S, -S],
};

interface Cell {
  label: string;
  facing: keyof typeof FACING;
  clip: ClipName;
  /** Seconds into the clip. */
  t: number;
  /** Animation time for overlays (blinking); 0 keeps the eyes open. */
  time?: number;
  /** Parts shown or hidden, as the hub's presentation table does (dozing). */
  parts?: Record<string, boolean>;
}

/** Dozing: the closed eyes and the "z" replace the open eyes (as in the hub's table). */
const DOZING = { eyes: false, 'eyes-sleep': true, 'doze-z': true };

const cells = (row: Omit<Cell, 'label'>[], label: (c: Omit<Cell, 'label'>) => string): Cell[] =>
  row.map((c) => ({ ...c, label: label(c) }));

/**
 * Five rows of eight, each pose at a fixed clip time, so a screenshot shows the whole rig.
 * Row 1: the 8 directions (idle). Row 2: walk, side then front, a quarter cycle apart.
 * Row 3: run, side then front ¾. Row 4: jump, fall, land, breathing and a blink.
 * Row 5: sitting on the bench (feet swinging, a quarter cycle apart) and dozing.
 */
const ROWS: Cell[][] = [
  cells(
    (['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'] as const).map((facing) => ({ facing, clip: 'idle' as const, t: 0 })),
    (c) => {
      const v = viewForFacing(...FACING[c.facing]!);
      return `${c.facing} ${v.view}${v.mirrored ? ' mirrored' : ''}`;
    },
  ),
  cells(
    [
      ...[0, 0.14, 0.28, 0.42].map((t) => ({ facing: 'E' as const, clip: 'walk' as const, t })),
      ...[0, 0.14, 0.28, 0.42].map((t) => ({ facing: 'S' as const, clip: 'walk' as const, t })),
    ],
    (c) => `walk ${c.facing} t=${c.t.toFixed(2)}`,
  ),
  cells(
    [
      ...[0, 0.085, 0.17, 0.255].map((t) => ({ facing: 'E' as const, clip: 'run' as const, t })),
      ...[0, 0.085, 0.17, 0.255].map((t) => ({ facing: 'SE' as const, clip: 'run' as const, t })),
    ],
    (c) => `run ${c.facing} t=${c.t.toFixed(3)}`,
  ),
  [
    { label: 'jump: crouch', facing: 'S', clip: 'jump', t: 0 },
    { label: 'jump: launch', facing: 'S', clip: 'jump', t: 0.14 },
    { label: 'jump: air', facing: 'E', clip: 'jump', t: 0.4 },
    { label: 'fall', facing: 'E', clip: 'fall', t: 0.25 },
    { label: 'land t=0', facing: 'S', clip: 'land', t: 0 },
    { label: 'land t=0.07', facing: 'S', clip: 'land', t: 0.07 },
    { label: 'idle breathe t=1.5', facing: 'S', clip: 'idle', t: 1.5 },
    { label: 'blink t=3.76', facing: 'SW', clip: 'idle', t: 0, time: 3.76 },
  ],
  [
    ...[0, 0.325, 0.65, 0.975].map((t) => ({ label: `sit t=${t.toFixed(3)}`, facing: 'S' as const, clip: 'sit' as const, t })),
    ...[0, 0.5, 1, 1.5].map((t) => ({ label: `doze t=${t.toFixed(1)}`, facing: 'S' as const, clip: 'doze' as const, t, parts: DOZING })),
  ],
];

const COL_X = (i: number) => 80 + i * 160;
const ROW_FEET_Y = (r: number) => 118 + r * 138;
const SCALE = 0.72;

/**
 * Review scene for the bean rig (no sim): every direction and each clip at fixed times. The
 * labels are for reviewers; this is a tool scene, not a game scene. Poses follow
 * prefers-reduced-motion like the game does.
 */
export class BeanGalleryScene extends Phaser.Scene implements TestableScene {
  private reducedMotion = false;
  private shown: { cell: Cell; view: string; mirrored: boolean; pose: Pose }[] = [];

  constructor() {
    super({ key: 'bean' });
  }

  create(): void {
    this.reducedMotion = prefersReducedMotion();
    ROWS.forEach((row, r) =>
      row.forEach((cell, i) => {
        const x = COL_X(i);
        const y = ROW_FEET_Y(r);
        createBeanShadow(this).setPosition(x, y).setScale(SCALE);
        const rig = new BeanRig(this);
        const choice = viewForFacing(...FACING[cell.facing]!);
        rig.setView(choice);
        for (const [part, visible] of Object.entries(cell.parts ?? {})) rig.setPartVisible(part, visible);
        const pose = samplePose({ clip: cell.clip, t: cell.t, time: cell.time ?? 0, view: choice.view, reducedMotion: this.reducedMotion });
        rig.applyPose(pose);
        rig.root.setPosition(x, y).setScale(SCALE);
        this.add
          .text(x, y + 14, cell.label, { fontFamily: FONT, fontSize: '13px', color: cssColor(PALETTE.inkSecondary) })
          .setOrigin(0.5, 0);
        this.shown.push({ cell, view: choice.view, mirrored: choice.mirrored, pose });
      }),
    );
    if (this.reducedMotion) {
      this.add
        .text(1270, 8, 'prefers-reduced-motion', { fontFamily: FONT, fontSize: '13px', color: cssColor(PALETTE.labelAccent) })
        .setOrigin(1, 0);
    }
  }

  simTime(): number | null {
    return null;
  }

  pauseSim(): void {}

  resumeSim(): void {}

  stepTo(): number {
    throw new Error('Scene "bean" has no sim to step.');
  }

  stepBy(): number {
    throw new Error('Scene "bean" has no sim to step.');
  }

  debugState(): unknown {
    const r = (n: number) => Math.round(n * 1000) / 1000;
    return {
      reducedMotion: this.reducedMotion,
      cells: this.shown.map(({ cell, view, mirrored, pose }) => ({
        label: cell.label,
        facing: cell.facing,
        view,
        mirrored,
        clip: cell.clip,
        t: cell.t,
        time: cell.time ?? 0,
        body: Object.fromEntries(Object.entries(pose.body).map(([k, v]) => [k, r(v)])),
      })),
    };
  }
}
