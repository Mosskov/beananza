import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  DEFAULT_PLAZA,
  HUB_BEAN_RADIUS_M,
  HUB_LAYOUTS,
  HUB_LAYOUT_NAMES,
  ISLAND,
  ISLAND_CIRCUMRADIUS_M,
  Sim,
  containsPoint,
  createHubScenario,
  insetConvex,
  type HubCommand,
  type HubState,
} from '../src';

const SLOP = 0.006;

describe('hub layouts', () => {
  it('opens the sky island by default and keeps the M1 plaza (D2)', () => {
    expect(DEFAULT_LAYOUT).toBe('island');
    expect(HUB_LAYOUTS.island).toBe(ISLAND);
    expect(HUB_LAYOUTS.plaza).toBe(DEFAULT_PLAZA);
  });

  it('builds test yards on the plaza ground with only their own things', () => {
    const bench = HUB_LAYOUTS.bench!;
    expect(bench.walkable).toEqual(DEFAULT_PLAZA.walkable);
    expect(bench.start).toEqual(DEFAULT_PLAZA.start);
    expect(bench.benches).toEqual(DEFAULT_PLAZA.benches);
    expect(bench.props).toEqual([]);
    expect(bench.rail).toBeNull();
    const carts = HUB_LAYOUTS.carts!;
    expect(carts.rail).toEqual(DEFAULT_PLAZA.rail);
    expect(carts.props).toEqual([]);
    expect(carts.benches).toEqual([]);
  });

  it.each(HUB_LAYOUT_NAMES)('%s: the bean starts clear of every footprint and walks', (name) => {
    const layout = HUB_LAYOUTS[name]!;
    for (const p of [...layout.props, ...layout.benches]) {
      const clear = Math.abs(layout.start.x - p.x) > p.halfWidth + HUB_BEAN_RADIUS_M || Math.abs(layout.start.y - p.y) > p.halfDepth + HUB_BEAN_RADIUS_M;
      expect(clear, `${name}: start inside ${p.id}`).toBe(true);
    }
    const sim = new Sim(createHubScenario({ layout }), 1);
    sim.enqueue({ type: 'move', x: 1, y: 0, run: false });
    for (let i = 0; i < 30; i++) sim.step();
    expect(sim.state.bean.x).toBeGreaterThan(layout.start.x);
  });

  it.each(HUB_LAYOUT_NAMES)('%s: every footprint and the rail lie inside the walkable area', (name) => {
    const layout = HUB_LAYOUTS[name]!;
    for (const p of [...layout.props, ...layout.benches]) {
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        expect(containsPoint(layout.walkable, { x: p.x + sx * p.halfWidth, y: p.y + sy * p.halfDepth }), `${name}: ${p.id}`).toBe(true);
      }
    }
    if (layout.rail) {
      expect(containsPoint(layout.walkable, { x: layout.rail.minX, y: layout.rail.y })).toBe(true);
      expect(containsPoint(layout.walkable, { x: layout.rail.maxX, y: layout.rail.y })).toBe(true);
    }
  });
});

describe('the sky island (D2)', () => {
  // Only the edges matter here: the island without its things (running north would enter a portal).
  const newIsland = () => new Sim<HubState, HubCommand>(createHubScenario({ layout: { ...ISLAND, props: [], benches: [], portals: [], rail: null } }), 1);
  const centreArea = insetConvex(ISLAND.walkable, HUB_BEAN_RADIUS_M);

  it('is a flat-top hexagon 24 m across', () => {
    expect(ISLAND_CIRCUMRADIUS_M).toBe(12);
    expect(ISLAND.walkable.points).toHaveLength(6);
  });

  const directions: [string, number, number][] = [
    ['east', 1, 0],
    ['west', -1, 0],
    ['north', 0, 1],
    ['south', 0, -1],
    ['north-east', 1, 1],
    ['north-west', -1, 1],
    ['south-east', 1, -1],
    ['south-west', -1, -1],
  ];

  it.each(directions)('running %s for 10 s stays inside the hexagon and ends against its edge', (_name, dx, dy) => {
    const sim = newIsland();
    sim.enqueue({ type: 'move', x: dx, y: dy, run: true });
    for (let i = 0; i < 600; i++) {
      sim.step();
      expect(containsPoint(centreArea, sim.state.bean, SLOP)).toBe(true);
    }
    // Pressed against the edge: not inside the area shrunk by a further skin.
    expect(containsPoint(insetConvex(centreArea, 0.02), sim.state.bean)).toBe(false);
  });

  it('clamps a tap far outside onto the reachable hexagon', () => {
    const sim = newIsland();
    sim.enqueue({ type: 'moveTo', x: 0, y: 100 });
    sim.step();
    const t = sim.state.bean.target!;
    expect(t.x).toBe(0);
    expect(t.y).toBeCloseTo(6 * Math.sqrt(3) - HUB_BEAN_RADIUS_M, 12);
    // The bean walks there and arrives at the north edge.
    for (let i = 0; i < 600 && sim.state.bean.target; i++) sim.step();
    expect(sim.state.bean.target).toBeNull();
    expect(sim.state.bean.y).toBeGreaterThan(t.y - 0.03);
  });
});
