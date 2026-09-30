// Effects are drawn once, as SVG files in art/effects/ (D26), and loaded by part id like the
// props. Vite inlines the text at build time.
import dizzyStars from '../../../../art/effects/dizzy-stars.svg?raw';
import dozeZ from '../../../../art/effects/doze-z.svg?raw';
import eurekaBulb from '../../../../art/effects/eureka-bulb.svg?raw';
import sweatDrop from '../../../../art/effects/sweat-drop.svg?raw';

export const EFFECT_SVGS: Readonly<Record<string, string>> = { 'dizzy-stars': dizzyStars, 'doze-z': dozeZ, 'eureka-bulb': eurekaBulb, 'sweat-drop': sweatDrop };
