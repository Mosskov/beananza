import { usesKeyColours } from './colours';
import { insideViewBox, parseSvgParts, partPivot, type Point, type SvgDoc } from './svg-parts';
import { HIDDEN_BY_DEFAULT, MIRRORED_VIEWS, REQUIRED_ANCHORS, REQUIRED_PARTS, SHADOW_PART, VIEWS, type BeanView } from './views';

/** One drawn part, ready for the rig. Coordinates are art units in the view's frame. */
export interface RigPart {
  id: string;
  pivot: Point;
  hiddenByDefault: boolean;
  /**
   * Only for asymmetric parts in a mirrored view: the drawing is as seen on screen (not
   * mirrored), so the rig counter-flips it.
   */
  screenSpace: boolean;
  /** Drawn in key colours, so there is one texture per bean colour (`colours.ts`). */
  keyed: boolean;
}

export interface RigView {
  view: BeanView;
  mirrored: boolean;
  viewBox: [number, number, number, number];
  /** Parts in draw order, shadow excluded. Texture key: `bean:<sourceName>:<part id>`. */
  parts: (RigPart & { source: string })[];
}

export interface BeanArtSpec {
  docs: Record<string, SvgDoc>;
  /** Parts that are not symmetric (they have a `-left` drawing). */
  asymmetric: string[];
  views: RigView[];
  /** Each view's anchors (D22), in its own frame. Mirrored views mirror x. */
  anchors: Record<BeanView, Record<string, Point>>;
}

/** The highest point (smallest y) among a path's coordinate pairs: the top of the body. */
function pathTop(inner: string): number {
  const d = /\bd="([^"]*)"/.exec(inner)?.[1] ?? '';
  const nums = (d.match(/-?[\d.]+/g) ?? []).map(Number);
  let top = Infinity;
  for (let i = 1; i < nums.length; i += 2) top = Math.min(top, nums[i] as number);
  return top;
}

export const variantName = (view: BeanView) => `${view}-left`;
export const viewKey = (view: BeanView, mirrored: boolean) => (mirrored ? `${view}:mirrored` : view);

/**
 * Parse and check the bean art against the art contract, and work out the draw order for all
 * 8 view combinations. Throws with every problem found, so bad art fails loudly at boot and in
 * the tests instead of drawing wrong.
 */
export function buildBeanArtSpec(sources: Readonly<Record<string, string>>): BeanArtSpec {
  const problems: string[] = [];
  const docs: Record<string, SvgDoc> = {};
  for (const [name, text] of Object.entries(sources)) {
    try {
      docs[name] = parseSvgParts(text);
    } catch (e) {
      problems.push(`${name}: ${(e as Error).message}`);
    }
  }
  for (const view of VIEWS) {
    const doc = docs[view];
    if (!doc) {
      problems.push(`${view}: missing`);
      continue;
    }
    const ids = doc.parts.map((p) => p.id);
    for (const id of REQUIRED_PARTS[view]) if (!ids.includes(id)) problems.push(`${view}: missing part "${id}"`);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) problems.push(`${view}: duplicate part ids ${dupes.join(', ')}`);
    for (const name of REQUIRED_ANCHORS[view]) if (!doc.anchors[name]) problems.push(`${view}: missing anchor "${name}"`);
    for (const [name, p] of Object.entries(doc.anchors)) {
      if (!insideViewBox(p, doc.viewBox)) problems.push(`${view}: anchor "${name}" is outside the viewBox`);
    }
    // Headwear sits on the top of the body (within 1 unit).
    const body = doc.parts.find((p) => p.id === 'body');
    const hw = doc.anchors.headwear;
    if (body && hw && Math.abs(hw.y - pathTop(body.inner)) > 1) problems.push(`${view}: anchor "headwear" is not on the top of the body`);
  }

  // A part is asymmetric if any -left drawing has it. It then needs a -left drawing in every
  // mirrored view whose base view has it.
  const asymmetric = new Set<string>();
  for (const view of MIRRORED_VIEWS) for (const p of docs[variantName(view)]?.parts ?? []) asymmetric.add(p.id);
  for (const view of MIRRORED_VIEWS) {
    const base = docs[view];
    const variant = docs[variantName(view)];
    if (!variant) {
      problems.push(`${variantName(view)}: missing`);
      continue;
    }
    if (Object.keys(variant.anchors).length) problems.push(`${variantName(view)}: anchors belong in ${view}.svg`);
    if (!base) continue;
    const baseIds = base.parts.map((p) => p.id);
    for (const p of variant.parts) {
      if (!baseIds.includes(p.id)) problems.push(`${variantName(view)}: part "${p.id}" is not in ${view}`);
      const after = p.attrs['data-after'];
      if (after !== undefined && !baseIds.includes(after)) {
        problems.push(`${variantName(view)}: "${p.id}" data-after="${after}" is not a part of ${view}`);
      }
      if (variant.viewBox.join() !== base.viewBox.join()) problems.push(`${variantName(view)}: viewBox differs from ${view}`);
    }
    for (const id of asymmetric) {
      if (baseIds.includes(id) && !variant.parts.some((p) => p.id === id)) {
        problems.push(`${variantName(view)}: asymmetric part "${id}" needs a drawing here`);
      }
    }
  }
  const pivots = (name: string) => {
    for (const p of docs[name]?.parts ?? []) {
      try {
        partPivot(p);
      } catch (e) {
        problems.push(`${name}: ${(e as Error).message}`);
      }
    }
  };
  for (const name of Object.keys(docs)) pivots(name);
  if (problems.length) throw new Error(`Bean art breaks the art contract:\n- ${problems.join('\n- ')}`);

  const views: RigView[] = [];
  for (const view of VIEWS) {
    const base = docs[view] as SvgDoc;
    const toRig = (source: string, p: SvgDoc['parts'][number], screenSpace: boolean) => ({
      id: p.id,
      source,
      pivot: partPivot(p),
      hiddenByDefault: p.attrs.visibility === 'hidden' || HIDDEN_BY_DEFAULT.has(p.id),
      screenSpace,
      keyed: usesKeyColours(p.inner),
    });
    const plain = base.parts.filter((p) => p.id !== SHADOW_PART).map((p) => toRig(view, p, false));
    views.push({ view, mirrored: false, viewBox: base.viewBox, parts: plain });
    if (!MIRRORED_VIEWS.includes(view)) continue;
    // Mirrored: the same parts, except asymmetric ones come from the -left drawing and go where
    // its data-after says (or stay in place).
    const variant = docs[variantName(view)] as SvgDoc;
    let parts = plain.slice();
    for (const vp of variant.parts) {
      const at = parts.findIndex((p) => p.id === vp.id);
      const replacement = toRig(variantName(view), vp, true);
      const after = vp.attrs['data-after'];
      if (after === undefined) {
        parts[at] = replacement;
      } else {
        parts = parts.filter((p) => p.id !== vp.id);
        parts.splice(parts.findIndex((p) => p.id === after) + 1, 0, replacement);
      }
    }
    views.push({ view, mirrored: true, viewBox: base.viewBox, parts });
  }
  const anchors = Object.fromEntries(VIEWS.map((v) => [v, { ...(docs[v] as SvgDoc).anchors }])) as BeanArtSpec['anchors'];
  return { docs, asymmetric: [...asymmetric].sort(), views, anchors };
}
