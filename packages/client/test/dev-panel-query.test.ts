import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK } from '@beananza/shared';
import { panelQuery, type PanelChoice } from '../src/dev-panel-query';

const choice = (over: Partial<PanelChoice>): PanelChoice => ({ scene: 'hub', layout: '', look: DEFAULT_LOOK, paused: false, ...over });
const query = (current: string, over: Partial<PanelChoice>) => panelQuery(new URLSearchParams(current), choice(over), 'hub');

describe('panelQuery', () => {
  it('leaves out the defaults', () => {
    expect(query('', {})).toBe('');
  });

  it('writes the panel options, with the layout only for the hub', () => {
    expect(query('', { layout: 'carts', paused: true })).toBe('?layout=carts&paused=1');
    expect(query('', { scene: 'bean', layout: 'carts' })).toBe('?scene=bean');
    expect(query('', { look: { ...DEFAULT_LOOK, colour: 'blue', headwear: 'bow' } })).toMatch(/^\?look=blue,[a-z,-]*bow/);
  });

  it("keeps the clip sheet's clip, views and phases while it stays on the clip scene", () => {
    expect(query('?scene=clip&clip=walk&views=front,side&phases=4', { scene: 'clip', paused: true })).toBe(
      '?scene=clip&paused=1&clip=walk&views=front,side&phases=4',
    );
  });

  it("drops a scene's own options when the scene changes", () => {
    expect(query('?scene=clip&clip=walk&phases=4', { scene: 'bean' })).toBe('?scene=bean');
    expect(query('?scene=clip&clip=walk', {})).toBe('');
  });

  it('replaces the panel options it owns instead of repeating them', () => {
    expect(query('?scene=clip&paused=1&look=blue&clip=run', { scene: 'clip' })).toBe('?scene=clip&clip=run');
  });
});
