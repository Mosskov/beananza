// Bean colours (D25): the bean art is drawn in orange key colours, and every other palette colour
// is a swap of those strings before the parts are rasterized (docs/ART_PIPELINE.md §4).
import { BEAN_COLOURS, type BeanColour, type ColourId } from '@beananza/shared';

/**
 * The key colours the bean art is drawn in (orange), and what each becomes: body, arm, foot and
 * belly from the palette table, plus the side and ¾ views' darker far foot and far arm, which the
 * table does not list: they keep orange's per-channel ratio to the foot and the arm.
 */
export const KEY = { body: '#E08A5B', arm: '#C96F42', foot: '#B8622F', belly: '#F2B48C', farFoot: '#A3572A', farArm: '#B5633A' } as const;

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
/** `base` darkened by the per-channel ratio of `from` to `to`. */
const shade = (base: string, from: string, to: string) => {
  const [f, t, b] = [channels(from), channels(to), channels(base)];
  return toHex(b.map((c, i) => (c * (t[i] as number)) / (f[i] as number)));
};

/** The six colours a bean's art uses, for a palette colour. */
export function colourSet(colour: BeanColour): Record<keyof typeof KEY, string> {
  return {
    body: colour.body,
    arm: colour.arm,
    foot: colour.foot,
    belly: colour.belly,
    farFoot: shade(colour.foot, KEY.foot, KEY.farFoot),
    farArm: shade(colour.arm, KEY.arm, KEY.farArm),
  };
}

const KEY_PATTERN = new RegExp(Object.values(KEY).join('|'), 'gi');

/** Whether a part's drawing uses any key colour (so it is drawn once per bean colour). */
export function usesKeyColours(inner: string): boolean {
  return new RegExp(KEY_PATTERN.source, 'i').test(inner);
}

/**
 * A part's markup in another bean colour: every key colour swapped before rasterizing. A very
 * light colour (cream) also gets a soft darker outline on the body (`art/README.md`).
 */
export function recolour(inner: string, colourId: ColourId, partId = ''): string {
  const colour: BeanColour = BEAN_COLOURS[colourId];
  const set = colourSet(colour);
  const byKey = new Map(Object.entries(KEY).map(([name, hex]) => [hex.toUpperCase(), set[name as keyof typeof KEY]]));
  let out = inner.replace(KEY_PATTERN, (hex) => byKey.get(hex.toUpperCase()) ?? hex);
  if (colour.light && partId === 'body') out = out.replace(/\/>/, ` stroke="${set.foot}" stroke-width="2.5"/>`);
  return out;
}
