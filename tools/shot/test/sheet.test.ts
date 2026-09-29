import { describe, expect, it } from 'vitest';
import { clipCrop, defaultCols, GAP, LABEL_H, layoutSheet, parseCrop, TITLE_H } from '../src/sheet-layout';
import { labelsFor, pngSize } from '../src/sheet';

describe('parseCrop', () => {
  it('reads x,y,w,h', () => {
    expect(parseCrop('10, 20,300,400')).toEqual({ x: 10, y: 20, w: 300, h: 400 });
  });
  it.each(['1,2,3', '1,2,0,4', 'a,b,c,d', '-1,0,5,5'])('rejects %s', (raw) => {
    expect(() => parseCrop(raw)).toThrow(/--crop/);
  });
});

describe('clipCrop', () => {
  it('is the whole image without a crop', () => {
    expect(clipCrop(null, { w: 1280, h: 720 })).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
  });
  it('clips a crop that runs off the image', () => {
    expect(clipCrop({ x: 1200, y: 700, w: 200, h: 200 }, { w: 1280, h: 720 })).toEqual({ x: 1200, y: 700, w: 80, h: 20 });
  });
});

describe('layoutSheet', () => {
  it('fills rows first, with every cell as big as the largest image', () => {
    const l = layoutSheet(
      [
        { w: 100, h: 50 },
        { w: 80, h: 60 },
        { w: 100, h: 50 },
      ],
      2,
      1,
      false,
    );
    expect(l.width).toBe(GAP + 2 * (100 + GAP));
    expect(l.height).toBe(GAP + 2 * (LABEL_H + 60 + GAP));
    expect(l.cells.map((c) => c.label)).toEqual([
      { x: GAP, y: GAP },
      { x: GAP + 100 + GAP, y: GAP },
      { x: GAP, y: GAP + LABEL_H + 60 + GAP },
    ]);
    expect(l.cells[1]?.image).toEqual({ x: GAP + 100 + GAP, y: GAP + LABEL_H, w: 80, h: 60 });
  });

  it('scales the images and leaves room for a title', () => {
    const l = layoutSheet([{ w: 1280, h: 720 }], 4, 0.5, true);
    expect(l.width).toBe(GAP + 640 + GAP);
    expect(l.height).toBe(TITLE_H + GAP + LABEL_H + 360 + GAP);
    expect(l.cells[0]?.image).toEqual({ x: GAP, y: TITLE_H + GAP + LABEL_H, w: 640, h: 360 });
  });

  it('never has more columns than images', () => {
    expect(layoutSheet([{ w: 10, h: 10 }], 4, 1, false).width).toBe(GAP + 10 + GAP);
  });

  it('needs an image', () => {
    expect(() => layoutSheet([], 2, 1, false)).toThrow();
  });
});

describe('defaultCols', () => {
  it('is close to square and at most 4', () => {
    expect([1, 2, 4, 5, 9, 30].map(defaultCols)).toEqual([1, 2, 2, 3, 3, 4]);
  });
});

describe('pngSize', () => {
  it('reads the IHDR size', () => {
    const png = Buffer.alloc(24);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
    png.writeUInt32BE(1280, 16);
    png.writeUInt32BE(720, 20);
    expect(pngSize(png)).toEqual({ w: 1280, h: 720 });
  });
  it('rejects other files', () => {
    expect(() => pngSize(Buffer.from('not a png at all, really not'))).toThrow(/not a PNG/);
  });
});

describe('labelsFor', () => {
  it('uses the path below the shared folder', () => {
    expect(labelsFor(['/s/hub-walk/a.png', '/s/hub-walk/b.png'])).toEqual(['a', 'b']);
    expect(labelsFor(['/s/hub-walk/a.png', '/s/hub-jump/apex.png'])).toEqual(['hub-walk/a', 'hub-jump/apex']);
    expect(labelsFor(['E:\\s\\hub-jump\\apex.png', 'E:\\s\\look-cream\\hub-jump\\apex.png'])).toEqual(['hub-jump/apex', 'look-cream/hub-jump/apex']);
  });
});
