// The bean's drawn views, loaded as they are from art/bean/ (D3, D13: the SVG files are the
// source; parts are found by id). Vite inlines the text at build time.
import back from '../../../../art/bean/back.svg?raw';
import back34 from '../../../../art/bean/back-34.svg?raw';
import back34Left from '../../../../art/bean/back-34-left.svg?raw';
import front from '../../../../art/bean/front.svg?raw';
import front34 from '../../../../art/bean/front-34.svg?raw';
import front34Left from '../../../../art/bean/front-34-left.svg?raw';
import side from '../../../../art/bean/side.svg?raw';
import sideLeft from '../../../../art/bean/side-left.svg?raw';

/** Keyed by view name, and `<view>-left` for the mirrored views' asymmetric parts. */
export const BEAN_SVGS: Readonly<Record<string, string>> = {
  front,
  'front-34': front34,
  side,
  'back-34': back34,
  back,
  'front-34-left': front34Left,
  'side-left': sideLeft,
  'back-34-left': back34Left,
};
