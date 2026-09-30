// Compares the sim states in two sets of shot logs, for example a status folder from an earlier
// session against fresh runs of the same scripts:
//   pnpm shot:compare-states docs/status/m1-s2 artifacts/shots
// Only the sim state is compared (`sceneState.state`), not screen positions or pixels. Fields
// renamed since the earlier logs are mapped first (RENAMES below), so a pure refactor must show
// no differences. Exits non-zero on any difference or on a log missing from either side.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { polygonFromRect, type Rect } from '@beananza/sim';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

type Json = Record<string, unknown>;

/**
 * Field renames and additions, oldest first. Each maps an older sim state onto the current
 * fields; none changes a number.
 * - M1 session 3 (D21): `bean.riding` and `bean.pushing` became one interaction state `bean.act`.
 * - M1 session 3 (D23): `rail.riders` logs getting in and out (empty in older logs).
 * - M1 session 3 (D24): `layout.benches`, the plaza's bench.
 * - After M1 session 3: props and benches name their drawing (`art`); the bench is `usable`.
 * - Hub island (D2): `layout.walkable` is a convex polygon; a rectangle becomes its 4 corners.
 * - Hub island (D2): `layout.portals`, the region portals (empty in older logs).
 * - Hub island (M2): `bean` and `input` became `beans[0]` (id `local`) with its own `input`.
 */
const RENAMES: { since: string; apply: (state: Json, fresh: Json) => void }[] = [
  {
    since: 'M1 session 3: bean.riding and bean.pushing → bean.act',
    apply(state) {
      const bean = state.bean as Json | undefined;
      if (!bean || !('riding' in bean)) return;
      const pushing = bean.pushing as Json | null;
      bean.act = bean.riding ? { kind: 'riding', cart: bean.riding } : pushing ? { kind: 'pushing', ...pushing } : { kind: 'free' };
      delete bean.riding;
      delete bean.pushing;
    },
  },
  {
    since: 'M1 session 3: rail.riders added',
    apply(state) {
      const rail = state.rail as Json | null | undefined;
      if (rail && !('riders' in rail)) rail.riders = [];
    },
  },
  {
    // D24: the plaza gained a bench. Older layouts had none; the fresh one's is taken as is
    // (a script that walks into the bench shows up as a difference in the bean's state).
    since: 'M1 session 3: layout.benches added',
    apply(state, fresh) {
      const layout = state.layout as Json | undefined;
      if (layout && !('benches' in layout)) layout.benches = (fresh.layout as Json | undefined)?.benches;
    },
  },
  {
    // Drawing data only: copied from the fresh log for props with the same id.
    since: 'after M1 session 3: layout props and benches gained art and usable',
    apply(state, fresh) {
      const layout = state.layout as Json | undefined;
      const freshLayout = fresh.layout as Json | undefined;
      for (const key of ['props', 'benches']) {
        const old = layout?.[key] as Json[] | undefined;
        const now = freshLayout?.[key] as Json[] | undefined;
        for (const p of old ?? []) {
          const match = now?.find((q) => q.id === p.id);
          if (!match || 'art' in p) continue;
          p.art = match.art;
          if ('usable' in match) p.usable = match.usable;
        }
      }
    },
  },
  {
    since: 'hub island (D2): layout.walkable became a convex polygon',
    apply(state) {
      const layout = state.layout as Json | undefined;
      const walkable = layout?.walkable as Json | undefined;
      if (layout && walkable && 'minX' in walkable) layout.walkable = polygonFromRect(walkable as unknown as Rect);
    },
  },
  {
    since: 'hub island (D2): layout.portals added (the plaza has none)',
    apply(state) {
      const layout = state.layout as Json | undefined;
      if (layout && !('portals' in layout)) layout.portals = [];
    },
  },
  {
    // M2 (a whole class in one hub): the one bean is the local player's, and holds its own input.
    since: 'hub island: state.bean and state.input became state.beans[0] (id "local")',
    apply(state, fresh) {
      // Only onto a fresh state in the new form (a state compared with itself stays as it is).
      if (!('bean' in state) || !('beans' in fresh)) return;
      state.beans = [{ ...(state.bean as Json), id: 'local', input: state.input }];
      delete state.bean;
      delete state.input;
    },
  },
];

/** A log's sim state; null for scenes without a sim; `'live'` for a shot on wall-clock time. */
export type SimState = Json | null | 'live';

/**
 * The sim state in one file: a shot log (`sceneState.state`), or a golden file (a top-level
 * `state`, `golden.ts`). Live shots (the sim running on wall-clock time, `sceneState.paused`
 * false) land on whatever tick the browser reached, so they are `'live'` and never compared.
 */
export function simStateOf(json: unknown): SimState {
  const log = json as { sceneState?: { paused?: boolean; state?: Json }; state?: Json };
  if (log.sceneState === undefined && log.state !== undefined) return log.state;
  if (log.sceneState?.state && log.sceneState.paused === false) return 'live';
  return log.sceneState?.state ?? null;
}

const isGoldenFile = (json: unknown) => {
  const j = json as Json | null;
  return !!j && typeof j === 'object' && !('sceneState' in j) && 'state' in j;
};

/**
 * Every sim state under `dir`, by path relative to it (`hub-walk/start.json`, `drop_t1.000.json`):
 * the top-level shot logs, and the logs in each script's folder (one with a run.json, or one of
 * golden files). Other evidence folders, such as reduced-motion or software-gl, are skipped.
 */
export function readStates(dir: string): Map<string, SimState> {
  const out = new Map<string, SimState>();
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as unknown;
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      const isScript = existsSync(join(path, 'run.json'));
      for (const f of readdirSync(path).sort()) {
        if (!f.endsWith('.json') || f === 'run.json') continue;
        const json = read(join(path, f));
        if (isScript || isGoldenFile(json)) out.set(`${name}/${f}`, simStateOf(json));
      }
    } else if (name.endsWith('.json')) {
      out.set(name, simStateOf(read(path)));
    }
  }
  return out;
}

/** Every differing leaf path between two JSON values (none when equal). */
function diffs(a: unknown, b: unknown, path = ''): string[] {
  if (isDeepStrictEqual(a, b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => diffs((a as Json)[k], (b as Json)[k], `${path}.${k}`));
  }
  const show = (v: unknown) => (JSON.stringify(v) ?? 'undefined').slice(0, 60);
  return [`${path || '(root)'}: ${show(a)} ≠ ${show(b)}`];
}

/** How many differing paths a DIFF line lists before "and n more". */
const SHOW_DIFFS = 6;

export interface Comparison {
  compared: number;
  failures: number;
  /** One line per log: same, DIFF, MISSING or live. */
  lines: string[];
}

export interface CompareOptions {
  /** Only these scripts' folders (for example when `fresh` only ran the hub scripts). */
  scripts?: readonly string[];
  /** How the base is named in the lines (a folder, or `tools/shot/golden/`). */
  baseName: string;
  freshName: string;
  /**
   * Also fail on a stepped state in a script folder of `fresh` that `base` lacks (a new shot
   * without a golden file). Evidence folders from older sessions have fewer scripts, so off
   * for them.
   */
  extras?: { hint: string };
}

/** Compare every stepped sim state in `base` with the same one in `fresh`. */
export function compareStateSets(base: ReadonlyMap<string, SimState>, fresh: ReadonlyMap<string, SimState>, opts: CompareOptions): Comparison {
  const result: Comparison = { compared: 0, failures: 0, lines: [] };
  const scriptOf = (rel: string) => (rel.includes('/') ? (rel.split('/')[0] as string) : null);
  const wanted = (rel: string) => !opts.scripts || opts.scripts.includes(scriptOf(rel) ?? '');
  for (const [rel, stored] of [...base].filter(([rel]) => wanted(rel))) {
    if (!fresh.has(rel)) {
      result.failures += 1;
      result.lines.push(`MISSING ${rel} (in ${opts.baseName}, not in ${opts.freshName})`);
      continue;
    }
    // Copies: the renames edit them.
    const before = structuredClone(stored);
    const after = structuredClone(fresh.get(rel) as SimState);
    if (!before && !after) continue; // scenes without a sim (empty, the galleries)
    if (before === 'live' || after === 'live') {
      result.lines.push(`live    ${rel} (skipped: a live shot's tick depends on wall-clock time)`);
      continue;
    }
    if (before && after) for (const r of RENAMES) r.apply(before, after);
    result.compared += 1;
    const found = diffs(before, after);
    if (found.length) {
      result.failures += 1;
      const more = found.length > SHOW_DIFFS ? `; and ${found.length - SHOW_DIFFS} more` : '';
      result.lines.push(`DIFF    ${opts.baseName}${rel}  ${found.slice(0, SHOW_DIFFS).join('; ')}${more}`);
    } else {
      result.lines.push(`same    ${rel}`);
    }
  }
  if (opts.extras) {
    for (const [rel, state] of fresh) {
      if (scriptOf(rel) === null || !wanted(rel) || base.has(rel) || state === null || state === 'live') continue;
      result.failures += 1;
      result.lines.push(`MISSING ${opts.baseName}${rel} (a new shot; ${opts.extras.hint})`);
    }
  }
  if (result.compared === 0) {
    result.failures += 1;
    result.lines.push('nothing compared');
  }
  return result;
}

const folderName = (dir: string) => `${relative(REPO, dir).replaceAll('\\', '/')}/`;

/**
 * Compare the sim states of every stepped shot log under `base` (an evidence folder or
 * tools/shot/golden) with the same log under `fresh`. `scripts` limits it to those scripts'
 * folders.
 */
export function compareStates(base: string, fresh: string, scripts?: readonly string[]): Comparison {
  return compareStateSets(readStates(base), readStates(fresh), { scripts, baseName: folderName(base), freshName: folderName(fresh) });
}

export const RENAME_NOTES = RENAMES.map((r) => r.since);

/** Map an older sim state onto the current fields, in place (`fresh`: a current state to copy drawing data from). */
export function applyRenames(state: Json, fresh: Json): void {
  for (const r of RENAMES) r.apply(state, fresh);
}

// Run as a command: compare-states <baseline dir> [<new dir>].
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [baseArg, newArg = 'artifacts/shots'] = process.argv.slice(2);
  if (!baseArg) throw new Error('usage: compare-states <baseline dir> [<new dir>]');
  const { compared, failures, lines } = compareStates(resolve(REPO, baseArg), resolve(REPO, newArg));
  for (const line of lines) console.log(line);
  console.log(`\n${compared} sim states compared, ${failures} failures. Renames applied: ${RENAME_NOTES.join('; ')}`);
  process.exit(failures ? 1 : 0);
}
