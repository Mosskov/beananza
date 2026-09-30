import Phaser from 'phaser';
import { prefersReducedMotion } from '../accessibility';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE, UI_FONT as FONT, cssColor } from '../config';
import { BeanRig, createBeanShadow } from '../rig/BeanRig';
import { CLIP_NAMES, CLIPS, familyOf, phaseTime, type ClipName } from '../rig/clips';
import { samplePose, type Pose } from '../rig/player';
import { pickDirections } from '../rig/views';
import type { SceneStartData, TestableScene } from './TestableScene';

/** `?scene=clip` reads these (tools/shot's `pnpm clip:sheet` sets them). */
export const CLIP_SHEET_PARAMS = { clip: 'clip', views: 'views', phases: 'phases' } as const;

/**
 * Parts a clip needs shown, as the hub's presentation rows show them for the act that plays it
 * (`scenes/presentation/`): the pushing arm, and dozing's closed eyes and "z".
 */
const CLIP_PARTS: Partial<Record<ClipName, Record<string, boolean>>> = {
  push: { 'arm-far-push': true },
  pushHeavy: { 'arm-far-push': true },
  doze: { eyes: false, 'eyes-sleep': true, 'doze-z': true },
};

const LABEL_W = 96;
const HEADER_H = 26;

/**
 * Review scene for one animation clip (no sim): the clip at n phases (columns) in each chosen
 * direction (rows), drawn by the real rig and rig player, in the look from `?look=`. Poses
 * follow prefers-reduced-motion as the game does. A tool scene: the labels are for reviewers.
 */
export class ClipSheetScene extends Phaser.Scene implements TestableScene {
  private reducedMotion = false;
  private shown: { direction: string; view: string; mirrored: boolean; t: number; pose: Pose }[] = [];
  private clipName: ClipName = 'idle';

  constructor() {
    super({ key: 'clip' });
  }

  create(data: SceneStartData): void {
    this.reducedMotion = prefersReducedMotion();
    const params = new URLSearchParams(window.location.search);
    const clip = params.get(CLIP_SHEET_PARAMS.clip) ?? 'idle';
    if (!(CLIP_NAMES as readonly string[]).includes(clip)) throw new Error(`Unknown clip "${clip}". Clips: ${CLIP_NAMES.join(', ')}.`);
    this.clipName = clip as ClipName;
    const phases = Math.max(1, Math.min(16, Number(params.get(CLIP_SHEET_PARAMS.phases) ?? 8) || 8));
    const dirs = pickDirections(params.get(CLIP_SHEET_PARAMS.views) ?? 'all');

    const cellW = (GAME_WIDTH - LABEL_W) / phases;
    const cellH = (GAME_HEIGHT - HEADER_H) / dirs.length;
    // The drawn bean is about 140 × 170 art units with its shadow, plus a line of label.
    const scale = Math.min(cellW / 150, (cellH - 14) / 175, 1);
    const ink = cssColor(PALETTE.inkSecondary);
    const title = `${clip}${this.reducedMotion ? ' (prefers-reduced-motion)' : ''}`;
    this.add.text(8, 6, title, { fontFamily: FONT, fontSize: '14px', color: cssColor(this.reducedMotion ? PALETTE.labelAccent : PALETTE.ink) });
    for (let k = 0; k < phases; k++) {
      this.add.text(LABEL_W + cellW * (k + 0.5), 8, `${k}/${phases}`, { fontFamily: FONT, fontSize: '12px', color: ink }).setOrigin(0.5, 0);
    }
    dirs.forEach((dir, r) => {
      const family = familyOf(dir.choice.view);
      const data0 = CLIPS[this.clipName][family];
      const feetY = HEADER_H + cellH * (r + 1) - 14 - 18 * scale;
      this.add.text(8, feetY - 40 * scale, `${dir.name}\n${dir.choice.view}${dir.choice.mirrored ? ' m' : ''}`, { fontFamily: FONT, fontSize: '12px', color: ink });
      for (let k = 0; k < phases; k++) {
        const x = LABEL_W + cellW * (k + 0.5);
        const t = phaseTime(data0.duration, data0.loop, k, phases);
        createBeanShadow(this).setPosition(x, feetY).setScale(scale);
        const rig = new BeanRig(this, data.look);
        rig.setView(dir.choice);
        for (const [part, visible] of Object.entries(CLIP_PARTS[this.clipName] ?? {})) rig.setPartVisible(part, visible);
        // Blinking runs on its own time; 0 keeps the eyes open.
        const pose = samplePose({ clip: this.clipName, t, time: 0, view: dir.choice.view, reducedMotion: this.reducedMotion });
        rig.applyPose(pose);
        rig.root.setPosition(x, feetY).setScale(scale);
        this.add.text(x, feetY + 18 * scale + 2, `t=${t.toFixed(3)}`, { fontFamily: FONT, fontSize: '10px', color: ink }).setOrigin(0.5, 0);
        this.shown.push({ direction: dir.name, view: dir.choice.view, mirrored: dir.choice.mirrored, t, pose });
      }
    });
  }

  simTime(): number | null {
    return null;
  }

  pauseSim(): void {}

  resumeSim(): void {}

  stepTo(): number {
    throw new Error('Scene "clip" has no sim to step.');
  }

  stepBy(): number {
    throw new Error('Scene "clip" has no sim to step.');
  }

  debugState(): unknown {
    const r = (n: number) => Math.round(n * 1000) / 1000;
    const round = (s: Pose[keyof Pose]) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, r(v)]));
    return {
      clip: this.clipName,
      reducedMotion: this.reducedMotion,
      cells: this.shown.map(({ direction, view, mirrored, t, pose }) => ({
        direction,
        view,
        mirrored,
        t: r(t),
        pose: Object.fromEntries(Object.entries(pose).map(([slot, s]) => [slot, round(s)])),
      })),
    };
  }
}
