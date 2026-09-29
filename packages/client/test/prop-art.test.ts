import { describe, expect, it } from 'vitest';
import { CART_FLOOR_M, DEFAULT_PLAZA } from '@beananza/sim';
import { CART_WHEEL_RADIUS_M, PROP_SVGS, buildPropArtSpec, propKey } from '../src/art/props';
import { RAIL_GAUGE_M } from '../src/scenes/hub-view';

describe('prop art contract (art/props/*.svg)', () => {
  const spec = buildPropArtSpec(PROP_SVGS);

  it('has the tree, the cart and the bench with their parts', () => {
    expect(spec.docs.tree?.parts.map((p) => p.id)).toEqual(['shadow', 'trunk', 'canopy']);
    expect(spec.docs.cart?.parts.map((p) => p.id)).toEqual(['shadow', 'back', 'rocks', 'front', 'wheel-west', 'wheel-east']);
  });

  it('rolls the wheels about their hubs, and the wheel radius matches the drawing', () => {
    expect(spec.pivots.get(propKey('cart', 'wheel-west'))).toEqual({ x: -24, y: -9 });
    expect(spec.pivots.get(propKey('cart', 'wheel-east'))).toEqual({ x: 24, y: -9 });
    const wheel = spec.docs.cart?.parts.find((p) => p.id === 'wheel-west');
    expect(Number(/<circle[^>]*\br="([\d.]+)"/.exec(wheel?.inner ?? '')?.[1]) / 100).toBe(CART_WHEEL_RADIUS_M);
  });

  it('draws the cart to the sim size: 0.8 m long at the rim', () => {
    const front = spec.docs.cart?.parts.find((p) => p.id === 'front');
    expect(front?.inner).toContain('M-40 -48 L40 -48');
  });

  it('marks the cart floor where the sim puts a rider: the rail centre line, CART_FLOOR_M up', () => {
    // The cart's origin is on the near rail, half a gauge south of the rail's centre line.
    expect(spec.docs.cart?.anchors.floor).toEqual({ x: 0, y: -(RAIL_GAUGE_M / 2 + CART_FLOOR_M) * 100 });
  });

  it('marks the corners of the cart front (the rider shows only inside them below the rim)', () => {
    const a = spec.docs.cart!.anchors;
    expect([a['rim-west'], a['rim-east'], a['base-east'], a['base-west']]).toEqual([
      { x: -40, y: -48 },
      { x: 40, y: -48 },
      { x: 34, y: -6 },
      { x: -34, y: -6 },
    ]);
    expect(spec.docs.cart?.parts.find((p) => p.id === 'front')?.inner).toContain('M-40 -48 L40 -48 L34 -6 L-34 -6 Z');
  });

  it('draws the bench with its seat anchors where the sim seats a bean', () => {
    expect(spec.docs.bench?.parts.map((p) => p.id)).toEqual(['shadow', 'back', 'seat']);
    const bench = DEFAULT_PLAZA.benches[0]!;
    for (const seat of bench.seats) {
      expect(spec.docs.bench?.anchors[`seat-${seat.id}`], seat.id).toEqual({ x: seat.dx * 100, y: -(bench.seatDy + bench.seatHeight) * 100 });
    }
  });

  it('rejects a cart without its floor anchor', () => {
    expect(() => buildPropArtSpec({ ...PROP_SVGS, cart: (PROP_SVGS.cart as string).replace('anchor-floor', 'anchor-flor') })).toThrow(/cart: missing anchor "floor"/);
  });

  it('rejects a prop that is missing a part', () => {
    expect(() => buildPropArtSpec({ ...PROP_SVGS, tree: (PROP_SVGS.tree as string).replace('id="canopy"', 'id="leaves"') })).toThrow(
      /tree: missing part "canopy"/,
    );
  });
});
