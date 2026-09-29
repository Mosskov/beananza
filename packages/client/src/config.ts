/** Logical game resolution; the canvas scales to fit the window. */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** Colors from art/README.md. */
export const PALETTE = {
  cream: 0xf4e9d4,
  panel: 0xfff8ec,
  cardShadow: 0xe2cfae,
  ink: 0x3b2f2a,
  inkSecondary: 0x5a4a40,
  labelAccent: 0x8a4e2e,
  primary: 0xb8532f,
  gold: 0xf6c66b,
  stone: 0xe9dcc0,
  grass: 0xa9c98c,
  water: 0x86bccb,
  slate: 0x6f7f96,
} as const;

export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
