// The prop art contract (art/props/*.svg): pure, so the tests and the art tools (art:check,
// art:part) run the same checks as the game does at boot.
import { ArtContractError, insideViewBox, parseSvgParts, partPivot, type Point, type SvgDoc } from '../rig/svg-parts';

/** Parts each prop must have, in the art contract (`art/README.md`). */
export const PROP_PARTS: Readonly<Record<string, readonly string[]>> = {
  tree: ['shadow', 'trunk', 'canopy'],
  cart: ['shadow', 'back', 'rocks', 'front', 'wheel-west', 'wheel-east'],
  bench: ['shadow', 'back', 'seat'],
};

/**
 * Anchors each prop must have (D22). The cart: `floor` (where a rider stands) and the corners
 * of its front (`rim-west`, `rim-east`, `base-west`, `base-east`): below the rim, a rider only
 * shows inside them. The bench: `seat-<seat id>`, where a seated bean's feet point is.
 */
export const PROP_ANCHORS: Readonly<Record<string, readonly string[]>> = {
  tree: [],
  cart: ['floor', 'rim-west', 'rim-east', 'base-west', 'base-east'],
  bench: ['seat-west', 'seat-east'],
};

export interface PropArtSpec {
  docs: Record<string, SvgDoc>;
  /** Pivot of every part, by `prop:part`. */
  pivots: Map<string, Point>;
}

export const propKey = (prop: string, partId: string) => `prop:${prop}:${partId}`;

/** The cart's wheel radius as drawn (9 units): the wheels roll x / r without slipping. */
export const CART_WHEEL_RADIUS_M = 0.09;

/**
 * Parse and check the prop art; throws an ArtContractError with every problem found. Props
 * in `sources` that the contract does not list yet (a new drawing) get the general checks
 * (flat parts, pivots, anchors inside the viewBox).
 */
export function buildPropArtSpec(sources: Readonly<Record<string, string>>): PropArtSpec {
  const problems: string[] = [];
  const docs: Record<string, SvgDoc> = {};
  const pivots = new Map<string, Point>();
  for (const prop of [...new Set([...Object.keys(PROP_PARTS), ...Object.keys(sources)])]) {
    const text = sources[prop];
    if (text === undefined) {
      problems.push(`${prop}: missing`);
      continue;
    }
    try {
      const doc = parseSvgParts(text);
      docs[prop] = doc;
      const ids = doc.parts.map((p) => p.id);
      for (const id of Object.hasOwn(PROP_PARTS, prop) ? PROP_PARTS[prop] ?? [] : []) if (!ids.includes(id)) problems.push(`${prop}: missing part "${id}"`);
      for (const name of Object.hasOwn(PROP_ANCHORS, prop) ? PROP_ANCHORS[prop] ?? [] : []) if (!doc.anchors[name]) problems.push(`${prop}: missing anchor "${name}"`);
      for (const [name, p] of Object.entries(doc.anchors)) {
        if (!insideViewBox(p, doc.viewBox)) problems.push(`${prop}: anchor "${name}" is outside the viewBox`);
      }
      for (const part of doc.parts) {
        try {
          pivots.set(propKey(prop, part.id), partPivot(part));
        } catch (e) {
          problems.push(`${prop}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      problems.push(`${prop}: ${(e as Error).message}`);
    }
  }
  if (problems.length) throw new ArtContractError('Prop art', problems);
  return { docs, pivots };
}
