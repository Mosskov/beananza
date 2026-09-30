// Props that never turn are drawn once, as SVG files in art/props/ (D12), and loaded by part id
// like the bean. Vite inlines the text at build time.
import bench from '../../../../art/props/bench.svg?raw';
import cart from '../../../../art/props/cart.svg?raw';
import tree from '../../../../art/props/tree.svg?raw';

export const PROP_SVGS: Readonly<Record<string, string>> = { tree, cart, bench };
