import { describe, expect, it } from 'vitest';
import type { HubSnapshot } from '@beananza/sim';
import { RENDER_DELAY_MS, SnapshotBuffer } from '../src/net/snapshot-buffer';

const snap = (tick: number, x: number, cartX = 0): HubSnapshot => ({
  tick,
  beans: [{ id: 'a', x, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: -1, grounded: true, jump: null, act: { kind: 'free' } }],
  carts: [{ id: 'light', mass: 5, riderMass: 0, x: cartX, v: 0 }],
});
const TICK_MS = 1000 / 60;

describe('snapshot buffer (M2)', () => {
  it('draws nothing before the first snapshot', () => {
    expect(new SnapshotBuffer().frame(0)).toBeNull();
  });

  it('draws RENDER_DELAY_MS behind the server, between the two snapshots around that moment', () => {
    const buf = new SnapshotBuffer();
    // Snapshots every 4 ticks (15 Hz), arriving exactly on time.
    for (let tick = 0; tick <= 40; tick += 4) buf.push(snap(tick, tick * 0.1, tick * 0.01), tick * TICK_MS);
    const now = 40 * TICK_MS;
    const f = buf.frame(now)!;
    const expected = 40 - (RENDER_DELAY_MS / 1000) * 60; // 34 ticks
    expect(f.tick).toBeCloseTo(expected, 9);
    expect(f.snapshot.tick).toBe(36);
    const bean = f.snapshot.beans[0]!;
    expect(f.beanAt(bean).x).toBeCloseTo(expected * 0.1, 9);
    expect(f.cartAt(f.snapshot.carts[0]!)).toBeCloseTo(expected * 0.01, 9);
  });

  it('holds the newest snapshot when the next one is late', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 0), 0);
    buf.push(snap(4, 1), 4 * TICK_MS);
    const f = buf.frame(1000)!; // a second later, nothing new
    expect(f.snapshot.tick).toBe(4);
    expect(f.beanAt(f.snapshot.beans[0]!).x).toBe(1);
  });

  it('ignores a snapshot older than the newest (out of order)', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(8, 2), 8 * TICK_MS);
    buf.push(snap(4, 1), 9 * TICK_MS);
    expect(buf.latest?.tick).toBe(8);
  });

  it('draws a bean that just joined where it is', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 0), 0);
    const joined: HubSnapshot = { ...snap(4, 1), beans: [...snap(4, 1).beans, { ...snap(4, 5).beans[0]!, id: 'b' }] };
    buf.push(joined, 4 * TICK_MS);
    const f = buf.frame(4 * TICK_MS + RENDER_DELAY_MS + TICK_MS * 2)!;
    const b = f.snapshot.beans.find((q) => q.id === 'b')!;
    expect(f.beanAt(b).x).toBe(5);
  });

  it('smooths an uneven arrival instead of jumping', () => {
    const buf = new SnapshotBuffer();
    for (let tick = 0; tick <= 40; tick += 4) buf.push(snap(tick, tick), tick * TICK_MS);
    const before = buf.renderTick(40 * TICK_MS)!;
    buf.push(snap(44, 44), 44 * TICK_MS + 80); // 80 ms late
    const after = buf.renderTick(40 * TICK_MS)!;
    expect(before - after).toBeGreaterThan(0);
    expect(before - after).toBeLessThan((80 / TICK_MS) * 0.2);
  });
});
