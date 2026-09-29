import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAZA,
  HUB_BEAN_RADIUS_M,
  SEAT_ARC_M,
  SEAT_HOP_S,
  SIT_REACH_M,
  STAND_ARC_M,
  STAND_HOP_S,
  Sim,
  createHubScenario,
  createRng,
  rngNext,
  seatSpot,
  standSpot,
  type HubAct,
  type HubCommand,
  type HubOptions,
  type HubState,
  type PlazaLayout,
} from '../src';

const newHub = (options: HubOptions = {}) => new Sim<HubState, HubCommand>(createHubScenario(options), 1);
const bench = DEFAULT_PLAZA.benches[0]!;
const [west, east] = bench.seats as [(typeof bench.seats)[0], (typeof bench.seats)[0]];
const hopZ = (p: number, from: number, to: number, arc: number) => from + (to - from) * p + 4 * arc * p * (1 - p);
const move = (x: number, y: number, run = false): HubCommand => ({ type: 'move', x, y, run });
type Kind = HubAct['kind'];

function until(sim: Sim<HubState, HubCommand>, kind: Kind, max = 600): number {
  let n = 0;
  while (sim.state.bean.act.kind !== kind && n < max) {
    sim.step();
    n += 1;
  }
  expect(sim.state.bean.act.kind).toBe(kind);
  return n;
}

/** A bean at `start` that presses E and ends up seated. */
function seated(start = { x: -3.6, y: 0 }) {
  const sim = newHub({ start });
  sim.enqueue({ type: 'action' });
  sim.step();
  until(sim, 'sitting');
  return sim;
}

describe('the bench (D24)', () => {
  it('is 1.6 × 0.45 m at (−3.6, 1.2), seat 0.30 m high, seats 0.4 m either side of the centre', () => {
    expect(bench).toMatchObject({ x: -3.6, y: 1.2, halfWidth: 0.8, halfDepth: 0.225, seatHeight: 0.3 });
    expect(bench.seats.map((q) => q.dx)).toEqual([-0.4, 0.4]);
    // Stand spots are just clear of the bench's front, in front of each seat.
    expect(standSpot(bench, west).x).toBeCloseTo(-4, 12);
    expect(standSpot(bench, west).y).toBeCloseTo(bench.y - bench.halfDepth - HUB_BEAN_RADIUS_M - 0.05, 12);
  });

  it('is solid: walking into it from the south stops at its front', () => {
    const sim = newHub({ start: { x: -3.6, y: -0.5 } });
    sim.enqueue(move(0, 1));
    sim.stepTo(2);
    const front = bench.y - bench.halfDepth;
    expect(sim.state.bean.y).toBeLessThan(front - HUB_BEAN_RADIUS_M + 0.006);
    expect(sim.state.bean.y).toBeGreaterThan(front - HUB_BEAN_RADIUS_M - 0.02);
    expect(sim.state.bean.act.kind).toBe('free');
  });

  it('E near a free seat walks to its stand spot, then hops on in 0.35 s (arc 0.26 m) and sits facing the camera', () => {
    const sim = newHub({ start: { x: -3.6, y: 0 } });
    sim.enqueue({ type: 'action' });
    sim.step();
    // Nearest stand spot: both are 0.4 m along, so the first (west) wins the tie.
    expect(sim.state.bean.act).toMatchObject({ kind: 'approaching', bench: 'bench', seat: 'west', via: [] });
    expect(sim.state.bean.target).toEqual(standSpot(bench, west));
    until(sim, 'seating');
    const act = sim.state.bean.act as Extract<HubAct, { kind: 'seating' }>;
    expect(act.endTick - act.startTick).toBe(Math.round(SEAT_HOP_S * 60)); // 21 steps
    expect(Math.hypot(act.fromX - standSpot(bench, west).x, act.fromY - standSpot(bench, west).y)).toBeLessThan(0.021);
    const on = seatSpot(bench, west);
    while (sim.state.bean.act.kind === 'seating') {
      sim.step();
      const p = Math.min(1, (sim.tick - act.startTick) / (act.endTick - act.startTick));
      expect(sim.state.bean.z).toBeCloseTo(hopZ(p, 0, bench.seatHeight, SEAT_ARC_M), 12);
      expect(sim.state.bean.x).toBeCloseTo(act.fromX + (on.x - act.fromX) * p, 12);
      expect([sim.state.bean.facingX, sim.state.bean.facingY]).toEqual([0, -1]);
    }
    expect(sim.state.bean.act).toEqual({ kind: 'sitting', bench: 'bench', seat: 'west', since: act.endTick });
    expect(sim.tick).toBe(act.endTick);
    expect([sim.state.bean.x, sim.state.bean.y, sim.state.bean.z]).toEqual([on.x, on.y, bench.seatHeight]);
    // It stays seated while nothing is pressed.
    sim.stepTo(sim.tick / 60 + 10);
    expect(sim.state.bean.act.kind).toBe('sitting');
    expect([sim.state.bean.x, sim.state.bean.y, sim.state.bean.z]).toEqual([on.x, on.y, bench.seatHeight]);
  });

  it('E farther than 1.3 m from every stand spot does nothing', () => {
    const spot = standSpot(bench, east);
    const sim = newHub({ start: { x: spot.x + SIT_REACH_M + 0.05, y: spot.y } });
    sim.enqueue({ type: 'action' });
    sim.step();
    expect(sim.state.bean.act.kind).toBe('free');
    expect(sim.state.bean.target).toBeNull();
  });

  it('Priya takes the east seat, so E and taps always lead to the west seat', () => {
    expect(bench.seats.map((q) => [q.id, q.taken ?? false])).toEqual([
      ['west', false],
      ['east', true],
    ]);
    const spot = standSpot(bench, east);
    const sim = newHub({ start: { x: spot.x, y: spot.y - 0.3 } });
    sim.enqueue({ type: 'action' });
    sim.step();
    expect(sim.state.bean.act).toMatchObject({ kind: 'approaching', seat: 'west' });
  });

  it('a tap on the bench from anywhere walks to the nearest free seat and sits', () => {
    const free: PlazaLayout = { ...DEFAULT_PLAZA, benches: [{ ...bench, seats: bench.seats.map((q) => ({ ...q, taken: false })) }] };
    const sim = newHub({ layout: free, start: { x: 1, y: -1 } });
    sim.enqueue({ type: 'use', id: 'bench' });
    sim.step();
    expect(sim.state.bean.act).toMatchObject({ kind: 'approaching', seat: 'east' });
    until(sim, 'sitting');
    expect(sim.state.bean.x).toBeCloseTo(seatSpot(bench, east).x, 12);
    const withPriya = newHub({ start: { x: 1, y: -1 } });
    withPriya.enqueue({ type: 'use', id: 'bench' });
    withPriya.step();
    expect(withPriya.state.bean.act).toMatchObject({ kind: 'approaching', seat: 'west' });
    // Unknown ids are ignored.
    const other = newHub({ start: { x: 1, y: -1 } });
    other.enqueue({ type: 'use', id: 'fountain' });
    other.step();
    expect(other.state.bean.act.kind).toBe('free');
  });

  it.each([
    ['behind it, west', -4, 1.8],
    ['behind it, middle', -3.6, 1.8],
    ['on its row, east', -2.5, 1.2],
    ['behind it, east', -2.3, 1.6],
    ['behind it, far west', -5.2, 1.6],
  ])('a tap from %s walks around the bench and sits (review round 1)', (_name, x, y) => {
    const sim = newHub({ start: { x, y } });
    sim.enqueue({ type: 'use', id: 'bench' });
    sim.step();
    until(sim, 'sitting', 600);
    expect(sim.state.bean.act).toMatchObject({ seat: 'west' });
  });

  it('a jump on the way to the seat drops the walk there', () => {
    const sim = newHub({ start: { x: -3.6, y: -1 } });
    sim.enqueue({ type: 'use', id: 'bench' });
    sim.step();
    sim.enqueue({ type: 'jump' });
    sim.step();
    expect(sim.state.bean.act.kind).toBe('free');
    expect(sim.state.bean.target).toBeNull();
  });

  it('skips a taken seat, and does nothing when every seat is taken', () => {
    const withTaken = (taken: string[]): PlazaLayout => ({
      ...DEFAULT_PLAZA,
      benches: [{ ...bench, seats: bench.seats.map((q) => ({ ...q, taken: taken.includes(q.id) })) }],
    });
    const sim = newHub({ layout: withTaken(['west']), start: { x: -4, y: 0.2 } });
    sim.enqueue({ type: 'action' });
    sim.step();
    expect(sim.state.bean.act).toMatchObject({ kind: 'approaching', seat: 'east' });
    const full = newHub({ layout: withTaken(['west', 'east']), start: { x: -4, y: 0.2 } });
    full.enqueue({ type: 'action' });
    full.enqueue({ type: 'use', id: 'bench' });
    full.step();
    expect(full.state.bean.act.kind).toBe('free');
  });

  it.each([
    ['a held key', move(1, 0)],
    ['E', { type: 'action' } as HubCommand],
    ['Space', { type: 'jump' } as HubCommand],
    ['a tap on the bench', { type: 'use', id: 'bench' } as HubCommand],
  ])('%s stands the bean up: a 0.30 s hop (arc 0.26 m) down to the stand spot', (_name, command) => {
    const sim = seated();
    sim.enqueue(command);
    sim.step();
    const act = sim.state.bean.act as Extract<HubAct, { kind: 'standing' }>;
    expect(act.kind).toBe('standing');
    expect(act.endTick - act.startTick).toBe(Math.round(STAND_HOP_S * 60)); // 18 steps
    expect(sim.state.bean.z).toBeCloseTo(hopZ(1 / 18, bench.seatHeight, 0, STAND_ARC_M), 12);
    until(sim, 'free');
    expect(sim.tick).toBe(act.endTick);
    const spot = standSpot(bench, west);
    expect(sim.state.bean.z).toBe(0);
    expect(sim.state.bean.x).toBeCloseTo(spot.x, 12);
    expect(sim.state.bean.y).toBeCloseTo(spot.y, 12);
    expect(sim.state.bean.jumps).toBe(0);
  });

  it('keeps walking after standing up: a held key moves on, a tap target is walked to', () => {
    const held = seated();
    held.enqueue(move(1, 0));
    held.step();
    until(held, 'free');
    const x0 = held.state.bean.x;
    held.stepTo(held.tick / 60 + 0.5);
    expect(held.state.bean.x).toBeCloseTo(x0 + 1.2, 6);

    const tapped = seated();
    tapped.enqueue({ type: 'moveTo', x: -2, y: -1 });
    tapped.step();
    expect(tapped.state.bean.act).toMatchObject({ kind: 'standing', then: { x: -2, y: -1 } });
    until(tapped, 'free');
    expect(tapped.state.bean.target).toEqual({ x: -2, y: -1 });
    tapped.stepTo(tapped.tick / 60 + 2);
    expect([tapped.state.bean.x, tapped.state.bean.y]).toEqual([-2, -1]);
  });

  it('ignores E, Space and taps while hopping on or off', () => {
    const sim = newHub({ start: { x: -3.6, y: 0 } });
    sim.enqueue({ type: 'action' });
    sim.step();
    until(sim, 'seating');
    const quiet = newHub({ start: { x: -3.6, y: 0 } });
    quiet.state = sim.snapshot();
    for (let i = 0; i < 15; i++) {
      sim.enqueue(i % 3 === 0 ? { type: 'action' } : i % 3 === 1 ? { type: 'jump' } : { type: 'use', id: 'bench' });
      sim.step();
      quiet.step();
    }
    expect(sim.state).toEqual(quiet.state);
  });

  it('a held key or a new tap cancels the walk to the seat; so does getting stuck', () => {
    const held = newHub({ start: { x: -3.6, y: -1 } });
    held.enqueue({ type: 'action' });
    held.step();
    held.enqueue(move(0, -1));
    held.step();
    expect(held.state.bean.act.kind).toBe('free');

    const tap = newHub({ start: { x: -3.6, y: -1 } });
    tap.enqueue({ type: 'use', id: 'bench' });
    tap.step();
    tap.enqueue({ type: 'moveTo', x: 0, y: 0 });
    tap.step();
    expect(tap.state.bean.act.kind).toBe('free');
    expect(tap.state.bean.target).toEqual({ x: 0, y: 0 });

    // A box on the west stand spot: the bean cannot reach it, gives up and does not sit.
    const spot = standSpot(bench, west);
    const layout: PlazaLayout = { ...DEFAULT_PLAZA, props: [...DEFAULT_PLAZA.props, { id: 'crate', x: spot.x, y: spot.y, halfWidth: 0.2, halfDepth: 0.2 }] };
    const stuck = newHub({ layout, start: { x: -4.4, y: -1 } });
    stuck.enqueue({ type: 'use', id: 'bench' });
    stuck.step();
    expect(stuck.state.bean.act).toMatchObject({ kind: 'approaching', seat: 'west' });
    stuck.stepTo(5);
    expect(stuck.state.bean.act.kind).toBe('free');
  });

  it('restores a mid-hop snapshot into a fresh scenario and carries on identically', () => {
    const sim = newHub({ start: { x: -3.6, y: 0 } });
    sim.enqueue({ type: 'action' });
    sim.step();
    until(sim, 'seating');
    sim.step();
    const restored = newHub();
    restored.state = sim.snapshot();
    for (const s of [sim, restored]) {
      s.stepTo(s.tick / 60 + 6);
      s.enqueue({ type: 'moveTo', x: 0, y: -1 });
      s.stepTo(s.tick / 60 + 3);
    }
    expect(restored.state).toEqual(sim.state);
    expect(sim.state.bean.act.kind).toBe('free');
  });

  it('is deterministic over 10,000 steps of sitting, standing, taps and walking near the bench', () => {
    const play = () => {
      const sim = newHub({ start: { x: -3, y: 0 } });
      const rng = createRng(11);
      let sat = 0;
      for (let i = 0; i < 10_000; i++) {
        if (i % 40 === 0) {
          const r = rngNext(rng);
          if (r < 0.3) sim.enqueue({ type: 'action' });
          else if (r < 0.45) sim.enqueue({ type: 'use', id: 'bench' });
          else if (r < 0.6) sim.enqueue(move(r < 0.52 ? 1 : -1, r < 0.56 ? 0.5 : -0.5));
          else if (r < 0.7) sim.enqueue({ type: 'moveTo', x: -3 + (r - 0.65) * 20, y: (r - 0.65) * 10 });
          else if (r < 0.8) sim.enqueue({ type: 'jump' });
          else sim.enqueue(move(0, 0));
        }
        sim.step();
        if (sim.state.bean.act.kind === 'sitting') sat += 1;
      }
      return { state: sim.snapshot(), sat };
    };
    const first = play();
    expect(play()).toEqual(first);
    expect(first.sat).toBeGreaterThan(300);
  });
});
