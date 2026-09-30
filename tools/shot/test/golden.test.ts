import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareStateSets, readStates } from '../src/compare-states';
import { GOLDEN, goldenCompleteness, goldenFiles, goldenProblems, goldenTimedShots, timedShots, writeGolden } from '../src/golden';
import { scriptOutputName } from '../src/script';
import { allScripts } from '../src/session';

const scripts = () => new Map(allScripts().map((p) => [scriptOutputName(basename(p)), JSON.parse(readFileSync(p, 'utf8')) as unknown]));

describe('the golden folder in the repo', () => {
  // `pnpm verify --update-golden` sets VERIFY_UPDATING_GOLDEN for its check: that run rewrites
  // the folder, so a new script's missing file must not stop it (every other test still gates).
  it.skipIf(process.env.VERIFY_UPDATING_GOLDEN === '1')('is valid and complete: one file per script shot, no extras', () => {
    expect(goldenCompleteness(goldenFiles(), scripts())).toEqual([]);
  });

  it('holds the timed scene shots, and every golden state is a stepped one', () => {
    expect(goldenTimedShots().length).toBeGreaterThan(0);
    for (const state of readStates(GOLDEN).values()) expect(typeof state === 'object' && state !== null).toBe(true);
  });
});

describe('goldenProblems and goldenCompleteness', () => {
  const shot = { script: 'hub-walk', shot: 'start', scene: 'hub', layout: null, look: null, state: { tick: 0 } };
  const script = { scene: 'hub', steps: [{ shot: 'start' }, { wait: 1 }, { shot: 'walked' }] };

  it('accepts a well-formed file', () => {
    expect(goldenProblems('hub-walk/start.json', shot)).toEqual([]);
    expect(goldenProblems('drop_t1.000.json', { scene: 'drop', t: 1, layout: null, look: null, state: {} })).toEqual([]);
  });

  it('rejects extra fields, a look, a wrong name and a missing state', () => {
    expect(goldenProblems('hub-walk/start.json', { ...shot, png: 'x' })[0]).toMatch(/fields/);
    expect(goldenProblems('hub-walk/start.json', { ...shot, look: 'blue' }).join()).toMatch(/"look" must be null/);
    expect(goldenProblems('hub-walk/other.json', shot).join()).toMatch(/"shot" is "start"/);
    expect(goldenProblems('hub-walk/start.json', { ...shot, state: null }).join()).toMatch(/"state" must be an object/);
    expect(goldenProblems('drop.json', { scene: 'drop', t: 1, layout: null, look: null, state: {} }).join()).toMatch(/<scene>_t<time>/);
  });

  it('names a missing shot, a shot no script takes, and a layout that disagrees', () => {
    const files = new Map<string, unknown>([
      ['hub-walk/start.json', { ...shot, layout: 'bench' }],
      ['hub-walk/gone.json', { ...shot, shot: 'gone' }],
    ]);
    const problems = goldenCompleteness(files, new Map([['hub-walk', script]]));
    expect(problems).toContain('hub-walk/walked.json: missing (run pnpm verify --update-golden)');
    expect(problems).toContain('hub-walk/gone.json: no script takes this shot');
    expect(problems.join()).toMatch(/hub-walk\/start.json: scene "hub" and layout "bench", but the script opens "hub" with null/);
  });
});

describe('comparing against golden states', () => {
  const golden = new Map([
    ['hub-walk/start.json', { bean: { x: 0, y: 0 } }],
    ['drop_t1.000.json', { balls: [{ y: 5.095 }] }],
  ]);
  const opts = { baseName: 'tools/shot/golden/', freshName: 'artifacts/shots/', extras: { hint: 'run --update-golden' } };

  it('passes on identical states', () => {
    const r = compareStateSets(golden, structuredClone(golden), opts);
    expect(r).toMatchObject({ compared: 2, failures: 0 });
  });

  it('fails on a changed number, naming the file and the field', () => {
    const fresh = structuredClone(golden);
    fresh.set('hub-walk/start.json', { bean: { x: 0.0001, y: 0 } });
    const r = compareStateSets(golden, fresh, opts);
    expect(r.failures).toBe(1);
    expect(r.lines).toContain('DIFF    tools/shot/golden/hub-walk/start.json  .bean.x: 0 ≠ 0.0001');
  });

  it('fails when a run lacks a golden shot, and when a new shot has no golden file', () => {
    const fresh = new Map([
      ['drop_t1.000.json', { balls: [{ y: 5.095 }] }],
      ['hub-walk/new.json', { bean: {} }],
    ]);
    const r = compareStateSets(golden, fresh, opts);
    expect(r.failures).toBe(2);
    expect(r.lines.join('\n')).toMatch(/MISSING hub-walk\/start.json \(in tools\/shot\/golden\/, not in artifacts\/shots\/\)/);
    expect(r.lines.join('\n')).toMatch(/MISSING tools\/shot\/golden\/hub-walk\/new.json \(a new shot; run --update-golden\)/);
  });
});

describe('writeGolden', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const log = (script: string, shot: string, x: number) => ({ ok: true, script, scene: 'hub', shot, png: 'ignored', sceneState: { tick: 1, paused: true, state: { bean: { x } }, view: { ignored: true } } });

  it('writes only the sim state, keeps unchanged files, and removes stale ones', () => {
    dir = mkdtempSync(join(tmpdir(), 'golden-'));
    const shots = join(dir, 'shots');
    const golden = join(dir, 'golden');
    mkdirSync(join(shots, 'hub-walk'), { recursive: true });
    writeFileSync(join(shots, 'hub-walk', 'run.json'), '{}');
    writeFileSync(join(shots, 'hub-walk', 'start.json'), JSON.stringify(log('hub-walk', 'start', 0)));
    writeFileSync(join(shots, 'drop_t1.000.json'), JSON.stringify({ sceneState: { paused: true, state: { y: 5 } } }));
    mkdirSync(join(golden, 'hub-gone'), { recursive: true });
    writeFileSync(join(golden, 'hub-gone', 'x.json'), '{}');

    const first = writeGolden(shots, [{ name: 'hub-walk', layout: null }], [{ scene: 'drop', t: 1 }], true, golden);
    expect(first).toEqual({ written: 2, changed: [], added: ['hub-walk/start.json', 'drop_t1.000.json'], removed: ['hub-gone/x.json'] });
    expect(readdirSync(golden).sort()).toEqual(['drop_t1.000.json', 'hub-walk']);
    expect(JSON.parse(readFileSync(join(golden, 'hub-walk', 'start.json'), 'utf8'))).toEqual({ script: 'hub-walk', shot: 'start', scene: 'hub', layout: null, look: null, state: { bean: { x: 0 } } });
    expect(timedShots(readdirSync(golden))).toEqual([{ scene: 'drop', t: 1 }]);

    const again = writeGolden(shots, [{ name: 'hub-walk', layout: null }], [{ scene: 'drop', t: 1 }], true, golden);
    expect(again).toMatchObject({ changed: [], added: [], removed: [] });

    writeFileSync(join(shots, 'hub-walk', 'start.json'), JSON.stringify(log('hub-walk', 'start', 1)));
    expect(writeGolden(shots, [{ name: 'hub-walk', layout: null }], [], false, golden)).toMatchObject({ changed: ['hub-walk/start.json'], removed: [] });
    // A partial update (no timed shots, not all) leaves the timed file alone.
    expect(readdirSync(golden)).toContain('drop_t1.000.json');
  });
});
