// The cosmetic drawings (D25), loaded as they are from art/bean/patterns/, headwear/ and faces/.
// Vite inlines the text at build time.
import glasses from '../../../../art/bean/faces/glasses.svg?raw';
import bearEars from '../../../../art/bean/headwear/bear-ears.svg?raw';
import bow from '../../../../art/bean/headwear/bow.svg?raw';
import sprout from '../../../../art/bean/headwear/sprout.svg?raw';
import spots from '../../../../art/bean/patterns/spots.svg?raw';
import type { CosmeticSources } from './looks';

/** The cosmetic drawings, by kind and id. */
export const COSMETIC_SVGS: CosmeticSources = {
  pattern: { spots },
  headwear: { sprout, 'bear-ears': bearEars, bow },
  face: { glasses },
};
