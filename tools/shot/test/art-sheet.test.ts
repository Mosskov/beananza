import { describe, expect, it } from 'vitest';
import { artPathOf, zoomBox } from '../src/art-sheet';

describe('artPathOf', () => {
  it('maps a raw art import to its repo path, whatever the slashes and drive case', () => {
    expect(artPathOf('E:/bz/art/bean/front.svg?raw', 'E:\\bz')).toBe('art/bean/front.svg');
    expect(artPathOf('e:/bz/art/props/cart.svg?raw', 'E:\\bz')).toBe('art/props/cart.svg');
  });
  it('leaves everything else alone', () => {
    expect(artPathOf('E:/bz/art/bean/front.svg', 'E:\\bz')).toBeNull();
    expect(artPathOf('E:/bz/packages/client/src/main.ts?raw', 'E:\\bz')).toBeNull();
    expect(artPathOf('E:/bz/artwork/x.svg?raw', 'E:\\bz')).toBeNull();
  });
});

describe('zoomBox', () => {
  const size = { w: 2560, h: 1440 };
  it('grows a small change to the minimum, centred on it', () => {
    expect(zoomBox({ x: 1000, y: 500, w: 10, h: 10 }, size, 80, 400)).toEqual({ x: 805, y: 305, w: 400, h: 400 });
  });
  it('adds the margin to a large change', () => {
    expect(zoomBox({ x: 100, y: 100, w: 600, h: 300 }, size, 80, 400)).toEqual({ x: 20, y: 20, w: 760, h: 460 });
  });
  it('stays inside the image', () => {
    expect(zoomBox({ x: 2550, y: 1430, w: 10, h: 10 }, size, 80, 400)).toEqual({ x: 2160, y: 1040, w: 400, h: 400 });
    expect(zoomBox({ x: 0, y: 0, w: 2560, h: 1440 }, size, 80, 400)).toEqual({ x: 0, y: 0, w: 2560, h: 1440 });
  });
});
