import { describe, expect, it } from 'vitest';
import { Sim, createHubScenario, type HubCommand, type HubState } from '@beananza/sim';
import { HEAVY_PUSH_KG, presentAct } from '../src/scenes/hub-presentation';

const state = () => new Sim<HubState, HubCommand>(createHubScenario(), 1).state;

describe('hub presentation table (one row per interaction state)', () => {
  it('free: ground clips, on the ground, with a shadow and the cart stand-off', () => {
    expect(presentAct({ kind: 'free' }, state())).toEqual({
      clip: null,
      shows: [],
      placement: { kind: 'ground' },
      shadow: true,
      standOffCarts: true,
    });
  });

  it('pushing: the push clip (heavy from 10 kg), the far arm shows', () => {
    const s = state();
    expect(s.rail!.carts.map((c) => c.mass >= HEAVY_PUSH_KG)).toEqual([false, true]);
    const light = presentAct({ kind: 'pushing', cart: 'light', dir: 1, run: false }, s);
    expect(light).toMatchObject({ clip: 'push', shows: ['arm-far-push'], placement: { kind: 'ground' }, standOffCarts: true });
    expect(presentAct({ kind: 'pushing', cart: 'heavy', dir: -1, run: true }, s).clip).toBe('pushHeavy');
  });

  it('riding: idle, in the cart, no shadow, no stand-off', () => {
    expect(presentAct({ kind: 'riding', cart: 'light' }, state())).toEqual({
      clip: 'idle',
      shows: [],
      placement: { kind: 'cart', cart: 'light' },
      shadow: false,
      standOffCarts: false,
    });
  });
});
