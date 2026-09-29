// Scripted playthroughs for tools/shot: a scene plus timed input steps, run against a paused
// sim that only moves on `wait` steps, so the same script always gives the same states.
import { SIM_HZ } from '@beananza/sim';

export type ScriptStep =
  /** Hold a key down (Playwright key name: "ArrowRight", "KeyW", "Shift", "Space"). */
  | { keyDown: string }
  /** Release a key. */
  | { keyUp: string }
  /** Press and release a key. */
  | { press: string }
  /** Click or tap at a point in viewport pixels. */
  | { tap: [number, number] }
  /** Step the sim forward this many seconds (rounded to whole fixed steps). */
  | { wait: number }
  /** Take a screenshot plus a JSON log under this name. */
  | { shot: string };

export interface ShotScript {
  /** Scene to open (its `?scene=` name). */
  scene: string;
  steps: ScriptStep[];
}

const KEY_STEPS = ['keyDown', 'keyUp', 'press'] as const;
const SHOT_NAME = /^[a-z0-9][a-z0-9_-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate parsed JSON as a script. Throws with the step index on the first problem. */
export function parseScript(json: unknown): ShotScript {
  if (!isRecord(json)) throw new Error('script must be a JSON object');
  const { scene, steps } = json;
  if (typeof scene !== 'string' || scene === '') throw new Error('script needs a "scene" name');
  if (!Array.isArray(steps) || steps.length === 0) throw new Error('script needs a non-empty "steps" array');
  const names = new Set<string>();
  const out = steps.map((raw, i): ScriptStep => {
    const where = `step ${i}`;
    if (!isRecord(raw)) throw new Error(`${where}: must be an object`);
    const keys = Object.keys(raw);
    if (keys.length !== 1) throw new Error(`${where}: must have exactly one action, got ${JSON.stringify(keys)}`);
    const action = keys[0] as string;
    const value = raw[action];
    if ((KEY_STEPS as readonly string[]).includes(action)) {
      if (typeof value !== 'string' || value === '') throw new Error(`${where}: ${action} needs a key name`);
      return { [action]: value } as ScriptStep;
    }
    if (action === 'tap') {
      if (!Array.isArray(value) || value.length !== 2 || !value.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        throw new Error(`${where}: tap needs [x, y] in viewport pixels`);
      }
      return { tap: [value[0] as number, value[1] as number] };
    }
    if (action === 'wait') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${where}: wait needs a positive number of seconds`);
      }
      if (waitSteps(value) < 1) throw new Error(`${where}: wait ${value} s is shorter than one sim step`);
      return { wait: value };
    }
    if (action === 'shot') {
      if (typeof value !== 'string' || !SHOT_NAME.test(value)) {
        throw new Error(`${where}: shot needs a name of lowercase letters, digits, "-" or "_"`);
      }
      if (value === 'run') throw new Error(`${where}: shot name "run" is reserved for run.json`);
      if (names.has(value)) throw new Error(`${where}: shot name "${value}" is used twice`);
      names.add(value);
      return { shot: value };
    }
    throw new Error(`${where}: unknown action "${action}"`);
  });
  if (names.size === 0) throw new Error('script takes no shot; add at least one { "shot": "<name>" } step');
  return { scene, steps: out };
}

/**
 * Name of a script's output folder: its file name without the extension. Must look like a
 * shot name, so it can never be "." or ".." or otherwise escape the output directory.
 */
export function scriptOutputName(fileName: string): string {
  const name = fileName.replace(/\.[^.]*$/, '');
  if (!SHOT_NAME.test(name)) {
    throw new Error(`script file name "${fileName}" must be lowercase letters, digits, "-" or "_" (plus .json)`);
  }
  return name;
}

/** Output names of several scripts; throws if two would share an output folder. */
export function scriptOutputNames(fileNames: readonly string[]): string[] {
  const names = fileNames.map(scriptOutputName);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup !== undefined) throw new Error(`two scripts would write to the same folder "${dup}"; rename one`);
  return names;
}

/** Whole fixed steps a `wait` takes. */
export function waitSteps(seconds: number): number {
  return Math.round(seconds * SIM_HZ);
}

/** Short human-readable form of a step for logs. */
export function describeStep(step: ScriptStep): string {
  const [action, value] = Object.entries(step)[0] as [string, unknown];
  return `${action} ${JSON.stringify(value)}`;
}
