import { describe, expect, it } from 'vitest';
import type { ReactionGroup } from '@beananza/sim';
import { EFFECTS } from '../src/art/effects';
import { BEAN_SVGS } from '../src/rig/bean-art-sources';
import { buildBeanArtSpec } from '../src/rig/bean-contract';
import { CLIPS } from '../src/rig/clips';
import { REACTION_PARTS, reactionParts } from '../src/rig/reaction-parts';
import { PART_DEFAULTS } from '../src/scenes/presentation/common';

const layer = (kind: 'eureka' | 'oops', groups: readonly ReactionGroup[]) => ({ kind, t: 0.5, groups });

describe('reaction parts (D26)', () => {
  it('show the face and the effect only for the groups the act allows', () => {
    expect(reactionParts(null)).toEqual({});
    expect(reactionParts(layer('eureka', ['face', 'effect', 'body']))).toEqual({ ...REACTION_PARTS.eureka.face, ...REACTION_PARTS.eureka.effect });
    expect(reactionParts(layer('oops', ['face']))).toEqual({ eyes: false, 'eyes-sleep': false, mouth: false, 'eyes-squeeze': true, 'mouth-wavy': true });
    expect(reactionParts(layer('oops', ['effect']))).toEqual({ 'doze-z': false, 'sweat-drop': true, 'dizzy-star-1': true, 'dizzy-star-2': true, 'dizzy-star-3': true });
    expect(reactionParts({ kind: 'dizzy', t: 0.5, groups: ['effect'] })).toEqual({ 'doze-z': false, 'dizzy-star-1': true, 'dizzy-star-2': true, 'dizzy-star-3': true });
    expect(reactionParts(layer('eureka', ['arms', 'body']))).toEqual({});
  });

  it('name only parts the hub resets when the reaction ends (PART_DEFAULTS)', () => {
    for (const [kind, groups] of Object.entries(REACTION_PARTS)) {
      for (const parts of Object.values(groups)) for (const part of Object.keys(parts)) expect(Object.keys(PART_DEFAULTS), `${kind}: ${part}`).toContain(part);
    }
  });

  it('face parts are drawn in every view with a face, hidden until a reaction shows them', () => {
    const spec = buildBeanArtSpec(BEAN_SVGS);
    const shown = Object.values(REACTION_PARTS).flatMap((g) => Object.entries(g.face ?? {}).filter(([, on]) => on).map(([id]) => id));
    expect(shown.sort()).toEqual(['eyes-happy', 'eyes-squeeze', 'mouth-open', 'mouth-wavy']);
    for (const view of spec.views.filter((v) => ['front', 'front-34', 'side'].includes(v.view))) {
      for (const id of shown) expect(view.parts.find((p) => p.id === id)?.hiddenByDefault, `${view.view}: ${id}`).toBe(true);
    }
  });

  it("effects sit on the slot their reaction clip moves", () => {
    const moves = (clip: 'eureka' | 'oops', slot: string) => CLIPS[clip].front.tracks.some((tr) => tr.slot === slot && tr.group === 'effect');
    expect(EFFECTS['eureka-bulb']?.slot).toBe('fxHead');
    expect(moves('eureka', 'fxHead')).toBe(true);
    expect(EFFECTS['sweat-drop']?.slot).toBe('fxBrow');
    expect(moves('oops', 'fxBrow')).toBe(true);
    expect(EFFECTS['dizzy-stars']?.slot).toBe('fxHead');
    expect(moves('oops', 'fxHead')).toBe(true);
    expect(CLIPS.dizzy.front.tracks.some((tr) => tr.slot === 'fxHead' && tr.group === 'effect')).toBe(true);
  });
});
