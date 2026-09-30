// Golden sim states: the parity baseline, kept in the repo as reviewable files.
//   tools/shot/golden/<script>/<shot>.json   one per shot step of every script
//   tools/shot/golden/<scene>_t<time>.json   one per timed scene shot (the scene stepped to t)
// Each holds only what compare-states compares (`sceneState.state`), plus where it came from.
// `pnpm verify` compares against these; `pnpm verify --update-golden` rewrites them, and
// nothing else does, so a sim-state change shows up as a diff in the pull request.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { simStateOf } from './compare-states';
import { parseScript } from './script';
import { REPO } from './session';

export const GOLDEN = join(REPO, 'tools/shot/golden');

type Json = Record<string, unknown>;

export interface GoldenScriptShot {
  script: string;
  shot: string;
  scene: string;
  /** The script's `"layout"`, or null for the plaza. */
  layout: string | null;
  /** Always the default look: the other looks are compared with it (check-looks). */
  look: null;
  state: Json;
}

export interface GoldenTimedShot {
  scene: string;
  t: number;
  layout: null;
  look: null;
  state: Json;
}

export type GoldenFile = GoldenScriptShot | GoldenTimedShot;

/** A timed scene shot's file name: `drop_t1.000.json`. */
export const timedName = (scene: string, t: number) => `${scene}_t${t.toFixed(3)}.json`;

/** Timed scene shots (`drop_t1.000.json`) among file names, as scene and time. */
export function timedShots(fileNames: readonly string[]): { scene: string; t: number }[] {
  return fileNames.flatMap((f) => {
    const m = /^([a-z0-9-]+)_t(\d+(?:\.\d+)?)\.json$/.exec(f);
    return m ? [{ scene: m[1] as string, t: Number(m[2]) }] : [];
  });
}

/** The timed scene shots the golden folder holds. */
export const goldenTimedShots = (dir = GOLDEN) => (existsSync(dir) ? timedShots(readdirSync(dir)) : []);

const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Check one golden file's shape; returns the problems (none when valid). */
export function goldenProblems(rel: string, json: unknown): string[] {
  if (!isRecord(json)) return [`${rel}: not a JSON object`];
  const problems: string[] = [];
  const keys = Object.keys(json).sort().join(',');
  const inFolder = rel.includes('/');
  const want = inFolder ? 'layout,look,scene,script,shot,state' : 'layout,look,scene,state,t';
  if (keys !== want) problems.push(`${rel}: fields ${keys}, expected ${want}`);
  if (!isRecord(json.state)) problems.push(`${rel}: "state" must be an object (a stepped sim state)`);
  if (json.look !== null) problems.push(`${rel}: "look" must be null (golden states are the default look)`);
  if (inFolder) {
    const [script, file] = rel.split('/') as [string, string];
    if (json.script !== script) problems.push(`${rel}: "script" is ${JSON.stringify(json.script)}, expected "${script}"`);
    if (`${String(json.shot)}.json` !== file) problems.push(`${rel}: "shot" is ${JSON.stringify(json.shot)}, expected "${file.replace(/\.json$/, '')}"`);
  } else {
    const [timed] = timedShots([rel]);
    if (!timed) problems.push(`${rel}: a top-level golden file must be named <scene>_t<time>.json`);
    else if (json.scene !== timed.scene || json.t !== timed.t) problems.push(`${rel}: "scene" and "t" do not match the file name`);
  }
  return problems;
}

/** Every golden file, by path relative to the folder (`hub-walk/start.json`). */
export function goldenFiles(dir = GOLDEN): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      for (const f of readdirSync(path).sort()) if (f.endsWith('.json')) out.set(`${name}/${f}`, JSON.parse(readFileSync(join(path, f), 'utf8')));
    } else if (name.endsWith('.json')) {
      out.set(name, JSON.parse(readFileSync(path, 'utf8')));
    }
  }
  return out;
}

/**
 * Problems with the golden folder as a whole: invalid files, a script shot without its file,
 * and files for shots or scripts that do not exist. `scripts` maps each script's output name
 * to its parsed JSON.
 */
export function goldenCompleteness(files: ReadonlyMap<string, unknown>, scripts: ReadonlyMap<string, unknown>): string[] {
  const problems: string[] = [];
  for (const [rel, json] of files) problems.push(...goldenProblems(rel, json));
  const expected = new Set<string>();
  for (const [name, raw] of scripts) {
    const script = parseScript(raw);
    const layout = script.layout ?? null;
    for (const step of script.steps) {
      if (!('shot' in step)) continue;
      const rel = `${name}/${step.shot}.json`;
      expected.add(rel);
      const json = files.get(rel);
      if (isRecord(json) && (json.layout !== layout || json.scene !== script.scene)) {
        problems.push(`${rel}: scene ${JSON.stringify(json.scene)} and layout ${JSON.stringify(json.layout)}, but the script opens ${JSON.stringify(script.scene)} with ${JSON.stringify(layout)}`);
      }
    }
  }
  for (const rel of expected) if (!files.has(rel)) problems.push(`${rel}: missing (run pnpm verify --update-golden)`);
  for (const rel of files.keys()) if (rel.includes('/') && !expected.has(rel)) problems.push(`${rel}: no script takes this shot`);
  return problems;
}

export interface GoldenUpdate {
  written: number;
  changed: string[];
  added: string[];
  removed: string[];
}

/**
 * Rewrite the golden files from shot logs under `shots`: the folders of `scripts` (all their
 * shots, and nothing stale), and the timed shots `timed`. With `all`, golden script folders
 * not in `scripts` are removed too (a full update). A file whose state did not change is left
 * byte for byte as it was.
 */
export function writeGolden(
  shots: string,
  scripts: readonly { name: string; layout: string | null }[],
  timed: readonly { scene: string; t: number }[],
  all: boolean,
  dir = GOLDEN,
): GoldenUpdate {
  const before = goldenFiles(dir);
  const next = new Map<string, GoldenFile>();
  for (const { name, layout } of scripts) {
    const folder = join(shots, name);
    if (!existsSync(join(folder, 'run.json'))) throw new Error(`no shots for script ${name} in ${folder}`);
    for (const f of readdirSync(folder).sort()) {
      if (!f.endsWith('.json') || f === 'run.json') continue;
      const log = JSON.parse(readFileSync(join(folder, f), 'utf8')) as { shot?: string };
      const state = simStateOf(log);
      if (!isRecord(state)) throw new Error(`${name}/${f} has no stepped sim state`);
      next.set(`${name}/${f}`, { script: name, shot: String(log.shot), scene: String((log as Json).scene), layout, look: null, state });
    }
  }
  for (const { scene, t } of timed) {
    const file = timedName(scene, t);
    const state = simStateOf(JSON.parse(readFileSync(join(shots, file), 'utf8')));
    if (!isRecord(state)) throw new Error(`${file} has no stepped sim state`);
    next.set(file, { scene, t, layout: null, look: null, state });
  }

  const update: GoldenUpdate = { written: next.size, changed: [], added: [], removed: [] };
  const touchedScripts = new Set(scripts.map((s) => s.name));
  for (const rel of before.keys()) {
    const script = rel.includes('/') ? (rel.split('/')[0] as string) : null;
    const owned = all || (script !== null && touchedScripts.has(script));
    if (owned && !next.has(rel)) {
      rmSync(join(dir, rel));
      update.removed.push(rel);
    }
  }
  for (const [rel, file] of next) {
    const text = stable(file);
    const old = before.get(rel);
    // Equal values (in any key order) keep their file byte for byte, so the diff shows only real changes.
    if (old !== undefined && isDeepStrictEqual(old, file)) continue;
    (old === undefined ? update.added : update.changed).push(rel);
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  // Empty script folders left by removed scripts.
  if (existsSync(dir)) for (const name of readdirSync(dir)) if (statSync(join(dir, name)).isDirectory() && readdirSync(join(dir, name)).length === 0) rmSync(join(dir, name), { recursive: true });
  return update;
}
