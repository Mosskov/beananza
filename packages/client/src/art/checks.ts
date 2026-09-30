// The art contract as findings, one line each: every check the game runs at boot (the bean,
// cosmetic and prop contracts) plus the drawing rules that are not needed to load the art but
// catch slips a reviewer would otherwise have to spot (near and far sides, the scarf tail and
// eye highlights, parts and anchors inside the body outline, the side belly on the front edge).
// `pnpm art:check` prints these and the contract tests assert on them, so the two cannot
// disagree. Pure: the art comes in as text, keyed by repo path (`art/bean/front.svg`).
import { buildBeanArtSpec, variantName, type BeanArtSpec } from '../rig/bean-contract';
import { buildCosmeticsSpec, COSMETIC_FOLDERS, type CosmeticKind, type CosmeticSources } from '../rig/looks';
import { ArtContractError, parseSvgParts, partPivot, type Point, type SvgDoc } from '../rig/svg-parts';
import { MIRRORED_VIEWS, VIEWS, type BeanView } from '../rig/views';
import { outsideBy, rightEdgeAt, shapeOutlines } from './geometry';
import { FACE_IDS, HEADWEAR_IDS, PATTERN_IDS } from '@beananza/shared';
import { buildPropArtSpec, PROP_PARTS } from './prop-contract';

export interface ArtFinding {
  /** Repo path of the file the finding is about. */
  file: string;
  message: string;
}

/** Art files as text, keyed by repo path with forward slashes (`art/bean/side.svg`). */
export type ArtFiles = Readonly<Record<string, string>>;

export type ArtFileKind =
  | { kind: 'bean'; name: string }
  | { kind: 'cosmetic'; cosmetic: CosmeticKind; id: string }
  | { kind: 'prop'; id: string }
  | { kind: 'reference' }
  /** Under art/ but neither loaded nor listed as reference: a file the game will never see. */
  | { kind: 'unknown' };

const BEAN_NAMES: readonly string[] = [...VIEWS, ...MIRRORED_VIEWS.map(variantName)];

/** Reference art from the design exploration, not loaded by the game (`art/README.md`). */
export const REFERENCE_ART: readonly string[] = ['art/bean/forms.svg', 'art/baron/'];

/** What a file under art/ is: a bean view, a cosmetic, a prop, reference art, or unknown. */
export function artFileKind(path: string): ArtFileKind {
  if (REFERENCE_ART.some((r) => (r.endsWith('/') ? path.startsWith(r) : path === r))) return { kind: 'reference' };
  const bean = /^art\/bean\/([a-z0-9-]+)\.svg$/.exec(path);
  if (bean && BEAN_NAMES.includes(bean[1] as string)) return { kind: 'bean', name: bean[1] as string };
  const cosmetic = /^art\/bean\/(patterns|headwear|faces)\/([a-z0-9-]+)\.svg$/.exec(path);
  if (cosmetic) {
    const kind = (Object.keys(COSMETIC_FOLDERS) as CosmeticKind[]).find((k) => COSMETIC_FOLDERS[k] === cosmetic[1]) as CosmeticKind;
    return { kind: 'cosmetic', cosmetic: kind, id: cosmetic[2] as string };
  }
  const prop = /^art\/props\/([a-z0-9-]+)\.svg$/.exec(path);
  if (prop) return { kind: 'prop', id: prop[1] as string };
  return { kind: 'unknown' };
}

/** The loaded art, sorted by kind: bean views by name, cosmetics by kind and id, props by id. */
export function sortArt(files: ArtFiles): { bean: Record<string, string>; cosmetics: CosmeticSources; props: Record<string, string> } {
  const bean: Record<string, string> = {};
  const cosmetics: Record<CosmeticKind, Record<string, string>> = { pattern: {}, headwear: {}, face: {} };
  const props: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) {
    const k = artFileKind(path);
    if (k.kind === 'bean') bean[k.name] = text;
    else if (k.kind === 'cosmetic') cosmetics[k.cosmetic][k.id] = text;
    else if (k.kind === 'prop') props[k.id] = text;
  }
  return { bean, cosmetics, props };
}

/** Parts that lie on the body, so every point of them must be inside its outline. */
export const BODY_HUGGING: readonly string[] = ['belly', 'eyes', 'eyes-sleep', 'mouth', 'cheeks'];
/** Art units a point may lie outside an outline (covers the sampling of curves). */
export const OUTLINE_TOLERANCE = 1.5;
/** In the side view the belly's outer edge follows the body's front: at most this far inside it. */
export const SIDE_BELLY_GAP = 2;

/**
 * Which screen side the near parts are on in the ¾ views (sign of their pivot's x). Turned to
 * its right towards the camera (front ¾), the bean's right side is near and on screen left;
 * turned to its right away from the camera (back ¾), it is near and on screen right.
 */
export const NEAR_SIDE: Readonly<Partial<Record<BeanView, -1 | 1>>> = { 'front-34': -1, 'back-34': 1 };
/** Views with near and far parts: near arm in front of the body, far arm behind it. */
const NEAR_FAR_VIEWS: readonly BeanView[] = ['front-34', 'side', 'back-34'];

const bodyOutline = (doc: SvgDoc): Point[] | null => {
  const body = doc.parts.find((p) => p.id === 'body');
  const outline = body ? shapeOutlines(body.inner).find((o) => o.closed) : undefined;
  return outline?.points ?? null;
};

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** The drawing rules that need only the parsed files (no built spec), for each bean view. */
export function beanDrawingProblems(docs: Readonly<Record<string, SvgDoc>>): string[] {
  const problems: string[] = [];
  for (const name of BEAN_NAMES) {
    const doc = docs[name];
    if (!doc) continue;
    const left = name.endsWith('-left');
    const view = (left ? name.slice(0, -'-left'.length) : name) as BeanView;
    const part = (id: string) => doc.parts.find((p) => p.id === id);
    const pivotX = (id: string) => {
      const p = part(id);
      if (!p) return null;
      try {
        return partPivot(p).x;
      } catch {
        return null; // the contract reports the pivot
      }
    };

    // Near and far parts on the correct side, and in front of or behind the body.
    const near = NEAR_SIDE[view];
    if (!left && near !== undefined) {
      for (const [id, sign] of [['arm-near', near], ['foot-near', near], ['arm-far', -near], ['foot-far', -near]] as const) {
        const x = pivotX(id);
        if (x !== null && Math.sign(x) !== sign) {
          problems.push(`${name}: "${id}" is on screen ${sign < 0 ? 'right' : 'left'} (pivot x ${fmt(x)}); in the ${view} view the ${id.endsWith('near') ? 'near' : 'far'} side is screen ${sign < 0 ? 'left' : 'right'}`);
        }
      }
    }
    if (!left && NEAR_FAR_VIEWS.includes(view)) {
      const order = doc.parts.map((p) => p.id);
      const bodyAt = order.indexOf('body');
      if (bodyAt >= 0) {
        if (order.includes('arm-near') && order.indexOf('arm-near') < bodyAt) problems.push(`${name}: "arm-near" is drawn behind the body; the near arm goes after it`);
        for (const id of ['arm-far', 'arm-far-push']) if (order.includes(id) && order.indexOf(id) > bodyAt) problems.push(`${name}: "${id}" is drawn in front of the body; the far arm goes before it`);
      }
    }

    // Eye highlights on the light side: each shine up and to the right of its pupil.
    const eyes = part('eyes');
    if (eyes) {
      const pupils = [...eyes.inner.matchAll(/<ellipse\b[^>]*\bcx="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
      const shines = [...eyes.inner.matchAll(/<circle\b[^>]*\bcx="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
      if (shines.length !== pupils.length) problems.push(`${name}: "eyes" has ${pupils.length} pupils and ${shines.length} highlights`);
      shines.forEach((s, i) => {
        if (i < pupils.length && s <= (pupils[i] as number)) problems.push(`${name}: eye highlight ${i + 1} is left of its pupil (x ${fmt(s)} ≤ ${fmt(pupils[i] as number)}); the light comes from the upper right`);
      });
    }

    // Body-hugging parts and anchors inside the body outline. A -left drawing is as seen on
    // screen in the mirrored view, so its body is the base view's, mirrored.
    const base = left ? docs[view] : doc;
    const outline0 = base ? bodyOutline(base) : null;
    if (!outline0) continue;
    const outline = left ? outline0.map((p) => ({ x: -p.x, y: p.y })) : outline0;
    for (const id of BODY_HUGGING) {
      const p = part(id);
      if (!p) continue;
      let worst = { by: 0, at: { x: 0, y: 0 } };
      for (const o of shapeOutlines(p.inner)) for (const pt of o.points) {
        const by = outsideBy(pt, outline);
        if (by > worst.by) worst = { by, at: pt };
      }
      if (worst.by > OUTLINE_TOLERANCE) problems.push(`${name}: "${id}" reaches ${fmt(worst.by)} units outside the body outline (at ${fmt(worst.at.x)}, ${fmt(worst.at.y)})`);
    }
    for (const [anchor, at] of Object.entries(doc.anchors)) {
      const by = outsideBy(at, outline);
      if (by > OUTLINE_TOLERANCE) problems.push(`${name}: anchor "${anchor}" is ${fmt(by)} units outside the body outline`);
    }

    // The side belly is the bean's front seen from the side: its outer edge follows the body's
    // front outline (in M1 session 3 a full circle inset from the edge read as a spot on the hip).
    if (view === 'side' && !left) {
      const belly = part('belly');
      const pts = belly ? shapeOutlines(belly.inner).flatMap((o) => o.points) : [];
      if (pts.length) {
        const front = pts.reduce((a, b) => (b.x > a.x ? b : a));
        const edge = rightEdgeAt(front.y, outline);
        if (edge !== null && edge - front.x > SIDE_BELLY_GAP) {
          problems.push(`side: "belly" stops ${fmt(edge - front.x)} units short of the body's front edge (at y ${fmt(front.y)}); in the side view it follows the front outline`);
        }
      }
    }
  }
  return problems;
}

/**
 * The rules that need the built spec: the scarf tail on the bean's left in all 8 directions.
 * Facing the camera (front) the bean's left is screen right; facing away (back), screen left.
 * Facing screen-right (side) its left is the far side, so the tail is behind the body; facing
 * screen-left it is the near side, in front of the body.
 */
export function beanSpecProblems(spec: BeanArtSpec): string[] {
  const problems: string[] = [];
  const want: [BeanView, boolean, 'right' | 'left' | 'behind' | 'in front'][] = [
    ['front', false, 'right'],
    ['back', false, 'left'],
    ['front-34', false, 'right'],
    ['front-34', true, 'right'],
    ['back-34', false, 'left'],
    ['back-34', true, 'left'],
    ['side', false, 'behind'],
    ['side', true, 'in front'],
  ];
  for (const [view, mirrored, where] of want) {
    const rig = spec.views.find((v) => v.view === view && v.mirrored === mirrored);
    const tail = rig?.parts.find((p) => p.id === 'scarf-tail');
    if (!rig || !tail) continue;
    const name = mirrored ? `${view}-left` : view;
    if (where === 'behind' || where === 'in front') {
      const ids = rig.parts.map((p) => p.id);
      const got = ids.indexOf('scarf-tail') > ids.indexOf('body') ? 'in front' : 'behind';
      if (got !== where) problems.push(`${name}: the scarf tail is ${got} the body${mirrored ? ' facing west' : ' facing east'}; it belongs ${where} (the bean's left)`);
    } else {
      // Unmirrored parts are mirrored on screen; screen-space ones are drawn as seen.
      const x = mirrored && !tail.screenSpace ? -tail.pivot.x : tail.pivot.x;
      if ((where === 'right') !== x > 0) problems.push(`${name}: the scarf tail's knot is on screen ${x > 0 ? 'right' : 'left'} (x ${fmt(x)}); on the bean's left it is screen ${where}`);
    }
  }
  return problems;
}

/** Which file a contract problem line names (`side: …`, `headwear bow: …`, `cart: …`). */
function fileOf(line: string, kind: 'bean' | 'cosmetic' | 'prop'): string {
  const head = line.split(':')[0] ?? '';
  if (kind === 'bean') return `art/bean/${head}.svg`;
  if (kind === 'prop') return `art/props/${head}.svg`;
  const [cosmetic, id] = head.split(' ') as [CosmeticKind, string];
  return `art/bean/${COSMETIC_FOLDERS[cosmetic] ?? cosmetic}/${id}.svg`;
}

const contract = <T>(build: () => T): { value: T | null; problems: readonly string[] } => {
  try {
    return { value: build(), problems: [] };
  } catch (e) {
    if (e instanceof ArtContractError) return { value: null, problems: e.problems };
    throw e;
  }
};

/** The ids the game offers per cosmetic kind (`packages/shared/src/look.ts`), without the "none" ids. */
const COSMETIC_IDS: Readonly<Record<CosmeticKind, readonly string[]>> = {
  pattern: PATTERN_IDS.filter((id) => id !== 'plain'),
  headwear: HEADWEAR_IDS.filter((id) => id !== 'none'),
  face: FACE_IDS.filter((id) => id !== 'round'),
};
const ID_LIST: Readonly<Record<CosmeticKind, string>> = { pattern: 'PATTERN_IDS', headwear: 'HEADWEAR_IDS', face: 'FACE_IDS' };

/**
 * Files on disk the game would not load, and ids the game offers with no file: a drawing is
 * only in the game once it is registered (the `draw-piece` skill, step 2).
 */
export function registrationFindings(files: ArtFiles): ArtFinding[] {
  const out: ArtFinding[] = [];
  const onDisk = { pattern: new Set<string>(), headwear: new Set<string>(), face: new Set<string>() };
  for (const path of Object.keys(files)) {
    const k = artFileKind(path);
    if (k.kind === 'unknown') {
      out.push({ file: path, message: `${path}: not a file the game loads (bean views, art/bean/patterns|headwear|faces/<id>.svg, art/props/<id>.svg; ids are lowercase letters, digits and "-") and not listed as reference art (REFERENCE_ART in packages/client/src/art/checks.ts)` });
    } else if (k.kind === 'cosmetic') {
      onDisk[k.cosmetic].add(k.id);
      if (!COSMETIC_IDS[k.cosmetic].includes(k.id)) {
        out.push({ file: path, message: `${k.cosmetic} ${k.id}: not registered, so the game never loads it: add "${k.id}" to ${ID_LIST[k.cosmetic]} (packages/shared/src/look.ts) and import it in packages/client/src/rig/looks-sources.ts` });
      }
    } else if (k.kind === 'prop') {
      if (!(k.id in PROP_PARTS)) {
        out.push({ file: path, message: `${k.id}: not registered, so the game never loads it: list its parts and anchors in PROP_PARTS and PROP_ANCHORS (packages/client/src/art/prop-contract.ts) and import it in packages/client/src/art/prop-sources.ts` });
      }
    }
  }
  for (const kind of Object.keys(COSMETIC_IDS) as CosmeticKind[]) {
    for (const id of COSMETIC_IDS[kind]) {
      if (!onDisk[kind].has(id)) out.push({ file: `art/bean/${COSMETIC_FOLDERS[kind]}/${id}.svg`, message: `${kind} ${id}: in ${ID_LIST[kind]} but there is no drawing` });
    }
  }
  // A registered prop or bean view with no drawing is already a contract problem
  // ("<prop>: missing", "<view>: missing"), so it is not repeated here.
  return out;
}

/** Every finding for the loaded art in `files` (all of art/, as the game loads it). */
export function checkArt(files: ArtFiles): ArtFinding[] {
  const { bean, cosmetics, props } = sortArt(files);
  const findings: ArtFinding[] = [...registrationFindings(files)];
  const add = (kind: 'bean' | 'cosmetic' | 'prop', lines: readonly string[]) => {
    for (const line of lines) findings.push({ file: fileOf(line, kind), message: line });
  };

  const beanSpec = contract(() => buildBeanArtSpec(bean));
  add('bean', beanSpec.problems);
  const docs: Record<string, SvgDoc> = {};
  for (const [name, text] of Object.entries(bean)) {
    try {
      docs[name] = parseSvgParts(text);
    } catch {
      // the contract reports it
    }
  }
  add('bean', beanDrawingProblems(docs));
  if (beanSpec.value) add('bean', beanSpecProblems(beanSpec.value));
  add('cosmetic', contract(() => buildCosmeticsSpec(cosmetics)).problems);
  add('prop', contract(() => buildPropArtSpec(props)).problems);
  return findings;
}
