import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { formatRows, naturalSort, newestStatusFolder, pickScripts, timedShots } from '../src/verify';

describe('newestStatusFolder', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('picks the last folder in natural order, ignoring files', () => {
    dir = mkdtempSync(join(tmpdir(), 'status-'));
    for (const d of ['m0', 'm1-s2', 'm1-s9', 'm1-s10']) mkdirSync(join(dir, d));
    writeFileSync(join(dir, 'zz.txt'), '');
    expect(newestStatusFolder(dir)).toBe(join(dir, 'm1-s10'));
  });

  it('is null without a folder', () => {
    expect(newestStatusFolder(join(tmpdir(), 'no-such-status-folder'))).toBeNull();
  });
});

describe('naturalSort', () => {
  it('orders numbers by value', () => {
    expect(naturalSort(['m1-s10', 'm1-s2', 'm1-s9'])).toEqual(['m1-s2', 'm1-s9', 'm1-s10']);
  });
});

describe('timedShots', () => {
  it('finds the timed scene shots and ignores everything else', () => {
    expect(timedShots(['drop_t1.000.json', 'drop_t1.000.png', 'drop.json', 'hub-walk', 'drop_t1.500.json'])).toEqual([
      { scene: 'drop', t: 1 },
      { scene: 'drop', t: 1.5 },
    ]);
  });
});

describe('pickScripts', () => {
  const have = ['hub-jump', 'hub-walk', 'drop-reset'];
  it('takes every script without --scripts', () => {
    expect(pickScripts(undefined, have)).toEqual(have);
  });
  it('takes the named ones, with or without .json', () => {
    expect(pickScripts('hub-walk, drop-reset.json', have)).toEqual(['hub-walk', 'drop-reset']);
  });
  it('rejects unknown names', () => {
    expect(() => pickScripts('hub-fly', have)).toThrow(/unknown script\(s\): hub-fly/);
  });
});

describe('formatRows', () => {
  it('aligns steps and marks skipped ones', () => {
    expect(
      formatRows([
        { step: 'check', ok: true, seconds: 41.6, detail: '266 passed' },
        { step: 'check-carts', ok: null, seconds: null, detail: 'needs the cart scripts' },
        { step: 'looks', ok: false, seconds: 7, detail: '1 failed' },
      ]),
    ).toEqual([
      'check        ok     42 s  266 passed',
      'check-carts  skip         needs the cart scripts',
      'looks        FAIL    7 s  1 failed',
    ]);
  });
});
