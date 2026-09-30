import { describe, expect, it } from 'vitest';
import { BEAN_SVGS } from '../src/rig/bean-art-sources';
import { beanDrawingProblems, beanSpecProblems } from '../src/art/checks';
import { buildBeanArtSpec } from '../src/rig/bean-contract';
import { PROP_SVGS } from '../src/art/props';
import { parseAttrs, parseSvgParts, partPivot, type Point, type SvgPart } from '../src/rig/svg-parts';

/**
 * The pivot rules the art used before data-pivot (M1 session 2), kept only to prove the switch
 * moved nothing: arms and the scarf tail at the first point of their path, feet at their ellipse
 * centre, eyes at the mean eye centre, wheels at their first circle, everything else (0, 0).
 */
/** Parts drawn after the switch to data-pivot (M1 session 3), which the old rules never covered. */
const ADDED_SINCE_S2 = new Set(['eyes-sleep']);

function legacyPivot(part: SvgPart): Point {
  const ellipses = [...part.inner.matchAll(/<ellipse\b([^>]*)>/g)].map((m) => parseAttrs(m[1] as string));
  if (part.id.startsWith('wheel-')) {
    const a = parseAttrs(/<circle\b([^>]*)>/.exec(part.inner)?.[1] ?? '');
    return { x: Number(a.cx), y: Number(a.cy) };
  }
  if (part.id.startsWith('arm-') || part.id === 'scarf-tail') {
    const m = /\bd="\s*M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(part.inner);
    return { x: Number(m?.[1]), y: Number(m?.[2]) };
  }
  if (part.id.startsWith('foot-')) return { x: Number(ellipses[0]?.cx), y: Number(ellipses[0]?.cy) };
  if (part.id === 'eyes') {
    const n = ellipses.length;
    return { x: ellipses.reduce((s, a) => s + Number(a.cx), 0) / n, y: ellipses.reduce((s, a) => s + Number(a.cy), 0) / n };
  }
  return { x: 0, y: 0 };
}

describe('bean art contract (art/bean/*.svg)', () => {
  const spec = buildBeanArtSpec(BEAN_SVGS);
  const view = (name: string, mirrored: boolean) => {
    const found = spec.views.find((r) => r.view === name && r.mirrored === mirrored);
    if (!found) throw new Error(`no ${name} ${mirrored}`);
    return found;
  };

  it('parses every view and builds all 8 view combinations', () => {
    expect(spec.views.map((r) => `${r.view}${r.mirrored ? ' mirrored' : ''}`)).toEqual([
      'front',
      'front-34',
      'front-34 mirrored',
      'side',
      'side mirrored',
      'back-34',
      'back-34 mirrored',
      'back',
    ]);
  });

  it('marks the scarf tail and the eyes as not symmetric', () => {
    expect(spec.asymmetric).toEqual(['eyes', 'scarf-tail']);
  });

  it('takes asymmetric parts in mirrored views from the -left drawings, drawn as seen on screen', () => {
    for (const name of ['front-34', 'side', 'back-34']) {
      const tail = view(name, true).parts.find((p) => p.id === 'scarf-tail');
      expect(tail?.source).toBe(`${name}-left`);
      expect(tail?.screenSpace).toBe(true);
      expect(view(name, false).parts.find((p) => p.id === 'scarf-tail')?.screenSpace).toBe(false);
    }
  });

  // The drawing rules live in src/art/checks.ts, which pnpm art:check runs too; its own tests
  // (art-checks.test.ts) re-introduce each slip.
  it('keeps the scarf tail on the bean’s left side in every direction', () => {
    expect(beanSpecProblems(spec)).toEqual([]);
  });

  it('puts the near arm and foot on the side nearer the camera in the ¾ views, and the near arm in front', () => {
    expect(beanDrawingProblems(spec.docs).filter((p) => /near|far/.test(p))).toEqual([]);
  });

  it('keeps the eye highlights on the light side, and the face, belly and anchors on the body', () => {
    expect(beanDrawingProblems(spec.docs)).toEqual([]);
  });

  it('reads pivots from data-pivot: shoulder for arms, foot and eye centres, (0, 0) for the body', () => {
    const front = parseSvgParts(BEAN_SVGS.front as string);
    const part = (id: string) => front.parts.find((p) => p.id === id);
    expect(partPivot(part('arm-left')!)).toEqual({ x: -44, y: -50 });
    expect(partPivot(part('foot-right')!)).toEqual({ x: 18, y: 0 });
    expect(partPivot(part('eyes')!)).toEqual({ x: 0, y: -80 });
    expect(partPivot(part('body')!)).toEqual({ x: 0, y: 0 });
  });

  it('moved no pivot: every data-pivot equals the rule it replaced (M1 session 2)', () => {
    for (const [name, text] of Object.entries({ ...BEAN_SVGS, ...PROP_SVGS })) {
      for (const part of parseSvgParts(text).parts) {
        if (ADDED_SINCE_S2.has(part.id)) continue;
        expect(partPivot(part), `${name} ${part.id}`).toEqual(legacyPivot(part));
      }
    }
  });

  it('has the anchors: headwear on the top of the body in every view, and the side view’s lean point', () => {
    expect(spec.anchors.front.headwear).toEqual({ x: 0, y: -114 });
    expect(spec.anchors.side.headwear).toEqual({ x: 2, y: -114 });
    for (const v of ['front-34', 'back-34', 'back'] as const) expect(spec.anchors[v].headwear).toEqual({ x: 0, y: -114 });
    // The lean point replaced the constant 40 (units above the feet) in the pushing stand-off.
    expect(spec.anchors.side.lean).toEqual({ x: 0, y: -40 });
    // Anchors are never parts, so they are never drawn.
    for (const v of spec.views) expect(v.parts.some((p) => p.id === 'anchors')).toBe(false);
  });

  it('has the effect anchors in every view: fx-head beside the head (the "z"), fx-brow, fx-ground between the feet', () => {
    expect(spec.anchors.front['fx-head']).toEqual({ x: 32, y: -124 });
    expect(spec.anchors.front['fx-brow']).toEqual({ x: -30, y: -96 });
    for (const v of ['front', 'front-34', 'side', 'back-34', 'back'] as const) {
      expect(spec.anchors[v]['fx-ground'], v).toEqual({ x: 0, y: 0 });
      expect(spec.anchors[v]['fx-head'], v).toBeDefined();
      expect(spec.anchors[v]['fx-brow'], v).toBeDefined();
    }
  });

  it('hides the goggles and the pushing arm by default, and drops the shadow from the rig', () => {
    const side = view('side', false);
    expect(side.parts.find((p) => p.id === 'arm-far-push')?.hiddenByDefault).toBe(true);
    expect(side.parts.find((p) => p.id === 'headwear-goggles')?.hiddenByDefault).toBe(true);
    expect(side.parts.find((p) => p.id === 'body')?.hiddenByDefault).toBe(false);
    expect(side.parts.some((p) => p.id === 'shadow')).toBe(false);
  });

  it('rejects art that breaks the contract', () => {
    const broken = { ...BEAN_SVGS, 'side-left': (BEAN_SVGS['side-left'] as string).replace(/<g id="scarf-tail"[\s\S]*?<\/g>/, '') };
    expect(() => buildBeanArtSpec(broken)).toThrow(/side-left: asymmetric part "scarf-tail" needs a drawing here/);
    const nested = { ...BEAN_SVGS, front: (BEAN_SVGS.front as string).replace('<g id="belly">', '<g id="belly"><g>') };
    expect(() => buildBeanArtSpec(nested)).toThrow(/front/);
    const noBody = { ...BEAN_SVGS, back: (BEAN_SVGS.back as string).replace('id="body"', 'id="bod"') };
    expect(() => buildBeanArtSpec(noBody)).toThrow(/back: missing part "body"/);
    const edit = (view: string, from: string | RegExp, to: string) => ({ ...BEAN_SVGS, [view]: (BEAN_SVGS[view] as string).replace(from, to) });
    expect(() => buildBeanArtSpec(edit('side', 'id="anchor-lean"', 'id="anchor-tilt"'))).toThrow(/side: missing anchor "lean"/);
    expect(() => buildBeanArtSpec(edit('side', 'id="anchor-fx-brow"', 'id="anchor-fx-brows"'))).toThrow(/side: missing anchor "fx-brow"/);
    expect(() => buildBeanArtSpec(edit('front', 'cy="-114" r="0"', 'cy="-100" r="0"'))).toThrow(/front: anchor "headwear" is not on the top of the body/);
    expect(() => buildBeanArtSpec(edit('back', 'cy="-114" r="0"', 'cy="-400" r="0"'))).toThrow(/back: anchor "headwear" is outside the viewBox/);
    expect(() => buildBeanArtSpec(edit('front', / data-pivot="-44 -50"/, ''))).toThrow(/front: Part "arm-left" needs data-pivot/);
    expect(() => buildBeanArtSpec(edit('front', 'data-pivot="-44 -50"', 'data-pivot="-44"'))).toThrow(/malformed data-pivot/);
    expect(() => buildBeanArtSpec(edit('front', '<circle id="anchor-headwear"', '<rect id="anchor-headwear"'))).toThrow(/Anchors must be <circle/);
    expect(() => buildBeanArtSpec(edit('side-left', '</svg>', '<g id="anchors"><circle id="anchor-x" cx="0" cy="0" r="0"/></g></svg>'))).toThrow(
      /side-left: anchors belong in side.svg/,
    );
  });
});
