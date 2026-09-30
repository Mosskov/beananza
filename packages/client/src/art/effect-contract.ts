// The effect art contract (art/effects/*.svg, D26): pure, so the tests and the art tools
// (art:check, art:part) run the same checks as the game does at boot.
// An effect is drawn once, apart from the bean, with its origin (0, 0) at the anchor it is placed
// at (`fx-head`, `fx-brow`, `fx-ground` in the bean's view files, D22). It is loaded by part id like
// the props; clips move and scale it about that origin. Effects are drawn shapes: no text (D17).
import { usesKeyColours } from '../rig/colours';
import { ArtContractError, insideViewBox, parseSvgParts, partPivot, type Point, type SvgDoc } from '../rig/svg-parts';
import type { EffectSlot } from '../rig/views';

/**
 * The effects the game loads: the slot each is placed on and the parts each must have. A new
 * effect is registered here, in `effect-sources.ts`, and by its file in `art/effects/`.
 */
export const EFFECTS: Readonly<Record<string, { slot: EffectSlot; parts: readonly string[] }>> = {
  'dizzy-stars': { slot: 'fxHead', parts: ['dizzy-star-1', 'dizzy-star-2', 'dizzy-star-3'] },
  'doze-z': { slot: 'fxHead', parts: ['doze-z'] },
  'eureka-bulb': { slot: 'fxHead', parts: ['eureka-bulb'] },
  'sweat-drop': { slot: 'fxBrow', parts: ['sweat-drop'] },
};

export interface EffectArtSpec {
  docs: Record<string, SvgDoc>;
  /** Pivot of every part, by `effect:part` (the origin unless a part says `data-pivot`). */
  pivots: Map<string, Point>;
}

export const effectKey = (effect: string, partId: string) => `effect:${effect}:${partId}`;

/**
 * Parse and check the effect art; throws an ArtContractError with every problem found. Effects
 * in `sources` that `EFFECTS` does not list yet get the general checks (flat parts, pivots).
 */
export function buildEffectArtSpec(sources: Readonly<Record<string, string>>): EffectArtSpec {
  const problems: string[] = [];
  const docs: Record<string, SvgDoc> = {};
  const pivots = new Map<string, Point>();
  for (const effect of [...new Set([...Object.keys(EFFECTS), ...Object.keys(sources)])]) {
    const text = sources[effect];
    if (text === undefined) {
      problems.push(`${effect}: missing`);
      continue;
    }
    try {
      const doc = parseSvgParts(text);
      docs[effect] = doc;
      const ids = doc.parts.map((p) => p.id);
      for (const id of EFFECTS[effect]?.parts ?? []) if (!ids.includes(id)) problems.push(`${effect}: missing part "${id}"`);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (dupes.length) problems.push(`${effect}: duplicate part ids ${dupes.join(', ')}`);
      if (Object.keys(doc.anchors).length) problems.push(`${effect}: effects have no anchors; the origin (0, 0) is the anchor it is placed at`);
      if (!insideViewBox({ x: 0, y: 0 }, doc.viewBox)) problems.push(`${effect}: the origin (0, 0), the anchor, is outside the viewBox`);
      for (const part of doc.parts) {
        if (usesKeyColours(part.inner)) problems.push(`${effect}: part "${part.id}" uses the bean's key colours; effects use palette colours (they are not recoloured per bean)`);
        if (/<(text|image)\b/.test(part.inner)) problems.push(`${effect}: part "${part.id}" uses <text> or <image>; effects are drawn shapes (D17)`);
        try {
          pivots.set(effectKey(effect, part.id), partPivot(part));
        } catch (e) {
          problems.push(`${effect}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      problems.push(`${effect}: ${(e as Error).message}`);
    }
  }
  if (problems.length) throw new ArtContractError('Effect art', problems);
  return { docs, pivots };
}
