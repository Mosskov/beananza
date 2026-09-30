import { describe, expect, it } from 'vitest';
import { BEAN_SVGS } from '../src/rig/bean-art-sources';
import { buildBeanArtSpec } from '../src/rig/bean-contract';
import { EFFECT_ANCHORS, EFFECT_SLOTS, EFFECT_SLOT_ANCHORS, HIDDEN_BY_DEFAULT, SLOTS, VIEWS } from '../src/rig/views';
import { EFFECTS, EFFECT_SVGS, buildEffectArtSpec, effectKey } from '../src/art/effects';

describe('effect art contract (art/effects/*.svg, D26)', () => {
  const spec = buildEffectArtSpec(EFFECT_SVGS);
  const dozeZ = EFFECT_SVGS['doze-z'] as string;

  it('has the doze "z" on the head slot, drawn as shapes (not text) with its origin at the anchor', () => {
    expect(EFFECTS['doze-z']).toEqual({ slot: 'fxHead', parts: ['doze-z'] });
    expect(spec.docs['doze-z']?.parts.map((p) => p.id)).toEqual(['doze-z']);
    expect(spec.pivots.get(effectKey('doze-z', 'doze-z'))).toEqual({ x: 0, y: 0 });
    expect(dozeZ).not.toMatch(/<text\b/);
  });

  it('draws the "z" where it was drawn in the front view: the same shapes, shifted to the fx-head anchor', () => {
    // The two z shapes as they were in art/bean/front.svg (pivot 32 -124), and the same ones at the origin.
    const before = ['M26 -130 H38 L26 -118 H38', 'M40 -142 H47 L40 -135 H47'];
    const after = ['M-6 -6 H6 L-6 6 H6', 'M8 -18 H15 L8 -11 H15'];
    const anchor = buildBeanArtSpec(BEAN_SVGS).anchors.front['fx-head'];
    expect(anchor).toEqual({ x: 32, y: -124 });
    const shift = (d: string) => d.replace(/(-?\d+) (-?\d+)/g, (_, x: string, y: string) => `${Number(x) + (anchor?.x ?? 0)} ${Number(y) + (anchor?.y ?? 0)}`).replace(/H(-?\d+)/g, (_, x: string) => `H${Number(x) + (anchor?.x ?? 0)}`);
    after.forEach((d, i) => expect(shift(d)).toBe(before[i]));
    const drawn = [...dozeZ.matchAll(/\bd="([^"]*)"/g)].map((m) => m[1]);
    expect(drawn).toEqual(after);
  });

  it('is gone from the bean views, which only keep the anchors', () => {
    for (const v of VIEWS) expect(BEAN_SVGS[v]).not.toContain('id="doze-z"');
  });

  it('places every effect at an anchor that every bean view has', () => {
    const anchors = buildBeanArtSpec(BEAN_SVGS).anchors;
    expect(Object.values(EFFECT_SLOT_ANCHORS).sort()).toEqual([...EFFECT_ANCHORS].sort());
    for (const { slot } of Object.values(EFFECTS)) {
      for (const v of VIEWS) expect(anchors[v][EFFECT_SLOT_ANCHORS[slot]], `${v} ${slot}`).toBeDefined();
    }
  });

  it('has the three effect slots next to the body, limb, eye and tail slots; effects are hidden by default', () => {
    expect(EFFECT_SLOTS).toEqual(['fxHead', 'fxBrow', 'fxGround']);
    for (const s of EFFECT_SLOTS) expect(SLOTS).toContain(s);
    expect(SLOTS).not.toContain('fx');
    expect(HIDDEN_BY_DEFAULT.has('doze-z')).toBe(false); // an effect, not a bean part; the rig hides every effect
  });

  it('rejects an effect that breaks the contract', () => {
    const edit = (from: string | RegExp, to: string) => ({ ...EFFECT_SVGS, 'doze-z': dozeZ.replace(from, to) });
    expect(() => buildEffectArtSpec(edit('id="doze-z"', 'id="zzz"'))).toThrow(/doze-z: missing part "doze-z"/);
    expect(() => buildEffectArtSpec({})).toThrow(/doze-z: missing/);
    expect(() => buildEffectArtSpec(edit('</svg>', '<g id="anchors"><circle id="anchor-x" cx="0" cy="0" r="0"/></g></svg>'))).toThrow(/effects have no anchors/);
    expect(() => buildEffectArtSpec(edit('viewBox="-20 -40 60 60"', 'viewBox="10 10 60 60"'))).toThrow(/origin \(0, 0\), the anchor, is outside the viewBox/);
    expect(() => buildEffectArtSpec(edit('stroke="#5A4A40" stroke-width="3"', 'stroke="#E08A5B" stroke-width="3"'))).toThrow(/uses the bean's key colours/);
    expect(() => buildEffectArtSpec(edit('</g>', '<text>z</text></g>'))).toThrow(/uses <text> or <image>/);
    expect(() => buildEffectArtSpec(edit('<g id="doze-z">', '<g id="doze-z"><g>'))).toThrow(/nested <g>/);
  });
});
