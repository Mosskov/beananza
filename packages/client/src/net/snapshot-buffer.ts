import { SIM_HZ, type HubSnapshot, type SnapshotBean } from '@beananza/sim';

/**
 * The server's snapshots, drawn a little in the past (M2): the client draws the hub RENDER_DELAY
 * behind the newest snapshot it can expect, and interpolates each bean and cart between the two
 * snapshots around that moment, so movement stays smooth although snapshots come 15 times a
 * second and arrive unevenly. Pure: it is given the local clock, so tests drive it exactly.
 */

/** How far behind the server's newest step the client draws (ms): a bit more than one snapshot gap. */
export const RENDER_DELAY_MS = 100;
/** Snapshots kept (a few seconds at 15 Hz). */
const KEEP = 32;
/** How quickly the estimate of the server's clock follows new arrivals (0..1 per snapshot). */
const CLOCK_SMOOTHING = 0.1;

export interface InterpolatedFrame {
  /** The snapshot whose acts, facings and carts are drawn (the later of the two). */
  snapshot: HubSnapshot;
  /** The server tick being drawn (fractional). */
  tick: number;
  /** Where to draw each bean (m), interpolated. */
  beanAt: (bean: { id: string; x: number; y: number; z: number }) => { x: number; y: number; z: number };
  /** Where to draw each cart along the rail (m), interpolated. */
  cartAt: (cart: { id: string; x: number }) => number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class SnapshotBuffer {
  private readonly snaps: HubSnapshot[] = [];
  /** Local time (ms) at which the server was at tick 0, as estimated from arrivals. */
  private base: number | null = null;

  get latest(): HubSnapshot | null {
    return this.snaps[this.snaps.length - 1] ?? null;
  }

  /** A snapshot arrived at local time `nowMs`. Older or repeated ticks are ignored. */
  push(snapshot: HubSnapshot, nowMs: number): void {
    const last = this.latest;
    if (last && snapshot.tick <= last.tick) return;
    this.snaps.push(snapshot);
    if (this.snaps.length > KEEP) this.snaps.shift();
    const candidate = nowMs - (snapshot.tick * 1000) / SIM_HZ;
    this.base = this.base === null ? candidate : this.base + (candidate - this.base) * CLOCK_SMOOTHING;
  }

  /** The server tick to draw at local time `nowMs`: the estimated current tick, RENDER_DELAY_MS back. */
  renderTick(nowMs: number): number | null {
    if (this.base === null) return null;
    return ((nowMs - this.base - RENDER_DELAY_MS) * SIM_HZ) / 1000;
  }

  frame(nowMs: number): InterpolatedFrame | null {
    const tick = this.renderTick(nowMs);
    const first = this.snaps[0];
    if (tick === null || !first) return null;
    // The two snapshots around `tick`; past either end, hold the nearest one.
    let a = first;
    let b = first;
    for (const s of this.snaps) {
      b = s;
      if (s.tick > tick) break;
      a = s;
    }
    const t = b.tick === a.tick ? 1 : Math.min(Math.max((tick - a.tick) / (b.tick - a.tick), 0), 1);
    const beansA = new Map<string, SnapshotBean>(a.beans.map((q) => [q.id, q]));
    const cartsA = new Map(a.carts.map((c) => [c.id, c.x]));
    return {
      snapshot: b,
      tick: Math.min(Math.max(tick, a.tick), b.tick),
      beanAt: (bean) => {
        const from = beansA.get(bean.id);
        if (!from) return { x: bean.x, y: bean.y, z: bean.z };
        return { x: lerp(from.x, bean.x, t), y: lerp(from.y, bean.y, t), z: lerp(from.z, bean.z, t) };
      },
      cartAt: (cart) => lerp(cartsA.get(cart.id) ?? cart.x, cart.x, t),
    };
  }
}
