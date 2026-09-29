/**
 * The one conversion between sim units (metres) and render units (pixels).
 * 100 px per metre matches the prototypes, whose tuned numbers assume "100 px is about 1 m".
 * Scenes that need more world on screen zoom the camera; they never change this constant.
 */
export const PIXELS_PER_METER = 100;

export function metersToPixels(meters: number): number {
  return meters * PIXELS_PER_METER;
}
