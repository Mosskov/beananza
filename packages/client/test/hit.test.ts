import { describe, expect, it } from 'vitest';
import { hitsBeanBody } from '../src/rig/hit';

describe('hitsBeanBody (a tap on your own bean)', () => {
  // Feet at (200, 400), scale 0.5, the body reaches 50 units west and 40 east (x 175 to 220), 100 units
  // tall: so 50 px tall, the rectangle up to y = 375 and the dome from there to y = 350.
  const feet = { x: 200, y: 400 };
  const hit = (x: number, y: number) => hitsBeanBody({ x, y }, feet, 0.5, { west: 50, east: 40 }, -100);

  it('hits the middle of the body and the ends of the feet line', () => {
    expect(hit(200, 380)).toBe(true);
    expect(hit(176, 399)).toBe(true);
    expect(hit(219, 399)).toBe(true);
  });

  it('measures west and east as distances from the feet (a body that straddles them)', () => {
    // The mistake this guards against: west treated as a signed offset collapsed the box to a strip on the east.
    expect(hit(180, 390)).toBe(true);
    expect(hit(210, 390)).toBe(true);
    expect(hit(170, 390)).toBe(false);
    expect(hit(225, 390)).toBe(false);
  });

  it('misses below the feet and above the top', () => {
    expect(hit(200, 401)).toBe(false);
    expect(hit(200, 349)).toBe(false);
  });

  it('the dome is an ellipse: the empty corners beside the top are not on the bean', () => {
    expect(hit(200, 352)).toBe(true);
    expect(hit(178, 355)).toBe(false);
    expect(hit(217, 355)).toBe(false);
  });

  it('an empty drawing is never hit', () => {
    expect(hitsBeanBody({ x: 200, y: 399 }, feet, 0.5, { west: 50, east: 40 }, 0)).toBe(false);
  });
});
