/** True when the player asked the OS or browser for less motion (prefers-reduced-motion). */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
