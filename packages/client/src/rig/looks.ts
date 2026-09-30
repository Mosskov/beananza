// Customization basics (D25): colour swaps, the spots pattern, three headwear pieces and the
// glasses, composed onto the drawn views at load time (docs/ART_PIPELINE.md §4). Cosmetics are
// drawing only: nothing here reaches the sim.
// The drawings themselves are in looks-sources.ts, so this stays pure (the art tools run it in Node).
import type { BeanLook } from '@beananza/shared';
import { variantName, type BeanArtSpec, type RigPart } from './bean-contract';
import { usesKeyColours } from './colours';
import { ArtContractError, parseSvgParts, type SvgDoc, type SvgPart } from './svg-parts';
import { MIRRORED_VIEWS, VIEWS, type BeanView } from './views';

export type CosmeticKind = 'pattern' | 'headwear' | 'face';

/** Cosmetic drawings as SVG text, by kind and id (`art/bean/patterns/`, `headwear/`, `faces/`). */
export type CosmeticSources = Readonly<Record<CosmeticKind, Readonly<Record<string, string>>>>;

/** The folder under art/bean/ each kind's drawings live in. */
export const COSMETIC_FOLDERS: Readonly<Record<CosmeticKind, string>> = { pattern: 'patterns', headwear: 'headwear', face: 'faces' };

/** Views each kind must draw: every view, except faces, which only show where the eyes are. */
export const COSMETIC_VIEWS: Readonly<Record<CosmeticKind, readonly BeanView[]>> = {
  pattern: VIEWS,
  headwear: VIEWS,
  face: ['front', 'front-34', 'side'],
};

/** One cosmetic drawing, checked: its group for every view it needs (and `-left` groups). */
export interface CosmeticArt {
  kind: CosmeticKind;
  id: string;
  /** Group per view name (`front`, …, and `<view>-left` for asymmetric pieces). */
  groups: Record<string, SvgPart>;
  /** It has `-left` groups for the mirrored views (never mirrored, so it never jumps sides). */
  asymmetric: boolean;
}

export type CosmeticsSpec = Record<CosmeticKind, Record<string, CosmeticArt>>;

/** Parse and check the cosmetic art (flat groups per view); throws with every problem found. */
export function buildCosmeticsSpec(sources: CosmeticSources): CosmeticsSpec {
  const problems: string[] = [];
  const spec: CosmeticsSpec = { pattern: {}, headwear: {}, face: {} };
  for (const kind of Object.keys(sources) as CosmeticKind[]) {
    for (const [id, text] of Object.entries(sources[kind])) {
      const name = `${kind} ${id}`;
      let doc: SvgDoc;
      try {
        doc = parseSvgParts(text);
      } catch (e) {
        problems.push(`${name}: ${(e as Error).message}`);
        continue;
      }
      const groups = Object.fromEntries(doc.parts.map((p) => [p.id, p]));
      const asymmetric = MIRRORED_VIEWS.some((v) => groups[variantName(v)]);
      for (const v of COSMETIC_VIEWS[kind]) if (!groups[v]) problems.push(`${name}: missing the "${v}" group`);
      if (asymmetric) {
        for (const v of MIRRORED_VIEWS) {
          if (COSMETIC_VIEWS[kind].includes(v) && !groups[variantName(v)]) problems.push(`${name}: not symmetric, so it needs a "${variantName(v)}" group`);
        }
      }
      const known = new Set([...COSMETIC_VIEWS[kind], ...MIRRORED_VIEWS.map(variantName)]);
      for (const p of doc.parts) {
        if (!known.has(p.id)) problems.push(`${name}: unknown group "${p.id}" (groups are named after views)`);
        const layer = p.attrs['data-layer'];
        if (layer !== undefined && layer !== 'behind') problems.push(`${name}: ${p.id} has data-layer="${layer}" (only "behind")`);
        if (layer !== undefined && kind !== 'headwear') problems.push(`${name}: only headwear can go behind the body`);
      }
      if (Object.keys(doc.anchors).length) problems.push(`${name}: anchors belong in the bean's view files`);
      spec[kind][id] = { kind, id, groups, asymmetric };
    }
  }
  if (problems.length) throw new ArtContractError('Cosmetic art', problems);
  return spec;
}

/** Part ids cosmetics add to the rig. */
export const COSMETIC_PART: Readonly<Record<CosmeticKind, string>> = { pattern: 'pattern', headwear: 'headwear', face: 'face' };

/** Source name of a cosmetic's drawing for one view (its texture's file name). */
export const cosmeticSource = (kind: CosmeticKind, id: string, group: string) => `${kind}:${id}:${group}`;

/**
 * Every cosmetic drawing as a standalone doc in its view's frame, ready to rasterize: patterns
 * clipped to that view's body, headwear moved to its headwear anchor (mirrored for `-left`
 * groups, which are drawn as seen on screen), faces as drawn.
 */
export function cosmeticDocs(bean: BeanArtSpec, cosmetics: CosmeticsSpec): Record<string, SvgDoc> {
  const docs: Record<string, SvgDoc> = {};
  for (const art of Object.values(cosmetics).flatMap((byId) => Object.values(byId))) {
    for (const [group, part] of Object.entries(art.groups)) {
      const left = group.endsWith('-left');
      const view = (left ? group.slice(0, -'-left'.length) : group) as BeanView;
      const base = bean.docs[view];
      if (!base) continue;
      let inner = part.inner;
      if (art.kind === 'pattern') {
        const body = base.parts.find((p) => p.id === 'body');
        const clip = `clip-${art.id}-${group}`;
        inner = `<defs><clipPath id="${clip}">${body?.inner ?? ''}</clipPath></defs><g clip-path="url(#${clip})">${inner}</g>`;
      } else if (art.kind === 'headwear') {
        const anchor = bean.anchors[view].headwear ?? { x: 0, y: 0 };
        inner = `<g transform="translate(${left ? -anchor.x : anchor.x} ${anchor.y})">${inner}</g>`;
      }
      const id = COSMETIC_PART[art.kind];
      docs[cosmeticSource(art.kind, art.id, group)] = { viewBox: base.viewBox, parts: [{ id, attrs: part.attrs, inner }], anchors: {} };
    }
  }
  return docs;
}

/** A rig part as the rig draws it, with where its texture comes from. */
export type LookPart = RigPart & { source: string };

/**
 * The parts of one view combination for a look, in draw order: the drawn view's parts, plus the
 * pattern right after the body, the face right after the eyes, and headwear after the goggles
 * (or before the body when it sits behind it). Asymmetric pieces use their `-left` drawing in a
 * mirrored view, drawn as seen on screen (never mirrored).
 */
export function lookParts(base: readonly LookPart[], cosmetics: CosmeticsSpec, look: BeanLook, view: BeanView, mirrored: boolean): LookPart[] {
  const parts = base.slice();
  const insert = (part: LookPart, where: { after?: string; before?: string }) => {
    const at = where.before !== undefined ? parts.findIndex((p) => p.id === where.before) : parts.findIndex((p) => p.id === where.after) + 1;
    parts.splice(at < 0 ? parts.length : at, 0, part);
  };
  const add = (kind: CosmeticKind, id: string, where: (group: SvgPart) => { after?: string; before?: string }) => {
    const art = cosmetics[kind][id];
    if (!art) return;
    const screenSpace = mirrored && art.asymmetric;
    const groupName = screenSpace ? variantName(view) : view;
    const group = art.groups[groupName];
    if (!group) return; // e.g. no face drawn from behind
    insert(
      { id: COSMETIC_PART[kind], source: cosmeticSource(kind, id, groupName), pivot: { x: 0, y: 0 }, hiddenByDefault: false, screenSpace, keyed: usesKeyColours(group.inner) },
      where(group),
    );
  };
  if (look.pattern !== 'plain') add('pattern', look.pattern, () => ({ after: 'body' }));
  if (look.face !== 'round') add('face', look.face, () => ({ after: 'eyes' }));
  if (look.headwear !== 'none') {
    add('headwear', look.headwear, (g) => (g.attrs['data-layer'] === 'behind' ? { before: 'body' } : { after: parts.some((p) => p.id === 'headwear-goggles') ? 'headwear-goggles' : 'body' }));
  }
  return parts;
}
