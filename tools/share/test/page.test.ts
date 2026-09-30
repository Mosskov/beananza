import { describe, expect, it } from 'vitest';
import { HUB_LAYOUT_NAMES } from '@beananza/sim';
import { PLAY_YARDS } from '../src/page';

describe('play pickers', () => {
  it('lists every hub layout but the default one (the island), so the M1 plaza is a yard now', () => {
    expect(PLAY_YARDS.map((y) => y.layout)).toEqual(HUB_LAYOUT_NAMES.filter((n) => n !== 'island'));
    expect(PLAY_YARDS).toContainEqual({ layout: 'plaza', label: 'Plaza' });
    expect(PLAY_YARDS).toContainEqual({ layout: 'bench', label: 'Bench' });
    expect(PLAY_YARDS).toContainEqual({ layout: 'carts', label: 'Carts' });
  });
});
