import { describe, expect, it } from 'vitest';
import { BEAN_SVGS } from '../src/rig/bean-art-sources';
import { buildBeanArtSpec } from '../src/rig/bean-contract';
import { PROP_SVGS } from '../src/art/props';
import { parseAttrs, parseSvgParts, partPivot, type Point, type SvgPart } from '../src/rig/svg-parts';

/**
 * The pivot rules the art used before data-pivot (M1 session 2), kept only to prove the switch
 * moved nothing: arms and the scarf tail at the first point of their path, feet at their ellipse
 * centre, eyes at the mean eye centre, wheels at their first circle, everything else (0, 0).
 */
/** Parts drawn after the switch to data-pivot (M1 session 3), which the old rules never covered. */
const ADDED_SINCE_S2 = new Set(['eyes-sleep', 'doze-z']);

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

  it('keeps the scarf tail on the bean’s left side in every direction', () => {
    // Screen x of the tail's knot. Facing the camera (front), the bean's left is screen right;
    // facing away (back), screen left. Facing screen-right (side), its left is the far side, so
    // the tail is behind the body; facing screen-left it is the near side, in front of the body.
    const knotX = (name: string, mirrored: boolean) => {
      const p = view(name, mirrored).parts.find((q) => q.id === 'scarf-tail');
      if (!p) throw new Error('no tail');
      // Unmirrored parts are mirrored on screen; screen-space ones are drawn as seen.
      return mirrored && !p.screenSpace ? -p.pivot.x : p.pivot.x;
    };
    const layer = (name: string, mirrored: boolean) => {
      const ids = view(name, mirrored).parts.map((p) => p.id);
      return ids.indexOf('scarf-tail') > ids.indexOf('body') ? 'in front' : 'behind';
    };
    expect(knotX('front', false)).toBeGreaterThan(0);
    expect(knotX('back', false)).toBeLessThan(0);
    expect(knotX('front-34', false)).toBeGreaterThan(0); // turned to its right: left side is screen right
    expect(knotX('front-34', true)).toBeGreaterThan(0); // turned to its left: left side is screen right
    expect(knotX('back-34', false)).toBeLessThan(0);
    expect(knotX('back-34', true)).toBeLessThan(0);
    expect(layer('side', false)).toBe('behind');
    expect(layer('side', true)).toBe('in front');
  });

  it('puts the near arm and foot on the side nearer the camera in the ¾ views', () => {
    // Turned to its right towards the camera (front ¾), the bean's right side is near and on
    // screen left; turned to its right away from the camera (back ¾), it is near and on screen right.
    const pivotX = (name: string, id: string) => {
      const p = view(name, false).parts.find((q) => q.id === id);
      if (!p) throw new Error(`no ${id}`);
      return p.pivot.x;
    };
    for (const id of ['arm-near', 'foot-near']) {
      expect(pivotX('front-34', id), id).toBeLessThan(0);
      expect(pivotX('back-34', id), id).toBeGreaterThan(0);
    }
    for (const id of ['arm-far', 'foot-far']) {
      expect(pivotX('front-34', id), id).toBeGreaterThan(0);
      expect(pivotX('back-34', id), id).toBeLessThan(0);
    }
  });

  it('keeps the eye highlights on the light side (up and to the right of each pupil)', () => {
    for (const source of ['front', 'front-34', 'side', 'front-34-left', 'side-left']) {
      const eyes = parseSvgParts(BEAN_SVGS[source] as string).parts.find((p) => p.id === 'eyes');
      const pupils = [...(eyes?.inner ?? '').matchAll(/<ellipse cx="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
      const shines = [...(eyes?.inner ?? '').matchAll(/<circle cx="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
      expect(shines.length, source).toBe(pupils.length);
      shines.forEach((s, i) => expect(s, source).toBeGreaterThan(pupils[i] as number));
    }
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
