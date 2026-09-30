import { describe, expect, it } from 'vitest';
import {
  ACT_RULES,
  DIZZY_S,
  EUREKA_S,
  OOPS_S,
  REACTION_RULES,
  REACTION_TICKS,
  SIM_HZ,
  Sim,
  WAVE_HI_S,
  allowedGroups,
  createHubScenario,
  reactionEnd,
  standsStill,
  startReaction,
  type ActReactionRules,
  type HubActKind,
  type HubCommand,
  type HubOptions,
  type HubState,
  type ReactionKind,
} from '../src';

const newHub = (options: HubOptions = {}) => new Sim<HubState, HubCommand>(createHubScenario(options), 1);
const move = (x: number, y: number, run = false): HubCommand => ({ type: 'move', x, y, run });
const wave: HubCommand = { type: 'emote', kind: 'waveHi' };

function until(sim: Sim<HubState, HubCommand>, kind: HubActKind, max = 600): void {
  let n = 0;
  while (sim.state.bean.act.kind !== kind && n < max) {
    sim.step();
    n += 1;
  }
  expect(sim.state.bean.act.kind).toBe(kind);
}

/** A hub whose bean is in the given act, reached by real commands. */
function inAct(kind: HubActKind): Sim<HubState, HubCommand> {
  const nearCart = { x: -2.1, y: -1.5 };
  const nearBench = { x: -3.6, y: 0 };
  if (kind === 'free') return newHub();
  if (kind === 'pushing') {
    // Walk east into the light cart's west end.
    const sim = newHub({ start: { x: -3.3, y: -2.1 } });
    sim.enqueue(move(1, 0));
    until(sim, 'pushing');
    return sim;
  }
  if (kind === 'boarding' || kind === 'riding' || kind === 'leaving') {
    const sim = newHub({ start: nearCart });
    sim.enqueue({ type: 'action' });
    sim.step();
    if (kind === 'boarding') return sim;
    until(sim, 'riding');
    if (kind === 'riding') return sim;
    sim.enqueue({ type: 'jump' });
    sim.step();
    return sim;
  }
  // The bench acts.
  const sim = newHub({ start: nearBench });
  sim.enqueue({ type: 'action' });
  sim.step();
  if (kind === 'approaching') return sim;
  until(sim, 'seating');
  if (kind === 'seating') return sim;
  until(sim, 'sitting');
  if (kind === 'sitting') return sim;
  sim.enqueue({ type: 'action' });
  sim.step();
  return sim;
}

const ALL_ACTS = Object.keys(ACT_RULES) as HubActKind[];
const HOP_ACTS: HubActKind[] = ['boarding', 'seating', 'standing', 'leaving'];

describe('reactions (D26): timing', () => {
  it('runs each reaction for its duration in whole ticks', () => {
    expect(REACTION_TICKS).toEqual({
      eureka: Math.round(EUREKA_S * SIM_HZ),
      oops: Math.round(OOPS_S * SIM_HZ),
      waveHi: Math.round(WAVE_HI_S * SIM_HZ),
      dizzy: Math.round(DIZZY_S * SIM_HZ),
    });
    for (const n of Object.values(REACTION_TICKS)) expect(Number.isInteger(n)).toBe(true);
    expect(reactionEnd({ kind: 'eureka', since: 10 })).toBe(10 + REACTION_TICKS.eureka);
  });

  it('starts with no reaction, and an emote starts Wave hi at the tick it was sent', () => {
    const sim = newHub();
    expect(sim.state.bean.reaction).toBeNull();
    sim.stepTo(0.5);
    sim.enqueue(wave);
    sim.step();
    expect(sim.state.bean.reaction).toEqual({ kind: 'waveHi', since: 30 });
  });

  for (const kind of ['eureka', 'oops', 'waveHi', 'dizzy'] as ReactionKind[]) {
    it(`clears ${kind} exactly at its end tick`, () => {
      const sim = newHub();
      sim.stepTo(0.25);
      const since = sim.state.tick;
      expect(startReaction(sim.state, kind)).toBe(true);
      const end = reactionEnd(sim.state.bean.reaction!);
      expect(end).toBe(since + REACTION_TICKS[kind]);
      while (sim.state.tick < end - 1) sim.step();
      expect(sim.state.bean.reaction).toEqual({ kind, since });
      sim.step();
      expect(sim.state.tick).toBe(end);
      expect(sim.state.bean.reaction).toBeNull();
    });
  }
});

describe('reactions (D26): the replace rule', () => {
  const after = (first: ReactionKind, second: ReactionKind) => {
    const sim = newHub();
    startReaction(sim.state, first);
    sim.stepTo(0.5);
    const started = startReaction(sim.state, second);
    return { started, reaction: sim.state.bean.reaction, tick: sim.state.tick };
  };

  it('a new reaction replaces a running one', () => {
    for (const [first, second] of [
      ['eureka', 'oops'],
      ['oops', 'eureka'],
      ['eureka', 'dizzy'],
      ['waveHi', 'eureka'],
      ['waveHi', 'oops'],
      ['waveHi', 'dizzy'],
      ['dizzy', 'waveHi'],
      ['waveHi', 'waveHi'],
    ] as [ReactionKind, ReactionKind][]) {
      const r = after(first, second);
      expect(r.started, `${first} then ${second}`).toBe(true);
      expect(r.reaction, `${first} then ${second}`).toEqual({ kind: second, since: r.tick });
    }
  });

  it('an emote never cuts off Eureka! or Oops', () => {
    for (const first of ['eureka', 'oops'] as ReactionKind[]) {
      const r = after(first, 'waveHi');
      expect(r.started).toBe(false);
      expect(r.reaction).toEqual({ kind: first, since: 0 });
      // The same through the command.
      const sim = newHub();
      startReaction(sim.state, first);
      sim.enqueue(wave);
      sim.step();
      expect(sim.state.bean.reaction).toEqual({ kind: first, since: 0 });
    }
  });

  it('Wave hi starts again once Eureka! has ended', () => {
    const sim = newHub();
    startReaction(sim.state, 'eureka');
    sim.stepTo(EUREKA_S + 0.1);
    expect(sim.state.bean.reaction).toBeNull();
    sim.enqueue(wave);
    sim.step();
    expect(sim.state.bean.reaction?.kind).toBe('waveHi');
  });
});

describe('reactions (D26): the emote command', () => {
  for (const kind of HOP_ACTS) {
    it(`is ignored in ${kind}`, () => {
      const sim = inAct(kind);
      expect(sim.state.bean.act.kind).toBe(kind);
      sim.enqueue(wave);
      sim.step();
      // The hop may have ended on this very step; the emote was offered during `kind`.
      expect(sim.state.bean.reaction).toBeNull();
    });
  }

  for (const kind of ['free', 'pushing', 'approaching', 'riding', 'sitting'] as HubActKind[]) {
    it(`is accepted in ${kind}, and leaves the act alone`, () => {
      const sim = inAct(kind);
      expect(sim.state.bean.act.kind).toBe(kind);
      const before = sim.snapshot();
      sim.enqueue(wave);
      sim.step();
      expect(sim.state.bean.reaction).toEqual({ kind: 'waveHi', since: before.tick });
      // The same step without the emote: the same act, to the tick.
      const twin = inAct(kind);
      expect(twin.state.tick).toBe(before.tick);
      twin.step();
      expect(sim.state.bean.act).toEqual(twin.state.bean.act);
    });
  }

  it('drops an emote kind the sim does not offer, and does not touch the rng', () => {
    const sim = newHub();
    const rng = structuredClone(sim.state.rng);
    sim.enqueue({ type: 'emote', kind: 'eureka' } as unknown as HubCommand);
    sim.enqueue({ type: 'emote' } as unknown as HubCommand);
    sim.enqueue(wave);
    sim.step();
    expect(sim.state.bean.reaction?.kind).toBe('waveHi');
    expect(sim.state.rng).toEqual(rng);
  });

  it('never changes movement: one input script, with and without emotes, agrees at every tick', () => {
    // Board the light cart, get out, run to the west wall, walk to the bench and sit, stand, jump around.
    const script = new Map<number, HubCommand[]>([
      [0, [{ type: 'action' }]],
      [150, [move(1, 0)]],
      [160, [move(0, 0)]],
      [200, [{ type: 'jump' }]],
      [260, [move(-1, 0.3, true)]],
      [330, [move(0, 0)]],
      [340, [{ type: 'use', id: 'bench' }]],
      [600, [{ type: 'action' }]],
      [680, [{ type: 'jump' }]],
      [700, [{ type: 'moveTo', x: 1, y: 0.5 }]],
      [800, [{ type: 'jump' }]],
    ]);
    // Emotes everywhere: inside the hops, riding, sitting, in the air and on the move.
    const emotes = new Set([5, 20, 140, 170, 205, 240, 300, 345, 420, 599, 605, 640, 685, 750, 805, 850]);
    const run = (withEmotes: boolean) => {
      const sim = newHub({ start: { x: -2.1, y: -1.5 } });
      const log: unknown[] = [];
      let started = 0;
      for (let t = 0; t < 900; t++) {
        for (const c of script.get(t) ?? []) sim.enqueue(c);
        if (withEmotes && emotes.has(t)) sim.enqueue(wave);
        sim.step();
        const b = sim.state.bean;
        if (b.reaction?.since === t) started += 1;
        log.push({ x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, act: b.act, facing: [b.facingX, b.facingY], target: b.target, rail: sim.state.rail });
      }
      return { log, sim, started };
    };
    const plain = run(false);
    const emoting = run(true);
    // The script really covers the acts it claims to, and some emotes really ran.
    const kinds = new Set(plain.log.map((e) => (e as { act: { kind: string } }).act.kind));
    for (const k of ['free', 'boarding', 'riding', 'leaving', 'approaching', 'seating', 'sitting', 'standing']) expect(kinds.has(k), k).toBe(true);
    expect(plain.started).toBe(0);
    expect(emoting.started).toBeGreaterThan(3);
    expect(emoting.log).toEqual(plain.log);
    expect(emoting.sim.state.rng).toEqual(plain.sim.state.rng);
  });

  it('getting into a cart mid-Eureka! keeps the reaction and its start tick', () => {
    const sim = newHub({ start: { x: -2.1, y: -1.5 } });
    sim.stepTo(0.1);
    startReaction(sim.state, 'eureka');
    const since = sim.state.tick;
    sim.enqueue({ type: 'action' });
    sim.step();
    expect(sim.state.bean.act.kind).toBe('boarding');
    expect(sim.state.bean.reaction).toEqual({ kind: 'eureka', since });
    until(sim, 'riding');
    expect(sim.state.bean.reaction).toEqual({ kind: 'eureka', since });
    // It still ends at its own tick, whatever the act did meanwhile.
    while (sim.state.tick < reactionEnd({ kind: 'eureka', since })) sim.step();
    expect(sim.state.bean.reaction).toBeNull();
    expect(sim.state.bean.act.kind).toBe('riding');
  });
});

describe('reactions (D26): the compatibility table', () => {
  it('has a row for every act kind', () => {
    expect(Object.keys(REACTION_RULES).sort()).toEqual([...ALL_ACTS].sort());
  });

  it('does not compile without a row for an act kind', () => {
    const row: ActReactionRules = REACTION_RULES.free;
    // @ts-expect-error a row for every act kind is required
    const missing: { readonly [K in HubActKind]: ActReactionRules } = { free: row };
    expect(Object.keys(missing)).toEqual(['free']);
  });

  it('accepts emotes in exactly the acts that are not hops, and face and effect play everywhere', () => {
    for (const kind of ALL_ACTS) {
      expect(REACTION_RULES[kind].emote, kind).toBe(!HOP_ACTS.includes(kind));
      for (const r of Object.keys(REACTION_TICKS) as ReactionKind[]) {
        expect(REACTION_RULES[kind].groups[r], `${kind} ${r}`).toEqual(expect.arrayContaining(['face', 'effect']));
      }
    }
  });

  it('allows the body only in free, and the arm wave where the arm is free', () => {
    for (const kind of ALL_ACTS) {
      for (const r of Object.keys(REACTION_TICKS) as ReactionKind[]) {
        const groups = REACTION_RULES[kind].groups[r];
        expect(groups.includes('body'), `${kind} ${r} body`).toBe(kind === 'free' && r !== 'waveHi');
        expect(groups.includes('arms'), `${kind} ${r} arms`).toBe(r === 'waveHi' && ['free', 'approaching', 'sitting', 'riding'].includes(kind));
      }
    }
  });

  it('plays the body only while the bean stands still on the ground', () => {
    const sim = newHub();
    sim.step();
    expect(standsStill(sim.state.bean)).toBe(true);
    expect(allowedGroups(sim.state.bean, 'eureka')).toContain('body');

    sim.enqueue(move(1, 0));
    sim.step();
    expect(standsStill(sim.state.bean)).toBe(false);
    expect(allowedGroups(sim.state.bean, 'eureka')).not.toContain('body');
    // Walking, the wave keeps its arm.
    expect(allowedGroups(sim.state.bean, 'waveHi')).toContain('arms');

    sim.enqueue(move(0, 0));
    sim.enqueue({ type: 'jump' });
    sim.step();
    expect(sim.state.bean.grounded).toBe(false);
    expect(allowedGroups(sim.state.bean, 'oops')).not.toContain('body');
  });

  it('gives no arm to the wave while pushing, and none to the body in a cart or on the bench', () => {
    expect(allowedGroups(inAct('pushing').state.bean, 'waveHi')).not.toContain('arms');
    const riding = inAct('riding').state.bean;
    expect(allowedGroups(riding, 'waveHi')).toContain('arms');
    expect(allowedGroups(riding, 'eureka')).not.toContain('body');
    expect(allowedGroups(inAct('sitting').state.bean, 'oops')).not.toContain('body');
  });
});

describe('reactions (D26): the state', () => {
  it('stays plain JSON while a reaction runs', () => {
    const sim = newHub();
    sim.enqueue(wave);
    sim.stepTo(0.5);
    expect(sim.state.bean.reaction).not.toBeNull();
    expect(JSON.parse(JSON.stringify(sim.state))).toEqual(sim.state);
    expect(Object.keys(sim.state.bean.reaction!).sort()).toEqual(['kind', 'since']);
  });

  it('is the same on a replay of the same commands', () => {
    const run = () => {
      const sim = newHub();
      sim.enqueue(move(1, 0));
      sim.stepTo(0.3);
      sim.enqueue(wave);
      sim.stepTo(1.2);
      startReaction(sim.state, 'oops');
      sim.stepTo(2);
      return sim.snapshot();
    };
    expect(run()).toEqual(run());
  });
});
