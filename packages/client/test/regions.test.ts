import { describe, expect, it } from 'vitest';
import { REGION_IDS } from '@beananza/sim';
import { REGION_STYLES, hubUrl, isRegionId, regionUrl } from '../src/scenes/regions';

describe('regions (D2)', () => {
  it('has a style for every region, with distinct portal colours', () => {
    expect(Object.keys(REGION_STYLES).sort()).toEqual([...REGION_IDS].sort());
    expect(new Set(REGION_IDS.map((r) => REGION_STYLES[r].portal)).size).toBe(REGION_IDS.length);
  });

  it('knows region ids', () => {
    expect(isRegionId('waves')).toBe(true);
    expect(isRegionId('Waves')).toBe(false);
    expect(isRegionId(null)).toBe(false);
  });

  it('travels to a region keeping the look, dropping the hub and tool parameters', () => {
    const url = new URL(regionUrl('http://localhost:5180/?scene=hub&layout=island&paused=1&look=blue,bow&from=storm', 'waves'));
    expect(url.searchParams.get('scene')).toBe('region');
    expect(url.searchParams.get('region')).toBe('waves');
    expect(url.searchParams.get('look')).toBe('blue,bow');
    for (const gone of ['layout', 'paused', 'from']) expect(url.searchParams.has(gone)).toBe(false);
  });

  it('comes back to the hub in front of the region portal', () => {
    const url = new URL(hubUrl('http://localhost:5180/?scene=region&region=mechanics&look=teal', 'mechanics'));
    expect(url.searchParams.get('scene')).toBe('hub');
    expect(url.searchParams.get('from')).toBe('mechanics');
    expect(url.searchParams.get('look')).toBe('teal');
    expect(url.searchParams.has('region')).toBe(false);
  });
});
