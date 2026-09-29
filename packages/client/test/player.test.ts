import { describe, expect, it } from 'vitest';
import { BLINK, CLIPS, CLIP_NAMES, LAND_DURATION, familyOf } from '../src/rig/clips';
import { chooseClip, samplePose, type BeanMotion } from '../src/rig/player';
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

  it('land for LAND_DURATION after the exact touchdown, then back to the ground clips', () => {
    const landed = { ...still, lastJump: { startedAt: 1, landedAt: 1.7914 } };
    expect(chooseClip(landed, 1.8, g).clip).toBe('land');
    expect(chooseClip(landed, 1.8, g).t).toBeCloseTo(0.0086, 12);
    expect(chooseClip(landed, 1.7914 + LAND_DURATION, g).clip).toBe('idle');
    expect(chooseClip({ ...landed, vx: 2.4 }, 1.95, g).clip).toBe('walk');
  });
});
