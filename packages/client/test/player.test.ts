import { describe, expect, it } from 'vitest';
import { DIZZY_S, EUREKA_S, OOPS_S, Sim, WAVE_HI_S, createHubScenario, type HubAct, type HubCommand, type HubState, type ReactionKind } from '@beananza/sim';
import { BLINK, CLIPS, CLIP_NAMES, LAND_DURATION, REACTION_CLIP_NAMES, familyOf } from '../src/rig/clips';
import { chooseClip, samplePose, type BeanMotion, type ReactionLayer } from '../src/rig/player';
import { chooseReaction } from '../src/rig/reactions';
import { VIEWS, type BeanView } from '../src/rig/views';

const pose = (clip: (typeof CLIP_NAMES)[number], t: number, view: BeanView = 'side', reducedMotion = false, time = 0) =>
  samplePose({ clip, t, time, view, reducedMotion });

describe('clip data', () => {
  it('has every clip for every view family, with well-formed keys', () => {
    for (const name of CLIP_NAMES) {
      for (const family of ['front', 'three-quarter', 'side'] as const) {
        const clip = CLIPS[name][family];
        expect(clip.duration, `${name} ${family}`).toBeGreaterThan(0);
        for (const track of [...clip.tracks, ...BLINK.tracks]) {
          const ats = track.keys.map((k) => k.at);
          expect(ats[0], `${name} ${track.slot}.${track.channel}`).toBe(0);
          expect(ats.at(-1)).toBe(1);
          ats.slice(1).forEach((a, i) => expect(a).toBeGreaterThan(ats[i] as number));
        }
      }
    }
  });

  it('uses the prototype timings (DESIGN.md §6)', () => {
    expect(CLIPS.walk.side.duration).toBe(0.56);
    expect(CLIPS.walk.front.duration).toBe(0.56);
    expect(CLIPS.run.side.duration).toBe(0.34);
    expect(CLIPS.idle.front.duration).toBe(3);
    expect(BLINK.duration).toBe(4);
    expect(LAND_DURATION).toBeGreaterThanOrEqual(0.12);
    expect(LAND_DURATION).toBeLessThanOrEqual(0.14);
    expect(CLIPS.land.side.duration).toBe(LAND_DURATION);
  });

  it('maps views to families', () => {
    expect(VIEWS.map(familyOf)).toEqual(['front', 'three-quarter', 'side', 'three-quarter', 'front']);
  });
});

describe('rig player', () => {
  it('idle breathes: squash 3.5% at the middle of its 3 s loop', () => {
    expect(pose('idle', 0).body).toMatchObject({ scaleX: 1, scaleY: 1 });
    expect(pose('idle', 1.5).body.scaleX).toBeCloseTo(1.035, 12);
    expect(pose('idle', 1.5).body.scaleY).toBeCloseTo(0.965, 12);
    expect(pose('idle', 4.5).body.scaleX).toBeCloseTo(1.035, 12);
  });

  it('blinks every 4 s on top of any clip', () => {
    expect(pose('walk', 0, 'front', false, 0).eyes.scaleY).toBe(1);
    expect(pose('walk', 0, 'front', false, 3.76).eyes.scaleY).toBeCloseTo(0.1, 12);
    expect(pose('run', 0, 'front', false, 7.76).eyes.scaleY).toBeCloseTo(0.1, 12);
  });

  it('walk: 0.56 s cycle, side view bobs 7 units at a quarter cycle and loops', () => {
    expect(pose('walk', 0).body.y).toBe(0);
    expect(pose('walk', 0.14).body.y).toBeCloseTo(-7, 12);
    expect(pose('walk', 0.56 + 0.14).body.y).toBeCloseTo(-7, 12);
    // Feet step in turn: half a cycle apart.
    expect(pose('walk', 0).footA.x).toBeCloseTo(9, 12);
    expect(pose('walk', 0).footB.x).toBeCloseTo(-9, 12);
  });

  it('walk: front views waddle ±5° with alternating foot lifts', () => {
    expect(pose('walk', 0, 'front').body.rotation).toBeCloseTo(-5, 12);
    expect(pose('walk', 0.28, 'front').body.rotation).toBeCloseTo(5, 12);
    expect(pose('walk', 0.14, 'front').footA.y).toBeCloseTo(-8, 12);
    expect(pose('walk', 0.14, 'front').footB.y).toBeCloseTo(0, 12);
    expect(pose('walk', 0.42, 'front').footB.y).toBeCloseTo(-8, 12);
  });

  it('run: 0.34 s cycle, 8° lean and a 12-unit bounce in the side view', () => {
    for (const t of [0, 0.1, 0.2, 0.3]) expect(pose('run', t).body.rotation).toBe(8);
    expect(pose('run', 0.085).body.y).toBeCloseTo(-12, 12);
  });

  it('jump: crouch squash at take-off, stretch at launch, arms up in the air', () => {
    expect(pose('jump', 0, 'front').body).toMatchObject({ scaleX: 1.16, scaleY: 0.84 });
    expect(pose('jump', 0.14, 'front').body).toMatchObject({ scaleX: 0.9, scaleY: 1.12 });
    expect(pose('jump', 0.4, 'front').armA.rotation).toBe(140);
    expect(pose('jump', 0.4, 'front').armB.rotation).toBe(-140);
    expect(pose('jump', 0.4, 'side').armA.rotation).toBe(-150);
    expect(pose('jump', 0.4, 'front').footA.y).toBe(-6);
  });

  it('land: squash at touchdown, back to rest after LAND_DURATION', () => {
    expect(pose('land', 0).body).toMatchObject({ scaleX: 1.18, scaleY: 0.84 });
    expect(pose('land', LAND_DURATION).body).toMatchObject({ scaleX: 1, scaleY: 1 });
  });

  it('reduced motion removes bob, squash, breathing and waddle, but keeps poses', () => {
    const still = { y: 0, scaleX: 1, scaleY: 1 };
    expect(pose('idle', 1.5, 'front', true).body).toMatchObject(still);
    expect(pose('walk', 0.14, 'side', true).body).toMatchObject(still);
    expect(pose('walk', 0, 'front', true).body.rotation).toBe(0);
    expect(pose('run', 0.085, 'side', true).body).toMatchObject({ ...still, rotation: 8 });
    expect(pose('jump', 0, 'front', true).body).toMatchObject(still);
    expect(pose('land', 0, 'front', true).body).toMatchObject(still);
    // Poses still change: arms up in the air, feet step.
    expect(pose('jump', 0.4, 'front', true).armA.rotation).toBe(140);
    expect(pose('walk', 0, 'side', true).footA.x).toBeCloseTo(9, 12);
  });

  it('is deterministic: the same request gives the same pose', () => {
    expect(pose('run', 1.234, 'back-34', false, 5.6)).toEqual(pose('run', 1.234, 'back-34', false, 5.6));
  });
});

describe('choosing a clip from sim state', () => {
  const g = 9.81;
  const still: BeanMotion = { vx: 0, vy: 0, vz: 0, grounded: true, lastJump: null };

  it('idle when still, walk and run by ground speed, on sim time', () => {
    expect(chooseClip(still, 2, g)).toEqual({ clip: 'idle', t: 2 });
    expect(chooseClip({ ...still, vx: 2.4 }, 2, g)).toEqual({ clip: 'walk', t: 2 });
    expect(chooseClip({ ...still, vx: -1.7, vy: 1.7 }, 2, g).clip).toBe('walk');
    expect(chooseClip({ ...still, vy: 4.2 }, 2, g)).toEqual({ clip: 'run', t: 2 });
    expect(chooseClip({ ...still, vx: 0.01 }, 2, g).clip).toBe('idle');
  });

  it('jump while rising (time since take-off), fall after the apex (time since the apex)', () => {
    const air = { ...still, grounded: false, lastJump: { startedAt: 1, landedAt: null } };
    expect(chooseClip({ ...air, vz: 2 }, 1.1, g)).toEqual({ clip: 'jump', t: expect.closeTo(0.1, 12) as number });
    const fall = chooseClip({ ...air, vz: -1.962 }, 1.6, g);
    expect(fall.clip).toBe('fall');
    expect(fall.t).toBeCloseTo(0.2, 12);
  });

  it('push while pushing a cart (heavy for a heavy cart), side view lean 10° or 16°', () => {
    const pushing = { ...still, vx: 1.9 };
    expect(chooseClip(pushing, 2, g, { clip: 'push', t: 2 })).toEqual({ clip: 'push', t: 2 });
    expect(chooseClip(pushing, 2, g, { clip: 'pushHeavy', t: 2 })).toEqual({ clip: 'pushHeavy', t: 2 });
    expect(pose('push', 0.3).body.rotation).toBe(10);
    expect(pose('pushHeavy', 0.3).body.rotation).toBe(16);
    expect(pose('push', 0.3).armA.rotation).toBe(-80);
    expect(pose('push', 0.225, 'side', true).body).toMatchObject({ y: 0, rotation: 10 });
  });

  it('an interaction’s clip wins over the ground-speed clips (idle while riding a moving cart)', () => {
    expect(chooseClip({ ...still, vx: 1.2 }, 2, g, { clip: 'idle', t: 2 })).toEqual({ clip: 'idle', t: 2 });
    // A hop's clip comes even before the landing squash.
    const landed = { ...still, lastJump: { startedAt: 1, landedAt: 1.95 } };
    expect(chooseClip(landed, 2, g, { clip: 'idle', t: 2 }).clip).toBe('land');
    expect(chooseClip(landed, 2, g, { clip: 'fall', t: 0.1, first: true })).toEqual({ clip: 'fall', t: 0.1 });
  });

  it('land for LAND_DURATION after the exact touchdown, then back to the ground clips', () => {
    const landed = { ...still, lastJump: { startedAt: 1, landedAt: 1.7914 } };
    expect(chooseClip(landed, 1.8, g).clip).toBe('land');
    expect(chooseClip(landed, 1.8, g).t).toBeCloseTo(0.0086, 12);
    expect(chooseClip(landed, 1.7914 + LAND_DURATION, g).clip).toBe('idle');
    expect(chooseClip({ ...landed, vx: 2.4 }, 1.95, g).clip).toBe('walk');
  });
});

describe('sitting on the bench', () => {
  it('feet dangle 8–15 units below the body and swing in turn over 1.3 s', () => {
    expect(pose('sit', 0, 'front').footA.y).toBeCloseTo(8, 12);
    expect(pose('sit', 0.65, 'front').footA.y).toBeCloseTo(15, 12);
    expect(pose('sit', 0, 'front').footB.y).toBeCloseTo(15, 12);
    expect(pose('sit', 0.65, 'front').footB.y).toBeCloseTo(8, 12);
  });

  it('under reduced motion the feet hang still at 12 units and the "z" does not float', () => {
    for (const t of [0, 0.3, 0.65, 1.1]) {
      expect(pose('sit', t, 'front', true).footA.y).toBe(12);
      expect(pose('sit', t, 'front', true).footB.y).toBe(12);
      expect(pose('doze', t, 'front', true).fxHead).toEqual({ x: 4, y: -4, rotation: 0, scaleX: 1, scaleY: 1 });
    }
  });

  it('dozing: feet still at 12 units, the "z" rises over 2 s', () => {
    expect(pose('doze', 0.4, 'front').footA.y).toBe(12);
    expect(pose('doze', 0, 'front').fxHead.y).toBeCloseTo(6, 12);
    expect(pose('doze', 1.9, 'front').fxHead.y).toBeLessThan(-15);
  });

  it('waving (Priya): sitting, with the screen-right arm raised and waving every 0.4 s; still raised under reduced motion', () => {
    expect(pose('wave', 0, 'front').armB.rotation).toBeCloseTo(-95, 12);
    expect(pose('wave', 0.2, 'front').armB.rotation).toBeCloseTo(-125, 12);
    expect(pose('wave', 0.65, 'front').footA.y).toBeCloseTo(pose('sit', 0.65, 'front').footA.y, 12);
    expect(pose('wave', 0.2, 'front', true).armB.rotation).toBe(-110);
  });
});

describe('reaction clips (D26)', () => {
  const SAMPLES = [0, 0.1, 0.4, 0.63, 0.9, 1.3, 1.7];
  const FAMILIES = ['front', 'three-quarter', 'side'] as const;

  it('last as long as the sim says (EUREKA_S, OOPS_S, WAVE_HI_S, DIZZY_S), once', () => {
    for (const [name, seconds] of [['eureka', EUREKA_S], ['oops', OOPS_S], ['waveHi', WAVE_HI_S], ['dizzy', DIZZY_S]] as const) {
      for (const family of FAMILIES) {
        expect(CLIPS[name][family].duration, `${name} ${family}`).toBe(seconds);
        expect(CLIPS[name][family].loop, `${name} ${family}`).toBe(false);
      }
    }
  });

  it('every track of a reaction clip is in a group, and act clips have none', () => {
    for (const name of REACTION_CLIP_NAMES) for (const family of FAMILIES) for (const track of CLIPS[name][family].tracks) expect(track.group, `${name} ${track.slot}`).toBeDefined();
    for (const name of CLIP_NAMES.filter((n) => !(REACTION_CLIP_NAMES as readonly string[]).includes(n))) {
      for (const family of FAMILIES) for (const track of CLIPS[name][family].tracks) expect(track.group, `${name} ${track.slot}`).toBeUndefined();
    }
  });

  it('eureka: a crouch, a 46-unit jump with the stretch, a squash on landing, then rest', () => {
    expect(pose('eureka', 0).body).toMatchObject({ y: 0, scaleX: 1.06, scaleY: 0.94 });
    expect(pose('eureka', 0.36).body).toMatchObject({ y: -42, scaleX: expect.closeTo(0.95, 12) as number, scaleY: expect.closeTo(1.05, 12) as number });
    expect(pose('eureka', 0.63).body.y).toBeCloseTo(-46, 12);
    expect(pose('eureka', 0.99).body).toMatchObject({ y: 0, scaleX: expect.closeTo(1.08, 12) as number, scaleY: expect.closeTo(0.92, 12) as number });
    expect(pose('eureka', 1.8).body).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
  });

  it('eureka: the feet rise and land with the body (the whole bean jumps), in every view family', () => {
    for (const view of ['front', 'front-34', 'side'] as const) {
      for (const t of [0, 0.2, 0.36, 0.63, 0.9, 1.8]) {
        const p = pose('eureka', t, view);
        expect(p.footA.y, `${view} ${t}`).toBeCloseTo(p.body.y, 12);
        expect(p.footB.y, `${view} ${t}`).toBeCloseTo(p.body.y, 12);
      }
    }
  });

  it('eureka: the lightbulb pops to 1.25 after the crouch, settles at 1, and shrinks away at the end', () => {
    const bulb = (t: number, rm = false) => pose('eureka', t, 'front', rm).fxHead;
    expect(bulb(0).scaleX).toBe(0);
    expect(bulb(0.1 * EUREKA_S).scaleY).toBe(0);
    expect(bulb(0.22 * EUREKA_S)).toMatchObject({ scaleX: expect.closeTo(1.25, 12) as number, y: expect.closeTo(0, 12) as number });
    expect(bulb(0.5 * EUREKA_S).scaleX).toBeCloseTo(1, 12);
    expect(bulb(EUREKA_S).scaleY).toBe(0);
    // Reduced motion: shown at full size, still, for the whole reaction.
    for (const t of SAMPLES) expect(bulb(t, true)).toMatchObject({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  });

  it('oops: the sweat drop appears as the shaking starts, slides 20 down and 6 out, and shrinks away', () => {
    const drop = (t: number, rm = false) => pose('oops', t, 'front', rm).fxBrow;
    expect(drop(0.08 * OOPS_S).scaleX).toBe(0);
    expect(drop(0.2 * OOPS_S)).toMatchObject({ x: expect.closeTo(0, 12) as number, y: expect.closeTo(0, 12) as number, scaleX: expect.closeTo(1, 12) as number });
    expect(drop(0.95 * OOPS_S)).toMatchObject({ x: expect.closeTo(-6, 12) as number, y: expect.closeTo(20, 12) as number, scaleY: expect.closeTo(0.2, 12) as number });
    expect(drop(OOPS_S).scaleX).toBe(0);
    for (const t of SAMPLES) expect(drop(t, true)).toMatchObject({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  });

  it('oops: three 0.5 s shakes of ±8°, and a squish over the last one', () => {
    expect(pose('oops', 0.125).body.rotation).toBeCloseTo(-8, 12);
    expect(pose('oops', 0.375).body.rotation).toBeCloseTo(8, 12);
    expect(pose('oops', 0.5).body.rotation).toBeCloseTo(0, 12);
    expect(pose('oops', 0.625).body.rotation).toBeCloseTo(-8, 12);
    expect(pose('oops', 1.125).body.rotation).toBeCloseTo(-8, 12);
    expect(pose('oops', 1.5).body).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    expect(pose('oops', 0.82 * 1.5).body).toMatchObject({ scaleX: 1, scaleY: 1 });
    expect(pose('oops', 0.92 * 1.5).body).toMatchObject({ scaleX: expect.closeTo(1.1, 12) as number, scaleY: expect.closeTo(0.9, 12) as number });
  });

  it('waveHi: the screen-right arm goes up, flaps twice in the first 60 %, holds and comes down', () => {
    expect(pose('waveHi', 0, 'front').armB.rotation).toBe(0);
    expect(pose('waveHi', 0.27, 'front').armB.rotation).toBeCloseTo(-138, 12);
    expect(pose('waveHi', 0.54, 'front').armB.rotation).toBeCloseTo(-102, 12);
    expect(pose('waveHi', 0.81, 'front').armB.rotation).toBeCloseTo(-138, 12);
    expect(pose('waveHi', 1.08, 'front').armB.rotation).toBeCloseTo(-110, 12);
    expect(pose('waveHi', 1.5, 'front').armB.rotation).toBeCloseTo(-110, 12);
    expect(pose('waveHi', 1.8, 'front').armB.rotation).toBe(0);
    // The side view has no screen-right arm to spare (`armB` is the hidden pushing arm): the near arm waves.
    // and it goes further (−165° instead of −110°), because in the side view the arm swings forward.
    expect(pose('waveHi', 0.27, 'side').armA.rotation).toBeCloseTo(-193, 12);
    expect(pose('waveHi', 0.27, 'side').armB.rotation).toBe(0);
    expect(pose('waveHi', 0.27, 'front-34').armB.rotation).toBeCloseTo(-138, 12);
  });

  it('dizzy has no tracks yet (the stars and the sway wait for their art)', () => {
    for (const family of FAMILIES) expect(CLIPS.dizzy[family].tracks).toEqual([]);
  });

  it('reduced motion: no jump, no shake; the squash holds at 1.06 × 0.94 and the raised arm at −110° (−165° in the side view)', () => {
    for (const t of SAMPLES) {
      for (const name of ['eureka', 'oops'] as const) {
        expect(pose(name, t, 'side', true).body, `${name} ${t}`).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1.06, scaleY: 0.94 });
        expect(pose(name, t, 'side', true).footA.y, `${name} ${t}`).toBe(0);
        expect(pose(name, t, 'side', true).footB.y, `${name} ${t}`).toBe(0);
      }
      expect(pose('waveHi', t, 'front', true).armB.rotation, `${t}`).toBe(-110);
      expect(pose('waveHi', t, 'side', true).armA.rotation, `${t}`).toBe(-165);
    }
  });

  describe('layered over the act clip', () => {
    const over = (clip: (typeof CLIP_NAMES)[number], t: number, reaction: ReactionLayer | null, view: BeanView = 'front', time = 0) =>
      samplePose({ clip, t, time, view, reducedMotion: false, reaction });

    it('replaces only the channels it names, for the groups allowed', () => {
      const act = pose('walk', 0.14, 'front');
      const waving = over('walk', 0.14, { kind: 'waveHi', t: 0.27, groups: ['face', 'effect', 'arms'] });
      expect(waving.armB.rotation).toBeCloseTo(-138, 12);
      expect({ ...waving, armB: act.armB }).toEqual(act);
    });

    it('skips a group the act does not allow', () => {
      const act = pose('walk', 0.14, 'front');
      expect(over('walk', 0.14, { kind: 'waveHi', t: 0.27, groups: ['face', 'effect'] })).toEqual(act);
      // Eureka!'s body jump is skipped; only its effect (the bulb on `fxHead`) plays.
      const eureka = over('walk', 0.14, { kind: 'eureka', t: 0.63, groups: ['face', 'effect', 'arms'] });
      expect({ ...eureka, fxHead: act.fxHead }).toEqual(act);
      expect(over('walk', 0.14, { kind: 'eureka', t: 0.63, groups: ['face', 'arms'] })).toEqual(act);
    });

    it('the body part plays over a still bean: the feet leave the ground with the body, and the blink is left alone', () => {
      const jumping = over('idle', 0, { kind: 'eureka', t: 0.63, groups: ['body'] }, 'front', 3.76);
      expect(jumping.body.y).toBeCloseTo(-46, 12);
      expect(jumping.footA.y).toBeCloseTo(-46, 12);
      expect(jumping.footB.y).toBeCloseTo(-46, 12);
      expect(jumping.eyes.scaleY).toBeCloseTo(0.1, 12);
      // Only the feet's height changes: their x stays the idle pose's.
      expect(jumping.footA.x).toBe(pose('idle', 0, 'front').footA.x);
    });

    it('the wave keeps the screen-right arm in the mirrored front-34 view: the near arm, rotated the other way', () => {
      const wave = (view: BeanView, mirrored: boolean) =>
        samplePose({ clip: 'idle', t: 0, time: 0, view, mirrored, reducedMotion: false, reaction: { kind: 'waveHi', t: 0.27, groups: ['arms'] } });
      expect(wave('front-34', false).armB.rotation).toBeCloseTo(-138, 12);
      expect(wave('front-34', false).armA.rotation).toBe(0);
      expect(wave('front-34', true).armA.rotation).toBeCloseTo(138, 12);
      expect(wave('front-34', true).armB.rotation).toBe(0);
      // Other views are not swapped: the symmetric front and back, the side view's near arm, and
      // back-34 (where the swap swings the arm across the back).
      for (const view of ['front', 'back', 'back-34'] as const) expect(wave(view, true).armB.rotation, view).toBeCloseTo(-138, 12);
      expect(wave('side', true).armA.rotation).toBeCloseTo(-193, 12);
      expect(wave('side', true).armB.rotation).toBe(0);
    });

    it('reduced motion keeps the raised arm on the screen-right side of the mirrored front-34 view too', () => {
      const still = samplePose({ clip: 'idle', t: 0, time: 0, view: 'front-34', mirrored: true, reducedMotion: true, reaction: { kind: 'waveHi', t: 0.27, groups: ['arms'] } });
      expect(still.armA.rotation).toBe(110);
      expect(still.armB.rotation).toBe(0);
    });

    it('no reaction: the same pose as before', () => {
      expect(over('walk', 0.3, null)).toEqual(pose('walk', 0.3, 'front'));
    });

    it('reduced motion applies to the layer too', () => {
      const reduced = samplePose({ clip: 'idle', t: 0, time: 0, view: 'front', reducedMotion: true, reaction: { kind: 'waveHi', t: 0.27, groups: ['arms'] } });
      expect(reduced.armB.rotation).toBe(-110);
    });
  });
});

describe('choosing a reaction from sim state', () => {
  const free = () => new Sim<HubState, HubCommand>(createHubScenario(), 1).state;
  const withReaction = (kind: ReactionKind, patch: Partial<HubState['bean']> = {}): HubState => {
    const s = free();
    s.bean.reaction = { kind, since: 30 };
    Object.assign(s.bean, patch);
    return s;
  };

  it('null when nothing runs', () => {
    expect(chooseReaction(free(), 1)).toBeNull();
  });

  it('seconds into the reaction from its start tick, and the groups the table allows', () => {
    const layer = chooseReaction(withReaction('eureka'), 1);
    expect(layer).toMatchObject({ kind: 'eureka', groups: ['face', 'effect', 'body'] });
    expect(layer?.t).toBeCloseTo(0.5, 12);
    expect(chooseReaction(withReaction('eureka'), 0.25)?.t).toBe(0);
  });

  it('the body part only plays while the bean stands still on the ground', () => {
    expect(chooseReaction(withReaction('oops', { vx: 2.4 }), 1)?.groups).toEqual(['face', 'effect']);
    expect(chooseReaction(withReaction('oops', { grounded: false }), 1)?.groups).toEqual(['face', 'effect']);
  });

  it('the wave keeps its arm in every act that leaves it free, and not while pushing', () => {
    expect(chooseReaction(withReaction('waveHi', { vx: 2.4 }), 1)?.groups).toContain('arms');
    const riding: HubAct = { kind: 'riding', cart: 'light', since: 10 };
    expect(chooseReaction(withReaction('waveHi', { act: riding }), 1)?.groups).toContain('arms');
    const pushing: HubAct = { kind: 'pushing', cart: 'light', dir: 1, run: false };
    expect(chooseReaction(withReaction('waveHi', { act: pushing }), 1)?.groups).toEqual(['face', 'effect']);
  });
});
