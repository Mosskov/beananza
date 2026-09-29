import { describe, expect, it } from 'vitest';
import { BEAN_COLOURS, COLOUR_IDS, DEFAULT_LOOK, allLooks, lookToString, parseLook, type BeanLook } from '@beananza/shared';
import { BEAN_SVGS } from '../src/rig/bean-art-sources';
import { buildBeanArtSpec } from '../src/rig/bean-contract';
import { KEY, colourSet, recolour, usesKeyColours } from '../src/rig/colours';
import { COSMETIC_SVGS, buildCosmeticsSpec, cosmeticDocs, lookParts } from '../src/rig/looks';
import { viewForFacing, type BeanView } from '../src/rig/views';

const bean = buildBeanArtSpec(BEAN_SVGS);
const cosmetics = buildCosmeticsSpec();
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
const partsFor = (look: BeanLook, view: BeanView, mirrored: boolean) => {
  const spec = bean.views.find((v) => v.view === view && v.mirrored === mirrored);
  if (!spec) throw new Error(`no ${view} ${mirrored}`);
  return lookParts(spec.parts, cosmetics, look, view, mirrored);
};

describe('looks (D25)', () => {
  it('parses ?look= in any order, keeps defaults, and reports unknown ids', () => {
    expect(parseLook('glasses,bow,Blue,spots')).toEqual({ look: { colour: 'blue', pattern: 'spots', headwear: 'bow', face: 'glasses' }, unknown: [] });
    expect(parseLook(null).look).toEqual(DEFAULT_LOOK);
    expect(parseLook('teal,top-hat').unknown).toEqual(['top-hat']);
    expect(parseLook(lookToString({ colour: 'cream', pattern: 'plain', headwear: 'sprout', face: 'round' })).look.headwear).toBe('sprout');
    expect(allLooks()).toHaveLength(10 * 2 * 4 * 2);
  });
});

describe('colours: palette swaps before rasterizing', () => {
  it('orange is the art as drawn; every other colour swaps all six key colours', () => {
    expect(colourSet(BEAN_COLOURS.orange)).toEqual(KEY);
    const blue = colourSet(BEAN_COLOURS.blue);
    const body = (BEAN_SVGS.side as string).match(/<g id="foot-far"[\s\S]*?<\/g>/)?.[0] ?? '';
    expect(recolour(body, 'blue')).toContain(blue.farFoot);
    for (const id of COLOUR_IDS) {
      const out = recolour(Object.values(KEY).join(' '), id);
      expect(usesKeyColours(out), id).toBe(id === 'orange');
      expect(out.split(' ')).toEqual(Object.values(colourSet(BEAN_COLOURS[id])));
    }
  });

  it('derives the far shades with orange’s per-channel ratios (darker than the near shade)', () => {
    const lum = (hex: string) => [1, 3, 5].reduce((s, i) => s + parseInt(hex.slice(i, i + 2), 16), 0);
    for (const id of COLOUR_IDS) {
      const set = colourSet(BEAN_COLOURS[id]);
      expect(lum(set.farFoot), id).toBeLessThan(lum(set.foot));
      expect(lum(set.farArm), id).toBeLessThan(lum(set.arm));
    }
  });

  it('gives only the light colour (cream) a soft outline on the body', () => {
    const body = '<path d="M0 0" fill="#E08A5B"/>';
    expect(recolour(body, 'cream', 'body')).toContain(`stroke="${BEAN_COLOURS.cream.foot}"`);
    expect(recolour(body, 'blue', 'body')).not.toContain('stroke=');
    expect(recolour(body, 'cream', 'belly')).not.toContain('stroke=');
  });

  it('never recolours the scarf, eyes, mouth or cheeks', () => {
    for (const view of bean.views) {
      for (const p of view.parts) if (['scarf', 'scarf-tail', 'eyes', 'mouth', 'cheeks'].includes(p.id)) expect(p.keyed, `${view.view} ${p.id}`).toBe(false);
      expect(view.parts.find((p) => p.id === 'body')?.keyed).toBe(true);
    }
  });
});

describe('cosmetic art contract', () => {
  it('has spots, three headwear pieces and glasses; only the bow is not symmetric', () => {
    expect(Object.keys(cosmetics.pattern)).toEqual(['spots']);
    expect(Object.keys(cosmetics.headwear)).toEqual(['sprout', 'bear-ears', 'bow']);
    expect(Object.keys(cosmetics.face)).toEqual(['glasses']);
    const asymmetric = Object.values(cosmetics).flatMap((k) => Object.values(k)).filter((a) => a.asymmetric).map((a) => a.id);
    expect(asymmetric).toEqual(['bow']);
  });

  it('rejects broken cosmetic art', () => {
    const edit = (kind: 'pattern' | 'headwear' | 'face', id: string, from: string | RegExp, to: string) => ({
      ...COSMETIC_SVGS,
      [kind]: { ...COSMETIC_SVGS[kind], [id]: (COSMETIC_SVGS[kind][id] as string).replace(from, to) },
    });
    expect(() => buildCosmeticsSpec(edit('headwear', 'sprout', 'id="back"', 'id="rear"'))).toThrow(/headwear sprout: missing the "back" group/);
    expect(() => buildCosmeticsSpec(edit('headwear', 'bow', 'id="side-left"', 'id="side-l"'))).toThrow(/bow: not symmetric, so it needs a "side-left" group/);
    expect(() => buildCosmeticsSpec(edit('headwear', 'bear-ears', '<g id="front" data-layer="behind">', '<g id="front" data-layer="front">'))).toThrow(/only "behind"/);
    expect(() => buildCosmeticsSpec(edit('face', 'glasses', 'id="side"', 'id="side" data-layer="behind"'))).toThrow(/only headwear can go behind/);
    expect(() => buildCosmeticsSpec(edit('pattern', 'spots', 'id="front-34"', 'id="front-3/4"'))).toThrow(/missing the "front-34" group/);
  });

  it('clips each view’s pattern to that view’s body, and moves headwear to that view’s anchor', () => {
    const docs = cosmeticDocs(bean, cosmetics);
    for (const view of ['front', 'front-34', 'side', 'back-34', 'back'] as const) {
      const body = bean.docs[view]?.parts.find((p) => p.id === 'body')?.inner ?? '';
      const pattern = docs[`pattern:spots:${view}`]?.parts[0]?.inner ?? '';
      expect(pattern).toContain(`<clipPath id="clip-spots-${view}">${body}</clipPath>`);
      expect(pattern).toContain(`clip-path="url(#clip-spots-${view})"`);
      const a = bean.anchors[view].headwear!;
      expect(docs[`headwear:sprout:${view}`]?.parts[0]?.inner).toMatch(new RegExp(`^<g transform="translate\\(${a.x} ${a.y}\\)">`));
    }
    // A -left drawing is as seen on screen: it sits at the mirrored anchor.
    expect(docs['headwear:bow:side-left']?.parts[0]?.inner).toMatch(/^<g transform="translate\(-2 -114\)">/);
  });
});

describe('every look on all 8 directions', () => {
  /** Screen x of the bow's drawn centre relative to the bean's centre (its translate in the drawing). */
  const bowScreenX = (view: BeanView, mirrored: boolean) => {
    const part = partsFor({ ...DEFAULT_LOOK, headwear: 'bow' }, view, mirrored).find((p) => p.id === 'headwear');
    const group = cosmetics.headwear.bow?.groups[part?.source.split(':')[2] ?? ''];
    const x = Number(/translate\((-?[\d.]+)/.exec(group?.inner ?? '')?.[1]);
    return mirrored && !part?.screenSpace ? -x : x;
  };
  const tailScreenX = (view: BeanView, mirrored: boolean) => {
    const p = bean.views.find((v) => v.view === view && v.mirrored === mirrored)?.parts.find((q) => q.id === 'scarf-tail');
    if (!p) throw new Error('no tail');
    return mirrored && !p.screenSpace ? -p.pivot.x : p.pivot.x;
  };

  it('keeps the bow on the bean’s left in every direction, on the same side as the scarf tail', () => {
    for (const [dir, x, y] of DIRECTIONS) {
      const { view, mirrored } = viewForFacing(x, y);
      if (view === 'side') continue; // the side views are checked by layer below
      expect(Math.sign(bowScreenX(view, mirrored)), dir).toBe(Math.sign(tailScreenX(view, mirrored)));
    }
    const layer = (mirrored: boolean) => {
      const ids = partsFor({ ...DEFAULT_LOOK, headwear: 'bow' }, 'side', mirrored).map((p) => p.id);
      return ids.indexOf('headwear') > ids.indexOf('body') ? 'in front' : 'behind';
    };
    // Facing east the bean's left is its far side (behind the head); facing west, the near side.
    expect(layer(false)).toBe('behind');
    expect(layer(true)).toBe('in front');
  });

  it('draws the mirrored directions’ bow from its -left drawing, as seen on screen', () => {
    for (const view of ['front-34', 'side', 'back-34'] as const) {
      const part = partsFor({ ...DEFAULT_LOOK, headwear: 'bow' }, view, true).find((p) => p.id === 'headwear');
      expect(part).toMatchObject({ source: `headwear:bow:${view}-left`, screenSpace: true });
      expect(partsFor({ ...DEFAULT_LOOK, headwear: 'bow' }, view, false).find((p) => p.id === 'headwear')?.screenSpace).toBe(false);
    }
  });

  it('adds each piece where it belongs, keeps every drawn part, for all 160 looks × 8 directions', () => {
    for (const look of allLooks()) {
      for (const [dir, x, y] of DIRECTIONS) {
        const { view, mirrored } = viewForFacing(x, y);
        const base = partsFor(DEFAULT_LOOK, view, mirrored);
        const parts = partsFor(look, view, mirrored);
        const ids = parts.map((p) => p.id);
        const name = `${lookToString(look)} ${dir}`;
        // Every drawn part is still there, in the same order.
        expect(ids.filter((id) => !['pattern', 'headwear', 'face'].includes(id)), name).toEqual(base.map((p) => p.id));
        expect(ids.includes('pattern'), name).toBe(look.pattern === 'spots');
        if (look.pattern === 'spots') expect(ids.indexOf('pattern'), name).toBe(ids.indexOf('body') + 1);
        const hasEyes = ids.includes('eyes');
        expect(ids.includes('face'), name).toBe(look.face === 'glasses' && hasEyes);
        if (ids.includes('face')) expect(ids.indexOf('face'), name).toBe(ids.indexOf('eyes') + 1);
        expect(ids.includes('headwear'), name).toBe(look.headwear !== 'none');
        // Only an asymmetric piece in a mirrored view is drawn as seen on screen.
        for (const p of parts.filter((q) => ['pattern', 'headwear', 'face'].includes(q.id))) {
          expect(p.screenSpace, `${name} ${p.id}`).toBe(mirrored && look.headwear === 'bow' && p.id === 'headwear');
        }
      }
    }
  });
});
