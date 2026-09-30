import { describe, expect, it } from 'vitest';
import type { SimState } from '../src/compare-states';
import { formatRows, parseTimed, pickScripts, pickStates } from '../src/verify';

describe('parseTimed', () => {
  it('reads scene@seconds pairs', () => {
    expect(parseTimed('drop@1.5, hub@2')).toEqual([
      { scene: 'drop', t: 1.5 },
      { scene: 'hub', t: 2 },
    ]);
    expect(parseTimed(undefined)).toEqual([]);
  });
  it('rejects anything else', () => {
    expect(() => parseTimed('drop=1')).toThrow(/scene@seconds/);
  });
});

describe('pickStates', () => {
  it("keeps only the run's scripts and timed shots", () => {
    const states = new Map<string, SimState>([
      ['hub-walk/start.json', {}],
      ['hub-old/start.json', {}],
      ['drop_t1.000.json', {}],
      ['drop_t9.000.json', {}],
      ['hub.json', 'live'],
    ]);
    expect([...pickStates(states, ['hub-walk'], ['drop_t1.000.json']).keys()]).toEqual(['hub-walk/start.json', 'drop_t1.000.json']);
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
