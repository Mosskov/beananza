import { describe, expect, it } from 'vitest';
import { screenAngleDeg, viewForFacing, type ViewChoice } from '../src/rig/views';

/** A sim facing (x east, y north) pointing at a screen angle (degrees, y down). */
function facingAt(deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), -Math.sin(r)];
}
const at = (deg: number): ViewChoice => viewForFacing(...facingAt(deg));
const v = (view: ViewChoice['view'], mirrored = false): ViewChoice => ({ view, mirrored });

describe('facing to view (DESIGN.md §6)', () => {
  it('uses screen angles with north up: east 0°, south +90°, north −90°', () => {
    expect(screenAngleDeg(1, 0)).toBeCloseTo(0, 12);
    expect(screenAngleDeg(0, -1)).toBeCloseTo(90, 12);
    expect(screenAngleDeg(0, 1)).toBeCloseTo(-90, 12);
    expect(Math.abs(screenAngleDeg(-1, 0))).toBeCloseTo(180, 12);
  });

  it('maps the 8 sim compass directions', () => {
    const d = Math.SQRT1_2;
    expect(viewForFacing(1, 0)).toEqual(v('side'));
    expect(viewForFacing(d, -d)).toEqual(v('front-34'));
    expect(viewForFacing(0, -1)).toEqual(v('front'));
    expect(viewForFacing(-d, -d)).toEqual(v('front-34', true));
    expect(viewForFacing(-1, 0)).toEqual(v('side', true));
    expect(viewForFacing(-d, d)).toEqual(v('back-34', true));
    expect(viewForFacing(0, 1)).toEqual(v('back'));
    expect(viewForFacing(d, d)).toEqual(v('back-34'));
  });

  it('does not need a unit facing', () => {
    expect(viewForFacing(3, 0)).toEqual(v('side'));
    expect(viewForFacing(0, -0.2)).toEqual(v('front'));
  });

  // Each row of the table: inside the range, and both of its edges.
  it.each([
    ['−22.5 to 22.5: side', [-22.4, 0, 22.4], v('side')],
    ['22.5 to 67.5: front ¾', [22.5, 45, 67.4], v('front-34')],
    ['67.5 to 112.5: front', [67.5, 90, 112.5], v('front')],
    ['112.5 to 157.5: front ¾ mirrored', [112.6, 135, 157.5], v('front-34', true)],
    ['beyond ±157.5: side mirrored', [157.6, 180, -180, -157.6], v('side', true)],
    ['−157.5 to −112.5: back ¾ mirrored', [-157.5, -135, -112.6], v('back-34', true)],
    ['−112.5 to −67.5: back', [-112.5, -90, -67.5], v('back')],
    ['−67.5 to −22.5: back ¾', [-67.4, -45, -22.5], v('back-34')],
  ] as const)('%s', (_name, angles, expected) => {
    for (const a of angles) expect(at(a), `${a}°`).toEqual(expected);
  });

  it('puts exact boundaries in the range further from the east-west axis', () => {
    expect(at(22.5)).toEqual(v('front-34'));
    expect(at(-22.5)).toEqual(v('back-34'));
    expect(at(67.5)).toEqual(v('front'));
    expect(at(112.5)).toEqual(v('front'));
    expect(at(157.5)).toEqual(v('front-34', true));
    expect(at(-157.5)).toEqual(v('back-34', true));
    expect(at(-67.5)).toEqual(v('back'));
    expect(at(-112.5)).toEqual(v('back'));
  });

  it('shows the front for a zero facing', () => {
    expect(viewForFacing(0, 0)).toEqual(v('front'));
  });
});
