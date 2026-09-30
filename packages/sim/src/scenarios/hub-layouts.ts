import { DEFAULT_PLAZA, ISLAND, type PlazaLayout } from './hub-world';

/**
 * Named hub layouts, opened with `?scene=hub&layout=<name>`. `plaza` is the real hub. The others
 * are test yards: the plaza's ground with one thing on it, so a prop or an interaction can be
 * built, scripted and shot on its own without touching the plaza or its evidence. Putting a
 * finished thing into the plaza is its own step (D2, the hub layout, is still Open).
 */

/** The plaza's ground (same walkable area, start and camera) with only `content` on it. */
export function yard(content: Partial<Pick<PlazaLayout, 'props' | 'benches' | 'portals' | 'rail' | 'start'>>): PlazaLayout {
  return {
    walkable: { points: DEFAULT_PLAZA.walkable.points.map((p) => ({ ...p })) },
    props: content.props ?? [],
    benches: content.benches ?? [],
    portals: content.portals ?? [],
    start: content.start ?? { ...DEFAULT_PLAZA.start },
    rail: content.rail ?? null,
  };
}

/** The hub opens on the sky island (D2); `plaza` is the M1 plaza, kept for its scripts and evidence. */
export const DEFAULT_LAYOUT = 'island';

/** Every layout by name. A new yard is one line here (or its own file, imported here). */
export const HUB_LAYOUTS: Readonly<Record<string, PlazaLayout>> = {
  plaza: DEFAULT_PLAZA,
  /** The sky island (D2): the hexagon hub with the rail, the bench and trees. */
  island: ISLAND,
  /** The island's ground and sky with nothing on it: its edges, cliffs and camera on their own. */
  'bare-island': { ...ISLAND, props: [], benches: [], portals: [], rail: null },
  /** The bench with Priya (D24), nothing else. */
  bench: yard({ benches: DEFAULT_PLAZA.benches }),
  /** The rail and both carts (D19, D23), nothing else. */
  carts: yard({ rail: DEFAULT_PLAZA.rail }),
  /** Two region portals (D2): an open one (Mechanics Valley) and the locked one (Crystal Caves). */
  portals: yard({
    portals: [
      { ...ISLAND.portals.find((p) => p.region === 'mechanics')!, x: 1.6, y: 0.9 },
      { ...ISLAND.portals.find((p) => p.region === 'crystal')!, x: -2.4, y: 0.9 },
    ],
  }),
};

export const HUB_LAYOUT_NAMES: readonly string[] = Object.keys(HUB_LAYOUTS);
