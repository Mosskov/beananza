import { describe, expect, it } from 'vitest';
import { HUB_LAYOUT_NAMES } from '@beananza/sim';
import { PLAY_YARDS } from '../src/page';

describe('play pickers', () => {
  it('lists every hub test yard, and not the plaza', () => {
    expect(PLAY_YARDS.map((y) => y.layout)).toEqual(HUB_LAYOUT_NAMES.filter((n) => n !== 'plaza'));
    expect(PLAY_YARDS).toContainEqual({ layout: 'bench', label: 'Bench' });
    expect(PLAY_YARDS).toContainEqual({ layout: 'carts', label: 'Carts' });
  });
});
