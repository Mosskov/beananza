import { describe, expect, it } from 'vitest';
import { CART_WHEEL_RADIUS_M, PROP_SVGS, buildPropArtSpec, propKey } from '../src/art/props';

describe('prop art contract (art/props/*.svg)', () => {
  const spec = buildPropArtSpec(PROP_SVGS);

  it('has the tree and the cart with their parts', () => {
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

  it('rejects a prop that is missing a part', () => {
    expect(() => buildPropArtSpec({ ...PROP_SVGS, tree: (PROP_SVGS.tree as string).replace('id="canopy"', 'id="leaves"') })).toThrow(
      /tree: missing part "canopy"/,
    );
  });
});
