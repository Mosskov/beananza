import { describe, expect, it } from 'vitest';
import { BEAN_SVGS } from '../src/rig/bean-art-sources';
import { buildBeanArtSpec } from '../src/rig/bean-contract';
import { parseSvgParts, partPivot } from '../src/rig/svg-parts';

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

  it('keeps the eye highlights on the light side (up and to the right of each pupil)', () => {
    for (const source of ['front', 'front-34', 'side', 'front-34-left', 'side-left']) {
      const eyes = parseSvgParts(BEAN_SVGS[source] as string).parts.find((p) => p.id === 'eyes');
      const pupils = [...(eyes?.inner ?? '').matchAll(/<ellipse cx="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
      const shines = [...(eyes?.inner ?? '').matchAll(/<circle cx="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
      expect(shines.length, source).toBe(pupils.length);
      shines.forEach((s, i) => expect(s, source).toBeGreaterThan(pupils[i] as number));
    }
  });

  it('derives pivots: shoulder for arms, ellipse centre for feet, (0, 0) for the body', () => {
    const front = parseSvgParts(BEAN_SVGS.front as string);
    const part = (id: string) => front.parts.find((p) => p.id === id);
    expect(partPivot(part('arm-left')!)).toEqual({ x: -44, y: -50 });
    expect(partPivot(part('foot-right')!)).toEqual({ x: 18, y: 0 });
    expect(partPivot(part('eyes')!)).toEqual({ x: 0, y: -80 });
    expect(partPivot(part('body')!)).toEqual({ x: 0, y: 0 });
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
  });
});
