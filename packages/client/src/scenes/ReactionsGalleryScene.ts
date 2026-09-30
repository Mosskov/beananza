import Phaser from 'phaser';
import {
  DEFAULT_LAYOUT,
  HUB_LAYOUTS,
  REACTION_TICKS,
  SIM_HZ,
  Sim,
  createHubScenario,
  type HubAct,
  type HubBean,
  type HubState,
  type ReactionGroup,
  type ReactionKind,
} from '@beananza/sim';
import { prefersReducedMotion } from '../accessibility';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, UI_FONT as FONT, cssColor } from '../config';
import { BeanRig, createBeanShadow } from '../rig/BeanRig';
import { chooseClip, samplePose, type Pose } from '../rig/player';
import { chooseReaction } from '../rig/reactions';
import { viewForFacing } from '../rig/views';
import { frameMainCamera, sharpText } from '../screen-scale';
import { PART_DEFAULTS, presentAct, type ToggledPart } from './hub-presentation';
import type { TestableScene } from './TestableScene';

const KINDS: readonly ReactionKind[] = ['eureka', 'oops', 'waveHi', 'dizzy'];
/** How far into each reaction the three columns of a kind are (share of its duration). */
const PHASES = [0.15, 0.4, 0.7] as const;

/** Animation time of every cell (s): far enough for the acts' own clips to be past their landing. */
const TIME_S = 10;
/** An act that began a second ago (a rider past its landing, a sitter not yet dozing). */
const SINCE_TICK = (TIME_S - 1) * SIM_HZ;

const LABEL_W = 138;
const HEADER_H = 44;
const SCALE = 0.6;
const GROUND_GAP = 30;

interface Scenario {
  label: string;
  /** The bean's act, and the movement that goes with it (m/s), facing as a unit vector. */
  act: (state: HubState) => HubAct;
  v: [number, number];
  facing: [number, number];
}

/** The acts the compatibility table lets a reaction play in (hop acts take no emote, D23). */
const SCENARIOS: readonly Scenario[] = [
  { label: 'free, standing', act: () => ({ kind: 'free' }), v: [0, 0], facing: [0, -1] },
  { label: 'free, walking', act: () => ({ kind: 'free' }), v: [2.4, 0], facing: [1, 0] },
  {
    label: 'pushing',
    act: (s) => ({ kind: 'pushing', cart: s.rail?.carts.find((c) => c.mass >= 10)?.id ?? 'heavy', dir: 1, run: false }),
    v: [0.9, 0],
    facing: [1, 0],
  },
  { label: 'riding', act: (s) => ({ kind: 'riding', cart: s.rail?.carts.find((c) => c.mass < 10)?.id ?? 'light', since: SINCE_TICK }), v: [0, 0], facing: [0, -1] },
  {
    label: 'sitting',
    act: (s) => ({ kind: 'sitting', bench: s.layout.benches[0]?.id ?? 'bench', seat: s.layout.benches[0]?.seats[0]?.id ?? 'west', since: SINCE_TICK }),
    v: [0, 0],
    facing: [0, -1],
  },
];

/** One column: no reaction, or a kind at a share of its duration. */
interface Column {
  kind: ReactionKind | null;
  share: number;
}
const COLUMNS: readonly Column[] = [{ kind: null, share: 0 }, ...KINDS.flatMap((kind) => PHASES.map((share) => ({ kind, share })))];

interface Shown {
  scenario: string;
  kind: ReactionKind | null;
  reactionT: number | null;
  groups: readonly ReactionGroup[];
  actClip: string;
  view: string;
  mirrored: boolean;
  body: { y: number; rotation: number; scaleX: number; scaleY: number };
  arms: Record<string, { rotation: number; y: number }>;
}

const r = (n: number) => Math.round(n * 1e4) / 1e4;

/**
 * Reaction review (D26), a tool scene with labels: every reaction kind at three points of its run,
 * in each act the compatibility table lets it play in, drawn by the real rig, player, presentation
 * table and `chooseReaction` from constructed sim states. Where the table drops a group the cell
 * must show only what is allowed: no jump or shake while walking, no arm while pushing. Props,
 * carts and benches are not drawn (the hub and its scripts show those). Poses follow
 * prefers-reduced-motion as the game does. `?paused=1` changes nothing: the scene is one still frame.
 */
export class ReactionsGalleryScene extends Phaser.Scene implements TestableScene {
  private reducedMotion = false;
  private shown: Shown[] = [];

  constructor() {
    super({ key: 'reactions' });
  }

  create(): void {
    this.reducedMotion = prefersReducedMotion();
    frameMainCamera(this);
    const sim = new Sim(createHubScenario({ layout: HUB_LAYOUTS[DEFAULT_LAYOUT] }), 1);
    const base = sim.state;
    const cellW = (GAME_WIDTH - LABEL_W) / COLUMNS.length;
    const cellH = (GAME_HEIGHT - HEADER_H) / SCENARIOS.length;
    const ink = cssColor(PALETTE.inkSecondary);
    const text = (x: number, y: number, s: string, size = 12, origin: [number, number] = [0.5, 0]) =>
      sharpText(this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color: ink, align: origin[0] === 0.5 ? 'center' : 'left' }).setOrigin(...origin));

    text(8, 4, 'reactions', 14, [0, 0]);
    if (this.reducedMotion) text(8, 22, 'reduced motion', 12, [0, 0]);
    COLUMNS.forEach((col, c) => {
      const x = LABEL_W + cellW * (c + 0.5);
      const secs = col.kind ? `${r((col.share * REACTION_TICKS[col.kind]) / SIM_HZ)} s` : '';
      text(x, HEADER_H - 16, secs, 11);
    });
    KINDS.forEach((kind, k) => text(LABEL_W + cellW * (1 + k * PHASES.length + PHASES.length / 2), 4, kind, 13));
    text(LABEL_W + cellW * 0.5, 4, 'none', 13);

    SCENARIOS.forEach((sc, row) => {
      const feetY = HEADER_H + cellH * (row + 1) - GROUND_GAP;
      text(8, feetY - 44, `${sc.label}\n${viewForFacing(...sc.facing).view}`, 12, [0, 0]);
      COLUMNS.forEach((col, c) => {
        const x = LABEL_W + cellW * (c + 0.5);
        const bean: HubBean = {
          ...base.bean,
          act: sc.act(base),
          vx: sc.v[0],
          vy: sc.v[1],
          facingX: sc.facing[0],
          facingY: sc.facing[1],
          reaction: col.kind ? { kind: col.kind, since: Math.round((TIME_S - (col.share * REACTION_TICKS[col.kind]) / SIM_HZ) * SIM_HZ) } : null,
        };
        const state: HubState = { ...base, bean };
        const look = presentAct(bean.act, state, TIME_S);
        const choice = viewForFacing(bean.facingX, bean.facingY);
        const { clip, t } = chooseClip(bean, TIME_S, state.gravity, look.clip);
        const reaction = chooseReaction(state, TIME_S);
        const pose = samplePose({ clip, t, time: TIME_S, view: choice.view, reducedMotion: this.reducedMotion, reaction });

        if (look.shadow) createBeanShadow(this).setPosition(x, feetY).setScale(SCALE);
        const rig = new BeanRig(this);
        rig.setView(choice);
        for (const [part, shown] of Object.entries(PART_DEFAULTS)) rig.setPartVisible(part, look.parts[part as ToggledPart] ?? shown);
        rig.applyPose(pose);
        rig.root.setPosition(x, feetY).setScale(SCALE);
        this.shown.push(summary(sc.label, col.kind, reaction?.t ?? null, reaction?.groups ?? [], clip, choice, pose));
      });
    });
  }

  simTime(): number | null {
    return null;
  }

  pauseSim(): void {}

  resumeSim(): void {}

  stepTo(): number {
    throw new Error('Scene "reactions" has no sim to step.');
  }

  stepBy(): number {
    throw new Error('Scene "reactions" has no sim to step.');
  }

  debugState(): unknown {
    return { reducedMotion: this.reducedMotion, timeS: TIME_S, cells: this.shown };
  }
}

function summary(scenario: string, kind: ReactionKind | null, reactionT: number | null, groups: readonly ReactionGroup[], actClip: string, choice: { view: string; mirrored: boolean }, pose: Pose): Shown {
  const { y, rotation, scaleX, scaleY } = pose.body;
  const arms: Shown['arms'] = {};
  for (const [slot, tr] of Object.entries(pose)) if (slot.startsWith('arm')) arms[slot] = { rotation: r(tr.rotation), y: r(tr.y) };
  return {
    scenario,
    kind,
    reactionT: reactionT === null ? null : r(reactionT),
    groups,
    actClip,
    view: choice.view,
    mirrored: choice.mirrored,
    body: { y: r(y), rotation: r(rotation), scaleX: r(scaleX), scaleY: r(scaleY) },
    arms,
  };
}
