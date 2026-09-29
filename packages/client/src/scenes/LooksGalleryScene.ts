import Phaser from 'phaser';
import { COLOUR_IDS, DEFAULT_LOOK, HEADWEAR_IDS, PATTERN_IDS, lookToString, type BeanLook } from '@beananza/shared';
import { prefersReducedMotion } from '../accessibility';
import { PALETTE, UI_FONT as FONT, cssColor } from '../config';
import { BeanRig, createBeanShadow } from '../rig/BeanRig';
import { beanArt } from '../rig/bean-art';
import { lookParts } from '../rig/looks';
import { samplePose } from '../rig/player';
import { viewForFacing } from '../rig/views';
import type { TestableScene } from './TestableScene';

const S = Math.SQRT1_2;
const DIRECTIONS: [string, number, number][] = [
  ['S', 0, -1],
  ['SE', S, -S],
  ['E', 1, 0],
  ['NE', S, S],
  ['N', 0, 1],
  ['NW', -S, S],
  ['W', -1, 0],
  ['SW', -S, -S],
];

interface Cell {
  label: string;
  look: BeanLook;
  facing: [number, number];
}

const look = (overrides: Partial<BeanLook>): BeanLook => ({ ...DEFAULT_LOOK, ...overrides });
const directionRow = (name: string, l: BeanLook): Cell[] => DIRECTIONS.map(([d, x, y]) => ({ label: `${name} ${d}`, look: l, facing: [x, y] }));

/**
 * Customization review (D25), a tool scene with labels (no sim): each piece on all 8 directions,
 * then all 10 colours, each with a different mix of pattern, headwear and face. The bow is the
 * piece that is not symmetric: it must stay on the bean's left in every direction.
 */
const ROWS: Cell[][] = [
  directionRow('spots', look({ pattern: 'spots' })),
  directionRow('sprout', look({ colour: 'green', headwear: 'sprout' })),
  directionRow('bear ears', look({ colour: 'teal', headwear: 'bear-ears' })),
  directionRow('bow', look({ colour: 'yellow', headwear: 'bow' })),
  directionRow('glasses', look({ colour: 'slate', face: 'glasses' })),
  COLOUR_IDS.map((colour, i) => ({
    label: colour,
    look: {
      colour,
      pattern: PATTERN_IDS[i % PATTERN_IDS.length] ?? 'plain',
      headwear: HEADWEAR_IDS[i % HEADWEAR_IDS.length] ?? 'none',
      face: i % 3 === 2 ? 'glasses' : 'round',
    },
    facing: i % 2 === 0 ? [0, -1] : [S, -S],
  })),
];

const ROW_FEET_Y = (r: number) => 104 + r * 116;
const SCALE = 0.58;

export class LooksGalleryScene extends Phaser.Scene implements TestableScene {
  private reducedMotion = false;
  private shown: { cell: Cell; view: string; mirrored: boolean; parts: string[] }[] = [];

  constructor() {
    super({ key: 'looks' });
  }

  create(): void {
    this.reducedMotion = prefersReducedMotion();
    ROWS.forEach((row, r) => {
      const pitch = 1280 / row.length;
      row.forEach((cell, i) => {
        const x = pitch * (i + 0.5);
        const y = ROW_FEET_Y(r);
        createBeanShadow(this).setPosition(x, y).setScale(SCALE);
        const rig = new BeanRig(this, cell.look);
        const choice = viewForFacing(...cell.facing);
        rig.setView(choice);
        rig.applyPose(samplePose({ clip: 'idle', t: 0, time: 0, view: choice.view, reducedMotion: this.reducedMotion }));
        rig.root.setPosition(x, y).setScale(SCALE);
        this.add.text(x, y + 10, cell.label, { fontFamily: FONT, fontSize: '12px', color: cssColor(PALETTE.inkSecondary) }).setOrigin(0.5, 0);
        const art = beanArt();
        const spec = art.spec.views.find((v) => v.view === choice.view && v.mirrored === choice.mirrored);
        const parts = spec ? lookParts(spec.parts, art.cosmetics, cell.look, choice.view, choice.mirrored) : [];
        this.shown.push({ cell, view: choice.view, mirrored: choice.mirrored, parts: parts.map((p) => `${p.id}@${p.source}${p.screenSpace ? ' (as seen)' : ''}`) });
      });
    });
  }

  simTime(): number | null {
    return null;
  }

  pauseSim(): void {}

  resumeSim(): void {}

  stepTo(): number {
    throw new Error('Scene "looks" has no sim to step.');
  }

  stepBy(): number {
    throw new Error('Scene "looks" has no sim to step.');
  }

  debugState(): unknown {
    return {
      reducedMotion: this.reducedMotion,
      cells: this.shown.map(({ cell, view, mirrored, parts }) => ({ label: cell.label, look: lookToString(cell.look), view, mirrored, parts })),
    };
  }
}
