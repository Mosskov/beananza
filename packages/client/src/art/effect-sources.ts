// Effects are drawn once, as SVG files in art/effects/ (D26), and loaded by part id like the
// props. Vite inlines the text at build time.
import dozeZ from '../../../../art/effects/doze-z.svg?raw';

export const EFFECT_SVGS: Readonly<Record<string, string>> = { 'doze-z': dozeZ };
