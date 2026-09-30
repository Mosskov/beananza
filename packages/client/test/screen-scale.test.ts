import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/config';
import { MAX_RENDER_SCALE, MIN_RENDER_SCALE, canvasSizeFor, onRenderScale, renderScale, renderScaleFor } from '../src/screen-scale';

describe('renderScaleFor', () => {
  it('is 1 at the layout size with a device pixel ratio of 1', () => {
    expect(renderScaleFor(GAME_WIDTH, GAME_HEIGHT, 1)).toBe(1);
  });

  it('is the fit scale times the device pixel ratio (the cases from docs/TOPICS.md)', () => {
    expect(renderScaleFor(1920, 1080, 1)).toBeCloseTo(1.5, 10);
    // 1920×1080 at 150% Windows scaling: 1280×720 CSS pixels, 1.5 device pixels each.
    expect(renderScaleFor(1280, 720, 1.5)).toBeCloseTo(1.5, 10);
    expect(renderScaleFor(2560, 1440, 1)).toBeCloseTo(2, 10);
  });

  it('fits the smaller side, so a tall or wide window is not oversized', () => {
    expect(renderScaleFor(1920, 720, 1)).toBe(1);
    expect(renderScaleFor(1280, 1440, 1)).toBe(1);
  });

  it('is capped for weak devices and floored for small phones', () => {
    expect(renderScaleFor(3840, 2160, 1)).toBe(MAX_RENDER_SCALE);
    expect(renderScaleFor(1280, 720, 4)).toBe(MAX_RENDER_SCALE);
    expect(renderScaleFor(320, 180, 1)).toBe(MIN_RENDER_SCALE);
  });

  it('falls back to 1 for a collapsed parent or a bad ratio', () => {
    expect(renderScaleFor(0, 0, 1)).toBe(1);
    expect(renderScaleFor(1280, 720, 0)).toBe(1);
    expect(renderScaleFor(Number.NaN, 720, 1)).toBe(1);
  });
});

describe('canvasSizeFor', () => {
  it('is the layout size times k, in whole pixels', () => {
    expect(canvasSizeFor(1)).toEqual({ width: 1280, height: 720 });
    expect(canvasSizeFor(1.5)).toEqual({ width: 1920, height: 1080 });
    expect(canvasSizeFor(2.25)).toEqual({ width: 2880, height: 1620 });
    expect(canvasSizeFor(1.3333)).toEqual({ width: 1707, height: 960 });
  });
});

describe('onRenderScale', () => {
  it('calls back with the current k at once and stops when asked', () => {
    const seen: number[] = [];
    const stop = onRenderScale((k) => seen.push(k));
    expect(seen).toEqual([renderScale()]);
    stop();
  });
});
