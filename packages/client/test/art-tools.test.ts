import { describe, expect, it } from 'vitest';
import { phaseTime } from '../src/rig/clips';
import { pickDirections } from '../src/rig/views';

describe('pickDirections (art:part and clip:sheet --views)', () => {
  it('gives all 8 directions in compass order, each with its drawn view', () => {
    expect(pickDirections('all').map((d) => `${d.name} ${d.choice.view}${d.choice.mirrored ? ' m' : ''}`)).toEqual([
      'S front',
      'SE front-34',
      'E side',
      'NE back-34',
      'N back',
      'NW back-34 m',
      'W side m',
      'SW front-34 m',
    ]);
  });

  it('takes compass names or view names (a view name means both directions that draw it)', () => {
    expect(pickDirections('w,S').map((d) => d.name)).toEqual(['S', 'W']);
    expect(pickDirections('side').map((d) => d.name)).toEqual(['E', 'W']);
  });

  it('rejects an unknown name', () => {
    expect(() => pickDirections('sideways')).toThrow(/unknown view or direction "sideways"/);
  });
});

describe('phaseTime (clip:sheet columns)', () => {
  it('splits a looping cycle evenly and runs a one-shot clip start to end', () => {
    [0, 0.325, 0.65, 0.975].forEach((want, k) => expect(phaseTime(1.3, true, k, 4)).toBeCloseTo(want, 12));
    [0, 0.1, 0.2].forEach((want, k) => expect(phaseTime(0.2, false, k, 3)).toBeCloseTo(want, 12));
    expect(phaseTime(0.2, false, 0, 1)).toBe(0);
  });
});
