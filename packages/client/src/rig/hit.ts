/**
 * Whether a point is on the bean's drawn body, for a tap on your own bean (D26). Pure: the point
 * and the feet are in world pixels, `reach` is how far the body extends west and east of the feet
 * in art units (`BeanRig.bodySpan`, both positive for a body that straddles the feet), and `top`
 * is the highest point of the drawing in art units above the feet, as a negative y
 * (`BeanRig.drawnTop`). Art units are pixels at `scale`.
 *
 * The bean is bullet-shaped, so the lower half is a rectangle and the upper half a half ellipse:
 * a tap in the empty corners beside the dome is not on the bean.
 */
export function hitsBeanBody(
  point: { x: number; y: number },
  feet: { x: number; y: number },
  scale: number,
  reach: { west: number; east: number },
  top: number,
): boolean {
  const height = -top * scale;
  if (height <= 0) return false;
  const dy = feet.y - point.y; // Pixels above the feet.
  if (dy < 0 || dy > height) return false;
  const west = feet.x - reach.west * scale;
  const east = feet.x + reach.east * scale;
  if (point.x < west || point.x > east) return false;
  const half = height / 2;
  if (dy <= half) return true;
  // The dome: an ellipse as wide as the body and as tall as the upper half.
  const u = (point.x - (west + east) / 2) / ((east - west) / 2);
  const v = (dy - half) / half;
  return u * u + v * v <= 1;
}
