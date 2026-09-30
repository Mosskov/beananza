// Effects are drawn once, as SVG files in art/effects/ (D26), and loaded by part id like the
// props. Vite inlines the text at build time.
import dozeZ from '../../../../art/effects/doze-z.svg?raw';
import eurekaBulb from '../../../../art/effects/eureka-bulb.svg?raw';
import sweatDrop from '../../../../art/effects/sweat-drop.svg?raw';

export const EFFECT_SVGS: Readonly<Record<string, string>> = { 'doze-z': dozeZ, 'eureka-bulb': eurekaBulb, 'sweat-drop': sweatDrop };
