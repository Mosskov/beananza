import { describe, expect, it } from 'vitest';
import { artFileKind, checkArt, type ArtFiles } from '../src/art/checks';

/** All of art/ as `pnpm art:check` reads it, keyed by repo path. */
const ART: ArtFiles = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../../../art/**/*.svg', { query: '?raw', import: 'default', eager: true })).map(([path, text]) => [
    path.replace(/^(\.\.\/)+/, ''),
    text,
  ]),
);

const edit = (path: string, from: string | RegExp, to: string): ArtFiles => {
  const text = ART[path] as string;
  const next = text.replace(from, to);
  if (next === text) throw new Error(`edit did not apply to ${path}`);
  return { ...ART, [path]: next };
};

const messages = (files: ArtFiles) => checkArt(files).map((f) => `${f.file} | ${f.message}`);

describe('the art contract checks (pnpm art:check)', () => {
  it('reads every loaded file, and knows reference art from loaded art', () => {
    expect(artFileKind('art/bean/side-left.svg')).toEqual({ kind: 'bean', name: 'side-left' });
    expect(artFileKind('art/bean/headwear/bow.svg')).toEqual({ kind: 'cosmetic', cosmetic: 'headwear', id: 'bow' });
    expect(artFileKind('art/props/cart.svg')).toEqual({ kind: 'prop', id: 'cart' });
    expect(artFileKind('art/bean/forms.svg')).toEqual({ kind: 'reference' });
    expect(Object.keys(ART)).toContain('art/bean/front.svg');
  });

  it('finds nothing in the current art', () => {
    expect(messages(ART)).toEqual([]);
  });

  it("reports session 3's side belly: a full circle inset from the front edge", () => {
    const slip = edit('art/bean/side.svg', /<g id="belly">[\s\S]*?<\/g>/, '<g id="belly"><ellipse cx="22" cy="-24" rx="18" ry="18" fill="#F2B48C"/></g>');
    expect(messages(slip)).toEqual([expect.stringMatching(/^art\/bean\/side\.svg \| side: "belly" stops [\d.]+ units short of the body's front edge/)]);
  });

  it("reports session 3's back ¾ sides: front ¾'s near and far layout copied", () => {
    let slip = edit('art/bean/back-34.svg', '<g id="foot-near" data-pivot="16 0"><ellipse cx="16"', '<g id="foot-near" data-pivot="-16 0"><ellipse cx="-16"');
    slip = { ...slip, 'art/bean/back-34.svg': (slip['art/bean/back-34.svg'] as string).replace('<g id="foot-far" data-pivot="-14 0"><ellipse cx="-14"', '<g id="foot-far" data-pivot="14 0"><ellipse cx="14"') };
    slip = { ...slip, 'art/bean/back-34.svg': (slip['art/bean/back-34.svg'] as string).replace('data-pivot="-42 -50"><path d="M-42 -50 q-16 8 -12 26"', 'data-pivot="42 -50"><path d="M42 -50 q16 8 12 26"') };
    slip = { ...slip, 'art/bean/back-34.svg': (slip['art/bean/back-34.svg'] as string).replace('data-pivot="44 -50"><path d="M44 -50 q18 8 14 26"', 'data-pivot="-44 -50"><path d="M-44 -50 q-18 8 -14 26"') };
    const found = messages(slip);
    expect(found).toHaveLength(4);
    for (const id of ['arm-near', 'foot-near', 'arm-far', 'foot-far']) expect(found.join('\n')).toMatch(new RegExp(`art/bean/back-34\\.svg \\| back-34: "${id}" is on screen`));
  });

  it('reports a body-hugging part or an anchor outside the body outline', () => {
    expect(messages(edit('art/bean/front.svg', /<g id="mouth">[\s\S]*?<\/g>/, '<g id="mouth"><circle cx="70" cy="-60" r="3"/></g>'))).toEqual([
      expect.stringMatching(/^art\/bean\/front\.svg \| front: "mouth" reaches [\d.]+ units outside the body outline/),
    ]);
    expect(messages(edit('art/bean/side.svg', 'id="anchor-lean" cx="0"', 'id="anchor-lean" cx="-60"'))).toEqual([
      expect.stringMatching(/^art\/bean\/side\.svg \| side: anchor "lean" is [\d.]+ units outside the body outline/),
    ]);
  });

  it('reports the near arm behind the body, a shine on the wrong side, and the scarf tail on the wrong side', () => {
    const side = ART['art/bean/side.svg'] as string;
    const arm = /<g id="arm-near"[\s\S]*?<\/g>/.exec(side)?.[0] as string;
    const behind = { ...ART, 'art/bean/side.svg': side.replace(arm, '').replace('<g id="body">', `${arm}<g id="body">`) };
    expect(messages(behind)).toContain('art/bean/side.svg | side: "arm-near" is drawn behind the body; the near arm goes after it');
    expect(messages(edit('art/bean/front.svg', /(<g id="eyes"[^>]*>[\s\S]*?<circle cx=")(-?[\d.]+)/, '$1-17'))).toEqual([expect.stringMatching(/front: eye highlight 1 is left of its pupil/)]);
    const tail = messages(edit('art/bean/front.svg', '<g id="scarf-tail" data-pivot="20 -42"><path d="M20 -42 L26 -20 L36 -22 L30 -44 Z"', '<g id="scarf-tail" data-pivot="-20 -42"><path d="M-20 -42 L-26 -20 L-36 -22 L-30 -44 Z"'));
    expect(tail).toEqual(["art/bean/front.svg | front: the scarf tail's knot is on screen left (x -20); on the bean's left it is screen right"]);
  });

  it('reports contract problems against the file they are in', () => {
    expect(messages(edit('art/bean/headwear/sprout.svg', 'id="back"', 'id="rear"'))).toContain('art/bean/headwear/sprout.svg | headwear sprout: missing the "back" group');
    expect(messages(edit('art/props/cart.svg', 'anchor-floor', 'anchor-flor'))).toContain('art/props/cart.svg | cart: missing anchor "floor"');
    expect(messages(edit('art/bean/back.svg', 'id="body"', 'id="bod"'))).toContain('art/bean/back.svg | back: missing part "body"');
  });
});
