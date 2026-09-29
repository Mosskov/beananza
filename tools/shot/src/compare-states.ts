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

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const [baseArg, newArg = 'artifacts/shots'] = process.argv.slice(2);
if (!baseArg) throw new Error('usage: compare-states <baseline dir> [<new dir>]');
const BASE = resolve(REPO, baseArg);
const NEW = resolve(REPO, newArg);

type Json = Record<string, unknown>;

/**
 * Field renames, oldest first. Each maps an older sim state onto the current names.
 * - M1 session 3 (D21): `bean.riding` and `bean.pushing` became one interaction state `bean.act`.
 */
const RENAMES: { since: string; apply: (state: Json) => void }[] = [
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

/** The first differing path between two JSON values, or null. */
function firstDiff(a: unknown, b: unknown, path = ''): string | null {
  if (isDeepStrictEqual(a, b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff((a as Json)[k], (b as Json)[k], `${path}.${k}`);
      if (d) return d;
    }
  }
  return `${path || '(root)'}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
}

let compared = 0;
let failures = 0;
for (const rel of logs(BASE)) {
  const fresh = join(NEW, rel);
  if (!existsSync(fresh)) {
    failures += 1;
    console.log(`MISSING ${rel} (not in ${relative(REPO, NEW)})`);
    continue;
  }
  const before = simState(join(BASE, rel));
  const after = simState(fresh);
  if (!before && !after) continue; // scenes without a sim (empty, bean gallery)
  if (before === 'live' || after === 'live') {
    console.log(`live    ${rel} (skipped: a live shot's tick depends on wall-clock time)`);
    continue;
  }
  if (before) for (const r of RENAMES) r.apply(before);
  compared += 1;
  const diff = firstDiff(before, after);
  if (diff) {
    failures += 1;
    console.log(`DIFF    ${rel}  ${diff}`);
  } else {
    console.log(`same    ${rel}`);
  }
}
console.log(`\n${compared} sim states compared, ${failures} failures. Renames applied: ${RENAMES.map((r) => r.since).join('; ')}`);
process.exit(failures ? 1 : 0);
