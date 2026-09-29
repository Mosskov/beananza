import { describe, expect, it } from 'vitest';
import { CART_FLOOR_M, DOZE_AFTER_S, SEAT_ARC_M, STAND_ARC_M, Sim, createHubScenario, type HubAct, type HubCommand, type HubState } from '@beananza/sim';
import { HEAVY_PUSH_KG, hopAt, presentAct } from '../src/scenes/hub-presentation';

const state = () => new Sim<HubState, HubCommand>(createHubScenario(), 1).state;
const boarding: HubAct = { kind: 'boarding', cart: 'light', startTick: 60, hopTick: 67, endTick: 93, fromX: -3, fromY: -2.7, arc: 0.6, facingX: 1, facingY: 0 };
const leaving: HubAct = { kind: 'leaving', cart: 'light', startTick: 120, endTick: 143, fromX: -2.1, fromY: -2.1, toX: -2.1, toY: -2.6, arc: 0.4 };

describe('hub presentation table (one row per interaction state)', () => {
  it('free: ground clips, on the ground, with a shadow and the cart stand-off', () => {
    expect(presentAct({ kind: 'free' }, state(), 2)).toEqual({
      clip: null,
      parts: {},
      placement: { kind: 'ground' },
      shadow: true,
      standOffCarts: 1,
      usingCart: null,
      flatZ: null,
    });
  });

  it('pushing: the push clip (heavy from 10 kg), the far arm shows', () => {
    const s = state();
    expect(s.rail!.carts.map((c) => c.mass >= HEAVY_PUSH_KG)).toEqual([false, true]);
    const light = presentAct({ kind: 'pushing', cart: 'light', dir: 1, run: false }, s, 2);
    expect(light).toMatchObject({ clip: { clip: 'push', t: 2 }, parts: { 'arm-far-push': true }, placement: { kind: 'ground' }, standOffCarts: 1 });
    expect(presentAct({ kind: 'pushing', cart: 'heavy', dir: -1, run: true }, s, 2).clip?.clip).toBe('pushHeavy');
  });

  it('boarding: crouch, jump up to the top of the hop, then fall into the cart (drawn in it from the top)', () => {
    const s = state();
    const at = (tick: number) => presentAct(boarding, s, tick / 60);
    expect(at(62)).toMatchObject({ clip: { clip: 'jump', t: 0, first: true }, placement: { kind: 'ground' }, shadow: true, standOffCarts: 1, usingCart: 'light', flatZ: 0 });
    // The draw-back from the cart's end fades out over the first half of the hop.
    expect(at(73).standOffCarts).toBeCloseTo(1 - 2 * (6 / 26), 12);
    expect(at(80).standOffCarts).toBe(0);
    expect(at(70).clip?.clip).toBe('jump');
    expect(at(80).clip?.clip).toBe('fall');
    // In the cart (and masked by it) only once over it: not while still beside it (review round 1).
    s.bean.x = s.rail!.carts[0]!.x - 0.3;
    expect(at(80).placement).toEqual({ kind: 'cart', cart: 'light' });
    s.bean.x = s.rail!.carts[0]!.x - 0.5;
    expect(at(80).placement).toEqual({ kind: 'ground' });
    expect(at(93).flatZ).toBeCloseTo(CART_FLOOR_M, 12);
    expect(hopAt(80 / 60, 67, 93)).toBeCloseTo(0.5, 12);
  });

  it('riding: a landing squash, then idle; in the cart, no shadow, no stand-off', () => {
    const s = state();
    const riding: HubAct = { kind: 'riding', cart: 'light', since: 93 };
    expect(presentAct(riding, s, 94 / 60).clip).toMatchObject({ clip: 'land', first: true });
    expect(presentAct(riding, s, 3)).toEqual({
      clip: { clip: 'idle', t: 3 },
      parts: {},
      placement: { kind: 'cart', cart: 'light' },
      shadow: false,
      standOffCarts: 0,
      usingCart: 'light',
      flatZ: null,
    });
  });

  it('leaving: in the cart until the top of the hop, then on the ground; flat height from the floor down', () => {
    const s = state();
    expect(presentAct(leaving, s, 121 / 60).placement).toEqual({ kind: 'cart', cart: 'light' });
    expect(presentAct(leaving, s, 140 / 60).placement).toEqual({ kind: 'ground' });
    expect(presentAct(leaving, s, 120 / 60).flatZ).toBeCloseTo(CART_FLOOR_M, 12);
    expect(presentAct(leaving, s, 143 / 60).flatZ).toBe(0);
  });

  it('approaching the bench: ordinary walking', () => {
    expect(presentAct({ kind: 'approaching', bench: 'bench', seat: 'west', to: { x: -4, y: 0.675 }, via: [] }, state(), 2)).toMatchObject({ clip: null, placement: { kind: 'ground' }, shadow: true });
  });

  it('seating and standing: a hop between the stand spot (p = 0) and the seat (p = 1), no shadow', () => {
    const s = state();
    const on = presentAct({ kind: 'seating', bench: 'bench', seat: 'west', startTick: 60, endTick: 81, fromX: -4, fromY: 0.675 }, s, 70 / 60);
    expect(on.placement).toMatchObject({ kind: 'seat', bench: 'bench', seat: 'west', arc: SEAT_ARC_M });
    expect((on.placement as { p: number }).p).toBeCloseTo(10 / 21, 12);
    expect(on.clip).toMatchObject({ clip: 'jump', first: true });
    expect(on.shadow).toBe(false);
    const off = presentAct({ kind: 'standing', bench: 'bench', seat: 'west', startTick: 60, endTick: 78, then: null }, s, 69 / 60);
    expect(off.placement).toMatchObject({ kind: 'seat', p: 0.5, arc: STAND_ARC_M });
  });

  it('sitting: a landing squash, then sit (feet swing), then dozing after 5 s with closed eyes and a "z"', () => {
    const s = state();
    const sitting: HubAct = { kind: 'sitting', bench: 'bench', seat: 'west', since: 60 };
    expect(presentAct(sitting, s, 61 / 60).clip?.clip).toBe('land');
    const awake = presentAct(sitting, s, 1 + 2);
    expect(awake).toMatchObject({ clip: { clip: 'sit', t: 2, first: true }, parts: {}, placement: { kind: 'seat', p: 1, arc: 0 } });
    expect(presentAct(sitting, s, 1 + DOZE_AFTER_S - 0.01).clip?.clip).toBe('sit');
    const dozing = presentAct(sitting, s, 1 + DOZE_AFTER_S + 0.5);
    expect(dozing.clip).toMatchObject({ clip: 'doze', first: true });
    expect(dozing.clip?.t).toBeCloseTo(0.5, 12);
    expect(dozing.parts).toEqual({ eyes: false, 'eyes-sleep': true, 'doze-z': true });
  });
});
