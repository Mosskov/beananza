import { describe, expect, it } from 'vitest';
import { PRESET_NAMES, isPresetName, nameChoices } from '@beananza/shared';
import { FIXED_DT, HUB_WALK_SPEED, ISLAND, portalExit } from '@beananza/sim';
import { CMD_BURST, CMD_PER_STEP, HubServerCore, JoinRefused, parseCommand } from '../src/core';

const ok = { classCode: 'ABC123', name: 'Brave Otter', look: 'blue,bow' };

describe('preset names (D26)', () => {
  it('has 256 distinct names and offers a few different ones', () => {
    expect(new Set(PRESET_NAMES).size).toBe(256);
    expect(isPresetName('Brave Otter')).toBe(true);
    expect(isPresetName('brave otter')).toBe(false);
    expect(isPresetName('Anything I like')).toBe(false);
    let s = 1;
    const choices = nameChoices(3, () => ((s = (s * 16807) % 2147483647) / 2147483647));
    expect(new Set(choices).size).toBe(3);
    for (const n of choices) expect(isPresetName(n)).toBe(true);
  });
});

describe('hub server core (M2)', () => {
  it('lets players join with a class code, a preset name and a look, and keeps names out of the sim', () => {
    const core = new HubServerCore();
    const entry = core.join('s1', ok);
    expect(entry).toEqual({ id: 's1', name: 'Brave Otter', look: 'blue,plain,bow,round' });
    core.tick(FIXED_DT);
    expect(core.sim.state.beans.map((b) => b.id)).toEqual(['s1']);
    expect(JSON.stringify(core.sim.state)).not.toContain('Otter');
    expect(core.roster()).toEqual([entry]);
  });

  it.each([
    ['no options', undefined],
    ['a lower-case class code', { ...ok, classCode: 'abc123' }],
    ['a free-text name', { ...ok, name: 'Bob' }],
    ['an unknown look', { ...ok, look: 'blue,cape' }],
    ['an unknown region', { ...ok, from: 'moon' }],
  ])('refuses a join with %s', (_what, options) => {
    expect(() => new HubServerCore().join('s1', options)).toThrow(JoinRefused);
  });

  it('puts a player coming back from a region in front of its portal', () => {
    const core = new HubServerCore();
    core.join('s1', { ...ok, from: 'storm' });
    core.tick(FIXED_DT);
    const exit = portalExit(ISLAND.portals.find((p) => p.region === 'storm')!);
    const bean = core.sim.state.beans[0]!;
    expect(bean.x).toBeCloseTo(exit.x, 6);
    expect(bean.y).toBeCloseTo(exit.y, 6);
  });

  it('moves only the sender\'s bean, whatever the message says', () => {
    expect(parseCommand('me', { type: 'move', x: 1, y: 0, run: false, player: 'someone-else' })).toEqual({ type: 'move', x: 1, y: 0, run: false, player: 'me' });
    const core = new HubServerCore();
    core.join('a', ok);
    core.join('b', { ...ok, name: 'Calm Owl' });
    core.tick(FIXED_DT);
    core.command('a', { type: 'move', x: 1, y: 0, run: false, player: 'b' });
    // 1 s in quarter-second ticks (one tick never catches up more than 0.25 s, MAX_FRAME_SECONDS).
    for (let i = 0; i < 4; i++) core.tick(0.25);
    const [a, b] = core.sim.state.beans;
    expect(a!.x - ISLAND.start.x).toBeCloseTo(HUB_WALK_SPEED, 1);
    expect(b!.x).toBeCloseTo(ISLAND.start.x, 9);
  });

  it.each([
    ['not an object', 'jump'],
    ['an unknown type', { type: 'fly' }],
    ['a stick past full', { type: 'move', x: 2, y: 0, run: false }],
    ['a non-finite tap', { type: 'moveTo', x: Infinity, y: 0 }],
    ['a far-away tap', { type: 'moveTo', x: 1e6, y: 0 }],
    ['a use without an id', { type: 'use' }],
  ])('drops %s', (_what, raw) => {
    expect(parseCommand('me', raw)).toBeNull();
  });

  it('limits how many commands a player can send', () => {
    const core = new HubServerCore();
    core.join('a', ok);
    let accepted = 0;
    for (let i = 0; i < 200; i++) if (core.command('a', { type: 'jump' })) accepted += 1;
    expect(accepted).toBe(CMD_BURST);
    core.tick(10 * FIXED_DT);
    let more = 0;
    for (let i = 0; i < 50; i++) if (core.command('a', { type: 'jump' })) more += 1;
    expect(more).toBe(Math.floor(10 * CMD_PER_STEP));
  });

  it('drops a leaving player\'s bean and its roster entry', () => {
    const core = new HubServerCore();
    core.join('a', ok);
    core.tick(FIXED_DT);
    core.leave('a');
    core.tick(FIXED_DT);
    expect(core.sim.state.beans).toEqual([]);
    expect(core.roster()).toEqual([]);
    expect(core.command('a', { type: 'jump' })).toBe(false);
  });

  it('gives the same snapshots for the same messages', () => {
    const play = () => {
      const core = new HubServerCore();
      core.join('a', ok);
      core.join('b', { ...ok, name: 'Calm Owl', look: 'teal' });
      core.tick(0.1);
      core.command('a', { type: 'moveTo', x: 3, y: 4 });
      core.command('b', { type: 'move', x: -1, y: 1, run: true });
      core.tick(0.2);
      core.command('b', { type: 'jump' });
      core.tick(0.2);
      core.tick(0.2);
      return core.snapshot();
    };
    const first = play();
    expect(first.beans).toHaveLength(2);
    expect(play()).toEqual(first);
  });
});
