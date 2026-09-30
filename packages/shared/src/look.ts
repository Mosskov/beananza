/**
 * A bean's look (D25): colour, pattern, headwear and face. Cosmetic data only: it never enters
 * the sim (every look shares one collider and identical physics; the boundary test forbids the
 * sim from using anything in this file). It lives in `shared` so the M2 server can pass looks
 * between players.
 */

/** A bean colour: body, arm, foot and belly shades (`art/README.md`, the palette table). */
export interface BeanColour {
  body: string;
  arm: string;
  foot: string;
  belly: string;
  /** Very light colours get a soft darker outline on the body (`art/README.md`). */
  light?: boolean;
}

/** The 10 bean colours. The art is drawn in orange; the game swaps these in. */
export const BEAN_COLOURS = {
  orange: { body: '#E08A5B', arm: '#C96F42', foot: '#B8622F', belly: '#F2B48C' },
  blue: { body: '#5B8FB9', arm: '#4A7CA5', foot: '#3F6B8F', belly: '#9FC3DD' },
  green: { body: '#7BAE6A', arm: '#6A9C5A', foot: '#5A8A4B', belly: '#B5D6A3' },
  pink: { body: '#C7849E', arm: '#B06F8A', foot: '#9C5F78', belly: '#E2B3C4' },
  yellow: { body: '#E3B04B', arm: '#C9973A', foot: '#B0822E', belly: '#F2D38E' },
  violet: { body: '#8C7BC0', arm: '#7867AB', foot: '#665797', belly: '#BDB2DE' },
  teal: { body: '#5FA3A0', arm: '#4E8D8A', foot: '#427A77', belly: '#A7D1CF' },
  coral: { body: '#E07A55', arm: '#C96247', foot: '#B0543B', belly: '#F2B09A' },
  cream: { body: '#EFE3CB', arm: '#D9C8A4', foot: '#C2AF8A', belly: '#FFF8EC', light: true },
  slate: { body: '#6F7F96', arm: '#5C6B80', foot: '#4C596B', belly: '#A9B5C6' },
} as const satisfies Record<string, BeanColour>;

export type ColourId = keyof typeof BEAN_COLOURS;
export const COLOUR_IDS = Object.keys(BEAN_COLOURS) as ColourId[];

/** Patterns (DESIGN.md §6); M1 has plain and spots. */
export const PATTERN_IDS = ['plain', 'spots'] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

/** Headwear, the biggest silhouette change; M1 has three pieces. */
export const HEADWEAR_IDS = ['none', 'sprout', 'bear-ears', 'bow'] as const;
export type HeadwearId = (typeof HEADWEAR_IDS)[number];

/** Faces; M1 has the default round face and glasses. */
export const FACE_IDS = ['round', 'glasses'] as const;
export type FaceId = (typeof FACE_IDS)[number];

export interface BeanLook {
  colour: ColourId;
  pattern: PatternId;
  headwear: HeadwearId;
  face: FaceId;
}

export const DEFAULT_LOOK: Readonly<BeanLook> = { colour: 'orange', pattern: 'plain', headwear: 'none', face: 'round' };

/** `?look=blue,spots,bow,glasses`: any of the four, in any order; the rest stay default. */
export const URL_PARAM_LOOK = 'look';

/** Parse a look from its comma-separated ids. Unknown ids are returned, not guessed at. */
export function parseLook(text: string | null): { look: BeanLook; unknown: string[] } {
  const look: BeanLook = { ...DEFAULT_LOOK };
  const unknown: string[] = [];
  for (const raw of (text ?? '').split(',')) {
    const id = raw.trim().toLowerCase();
    if (!id) continue;
    if (Object.hasOwn(BEAN_COLOURS, id)) look.colour = id as ColourId;
    else if ((PATTERN_IDS as readonly string[]).includes(id)) look.pattern = id as PatternId;
    else if ((HEADWEAR_IDS as readonly string[]).includes(id)) look.headwear = id as HeadwearId;
    else if ((FACE_IDS as readonly string[]).includes(id)) look.face = id as FaceId;
    else unknown.push(raw.trim());
  }
  return { look, unknown };
}

/** The look as its URL value, e.g. `blue,spots,bow,glasses`. */
export function lookToString(look: BeanLook): string {
  return [look.colour, look.pattern, look.headwear, look.face].join(',');
}

/** Every combination of colour, pattern, headwear and face (10 × 2 × 4 × 2 = 160). */
export function allLooks(): BeanLook[] {
  const out: BeanLook[] = [];
  for (const colour of COLOUR_IDS)
    for (const pattern of PATTERN_IDS)
      for (const headwear of HEADWEAR_IDS) for (const face of FACE_IDS) out.push({ colour, pattern, headwear, face });
  return out;
}
