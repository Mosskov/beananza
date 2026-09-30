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
];

/** Every shot log (not the scripts' run.json) under `dir`, by path relative to it. */
function logs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      // Only the scripts' folders; skip other evidence folders such as reduced-motion or software-gl.
      if (existsSync(join(path, 'run.json'))) for (const f of readdirSync(path)) if (f.endsWith('.json') && f !== 'run.json') out.push(relative(dir, join(path, f)));
    } else if (name.endsWith('.json')) {
      out.push(name);
    }
  }
  return out.sort();
}

/**
 * The sim state of a log, or null for scenes without a sim. Live shots (the sim running on
 * wall-clock time, `sceneState.paused` false) land on whatever tick the browser reached, so
 * they are skipped: `'live'`.
 */
const simState = (file: string): Json | null | 'live' => {
  const log = JSON.parse(readFileSync(file, 'utf8')) as { sceneState?: { paused?: boolean; state?: Json } };
  if (log.sceneState?.state && log.sceneState.paused === false) return 'live';
  return log.sceneState?.state ?? null;
};

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

/**
 * Compare the sim states of every stepped shot log under `base` with the same log under
 * `fresh`. `scripts` limits it to those scripts' folders (for example when `fresh` only ran the
 * hub scripts).
 */
export function compareStates(base: string, fresh: string, scripts?: readonly string[]): Comparison {
  const result: Comparison = { compared: 0, failures: 0, lines: [] };
  const wanted = (rel: string) => !scripts || scripts.includes(rel.split(/[\\/]/)[0] ?? '');
  for (const rel of logs(base).filter(wanted)) {
    const other = join(fresh, rel);
    if (!existsSync(other)) {
      result.failures += 1;
      result.lines.push(`MISSING ${rel} (not in ${relative(REPO, fresh)})`);
      continue;
    }
    const before = simState(join(base, rel));
    const after = simState(other);
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
      result.lines.push(`DIFF    ${rel}  ${found.slice(0, SHOW_DIFFS).join('; ')}${more}`);
    } else {
      result.lines.push(`same    ${rel}`);
    }
  }
  if (result.compared === 0) {
    result.failures += 1;
    result.lines.push('nothing compared');
  }
  return result;
}

export const RENAME_NOTES = RENAMES.map((r) => r.since);

// Run as a command: compare-states <baseline dir> [<new dir>].
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [baseArg, newArg = 'artifacts/shots'] = process.argv.slice(2);
  if (!baseArg) throw new Error('usage: compare-states <baseline dir> [<new dir>]');
  const { compared, failures, lines } = compareStates(resolve(REPO, baseArg), resolve(REPO, newArg));
  for (const line of lines) console.log(line);
  console.log(`\n${compared} sim states compared, ${failures} failures. Renames applied: ${RENAME_NOTES.join('; ')}`);
  process.exit(failures ? 1 : 0);
}
