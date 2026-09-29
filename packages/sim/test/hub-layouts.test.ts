import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, DEFAULT_PLAZA, HUB_BEAN_RADIUS_M, HUB_LAYOUTS, HUB_LAYOUT_NAMES, Sim, createHubScenario } from '../src';

describe('hub layouts', () => {
  it('opens the plaza by default', () => {
    expect(DEFAULT_LAYOUT).toBe('plaza');
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
});
