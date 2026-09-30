import { describe, expect, it } from 'vitest';
import { REACTION_RULES, REACTION_TICKS, SIM_HZ } from '@beananza/sim';
import { DEFAULT_ANIM, HOLD_S, animQuery, animSpan, parseAnimParams, reactionGroups, type AnimOptions } from '../src/scenes/anim-params';

const parse = (query: string) => parseAnimParams(new URLSearchParams(query));

describe('parseAnimParams', () => {
  it('gives a working default: idle, facing south, playing from 0', () => {
    expect(parse('?scene=anim')).toEqual({ options: DEFAULT_ANIM, paused: false, t: 0 });
  });

  it('reads every option; t starts paused there', () => {
    const options: AnimOptions = { clip: 'doze', dir: 'SE', speed: 0.5, loop: false, reducedMotion: true, reaction: 'eureka', ring: true };
    expect(parse('?clip=doze&dir=se&speed=0.5&loop=0&rm=1&reaction=eureka&ring=1&t=1.25')).toEqual({ options, paused: true, t: 1.25 });
    expect(parse('?rm=0').options.reducedMotion).toBe(false);
  });

  it('starts paused at 0 with ?paused=1', () => {
    expect(parse('?paused=1')).toMatchObject({ paused: true, t: 0 });
  });

  it('names the allowed values for an unknown one', () => {
    expect(() => parse('?clip=dance')).toThrow(/Unknown clip "dance"\. Allowed: idle, walk,/);
    expect(() => parse('?dir=up')).toThrow(/Allowed: S, SE, E, NE, N, NW, W, SW/);
    expect(() => parse('?speed=3')).toThrow(/Allowed: 0.25, 0.5, 1, 2/);
    expect(() => parse('?speed=fast')).toThrow(/Unknown speed "fast"/);
    expect(() => parse('?reaction=sneeze')).toThrow(/Allowed: eureka, oops, waveHi, dizzy/);
    expect(() => parse('?ring=yes')).toThrow(/takes 1 or 0/);
    expect(() => parse('?t=-1')).toThrow(/takes seconds/);
  });
});

describe('animQuery', () => {
  it('leaves out the defaults and keeps the other options', () => {
    expect(animQuery(new URLSearchParams('?scene=anim&look=blue,spots,bow,glasses'), DEFAULT_ANIM, null)).toBe('?scene=anim&look=blue,spots,bow,glasses');
  });

  it('replaces the old anim options and paused; t only while paused', () => {
    const current = new URLSearchParams('?scene=anim&clip=walk&t=2&paused=1');
    const options = { ...DEFAULT_ANIM, clip: 'run' as const, speed: 2 as const };
    expect(animQuery(current, options, null)).toBe('?scene=anim&clip=run&speed=2');
    expect(animQuery(current, options, 0.12345)).toBe('?scene=anim&clip=run&speed=2&t=0.123');
  });

  it('reads back what it writes', () => {
    const options: AnimOptions = { clip: 'push', dir: 'NW', speed: 0.25, loop: false, reducedMotion: false, reaction: 'waveHi', ring: true };
    expect(parse(animQuery(new URLSearchParams(), options, 0.5))).toEqual({ options, paused: true, t: 0.5 });
  });
});

describe('reactionGroups', () => {
  it("follows the hub's compatibility table for the clip's act", () => {
    expect(reactionGroups('idle', 'eureka')).toEqual(REACTION_RULES.free.groups.eureka);
    expect(reactionGroups('idle', 'eureka')).toContain('body');
    expect(reactionGroups('sit', 'waveHi')).toEqual(REACTION_RULES.sitting.groups.waveHi);
    expect(reactionGroups('push', 'waveHi')).toEqual(REACTION_RULES.pushing.groups.waveHi);
  });

  it('drops the body unless the bean stands still, and the arm while pushing', () => {
    expect(reactionGroups('walk', 'eureka')).not.toContain('body');
    expect(reactionGroups('jump', 'dizzy')).not.toContain('body');
    expect(reactionGroups('push', 'waveHi')).not.toContain('arms');
    expect(reactionGroups('run', 'waveHi')).toContain('arms');
  });

  it('lays nothing over a reaction clip', () => {
    expect(reactionGroups('oops', 'eureka')).toBeNull();
  });
});

describe('animSpan', () => {
  it('wraps a looping clip straight on and holds the end of anything else', () => {
    expect(animSpan(0.6, true, null)).toEqual({ span: 0.6, cycle: 0.6 });
    expect(animSpan(0.4, false, null)).toEqual({ span: 0.4, cycle: 0.4 + HOLD_S });
  });

  it("runs a pass as long as the hub runs the reaction", () => {
    const span = REACTION_TICKS.dizzy / SIM_HZ;
    expect(animSpan(0.6, true, 'dizzy')).toEqual({ span, cycle: span + HOLD_S });
  });
});
