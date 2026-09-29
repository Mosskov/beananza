import {
  HUB_BEAN_RADIUS_M,
  actWalks,
  clampTarget,
  type BenchSpec,
  type HubAct,
  type HubState,
  type SeatSpec,
} from '../scenarios/hub-world';
import { hopHeight, hopProgress, lerp, ticksFor } from './hop';
import type { HubInteraction, HubStep } from './types';

/**
 * The bench (D24, DESIGN.md §7): tap it, or press E near it, and the bean walks to a free
 * seat's stand spot and hops on. Seated, it faces the camera; the client draws its feet
 * swinging and, after a while, a doze. Any movement input, E or Space stands it up again.
 */

/** E sits down when a free seat's stand spot is this close (m). */
export const SIT_REACH_M = 1.3;
/** The hop onto the seat (s) and its arc (m), and the hop back down. */
export const SEAT_HOP_S = 0.35;
export const SEAT_ARC_M = 0.26;
export const STAND_HOP_S = 0.3;
export const STAND_ARC_M = 0.26;
/** The client draws the bean dozing after sitting this long (s). */
export const DOZE_AFTER_S = 5;
/** A stand spot is this far in front of the bench's footprint (m), clear of it. */
const STAND_GAP_M = 0.05;
/** Reaching the stand spot within this distance (m) counts (Planck's contact skin, as for taps). */
const ARRIVE_M = 0.021;

type BenchAct = Extract<HubAct, { kind: 'approaching' | 'seating' | 'sitting' | 'standing' }>;

/** Where a bean stands to get on this seat: in front (south) of the bench, clear of it. */
export function standSpot(bench: BenchSpec, seat: SeatSpec): { x: number; y: number } {
  return { x: bench.x + seat.dx, y: bench.y - bench.halfDepth - HUB_BEAN_RADIUS_M - STAND_GAP_M };
}

/** Where a seated bean is on the ground plane (its height is the bench's seat height). */
export function seatSpot(bench: BenchSpec, seat: SeatSpec): { x: number; y: number } {
  return { x: bench.x + seat.dx, y: bench.y + bench.seatDy };
}

function find(state: HubState, act: BenchAct): { bench: BenchSpec; seat: SeatSpec } | null {
  const bench = state.layout.benches.find((b) => b.id === act.bench);
  const seat = bench?.seats.find((q) => q.id === act.seat);
  return bench && seat ? { bench, seat } : null;
}

/** The free seat whose stand spot is nearest the bean, on one bench or any. */
function nearestSeat(state: HubState, benchId?: string): { bench: BenchSpec; seat: SeatSpec; distance: number } | null {
  let best: { bench: BenchSpec; seat: SeatSpec; distance: number } | null = null;
  for (const bench of state.layout.benches) {
    if (benchId !== undefined && bench.id !== benchId) continue;
    for (const seat of bench.seats) {
      if (seat.taken) continue;
      const spot = standSpot(bench, seat);
      const distance = Math.hypot(state.bean.x - spot.x, state.bean.y - spot.y);
      if (!best || distance < best.distance) best = { bench, seat, distance };
    }
  }
  return best;
}

/** Waypoints are this far clear of the bench's ends (m), like the stand spots are of its front. */
const ROUTE_GAP_M = 0.05;

/**
 * Waypoints from the bean to a stand spot around the bench: none from in front of it; from
 * behind or beside it, out past the nearer end on the bean's row, then down to the stand spots'
 * row, so the straight legs never cross the bench.
 */
function route(state: HubState, bench: BenchSpec, spot: { x: number; y: number }): { x: number; y: number }[] {
  const bean = state.bean;
  const front = bench.y - bench.halfDepth - HUB_BEAN_RADIUS_M;
  if (bean.y <= front) return [];
  const side = bean.x < bench.x ? -1 : 1;
  const outside = bench.x + side * (bench.halfWidth + HUB_BEAN_RADIUS_M + ROUTE_GAP_M);
  const endX = side < 0 ? Math.min(bean.x, outside) : Math.max(bean.x, outside);
  const legs = [clampTarget(state.layout.walkable, endX, bean.y), clampTarget(state.layout.walkable, endX, spot.y)];
  return legs.filter((p) => Math.hypot(p.x - bean.x, p.y - bean.y) > ARRIVE_M);
}

/** Walk to the seat's stand spot (tap targets); `settle` starts the hop on when it arrives. */
function approach(state: HubState, bench: BenchSpec, seat: SeatSpec): void {
  const bean = state.bean;
  const stand = standSpot(bench, seat);
  const spot = clampTarget(state.layout.walkable, stand.x, stand.y);
  const [to = spot, ...via] = [...route(state, bench, spot), spot];
  bean.act = { kind: 'approaching', bench: bench.id, seat: seat.id, to, via };
  bean.target = to;
  bean.stuckSteps = 0;
}

/** Start the hop back down to the stand spot; a tap target, if any, is walked to after it. */
function standUp(state: HubState, act: Extract<BenchAct, { kind: 'sitting' }>, then: { x: number; y: number } | null): void {
  const startTick = state.tick;
  state.bean.act = { kind: 'standing', bench: act.bench, seat: act.seat, startTick, endTick: startTick + ticksFor(STAND_HOP_S), then };
}

export const benchInteraction: HubInteraction = {
  name: 'bench',
  acts: ['approaching', 'seating', 'sitting', 'standing'],

  command({ state }: HubStep, command) {
    const bean = state.bean;
    const act = bean.act;
    const benchUse = command.type === 'use' && state.layout.benches.some((b) => b.id === command.id);
    if (act.kind === 'seating' || act.kind === 'standing') {
      // Mid-hop: only held keys count (the bean walks on once it lands).
      return command.type !== 'move';
    }
    if (act.kind === 'sitting') {
      if (command.type === 'action' || command.type === 'jump' || benchUse) {
        standUp(state, act, null);
        return true;
      }
      if (command.type === 'moveTo') {
        standUp(state, act, clampTarget(state.layout.walkable, command.x, command.y));
        return true;
      }
      return false; // `move`: the hub keeps the held input, and `drive` stands the bean up.
    }
    if (!actWalks(act) || !bean.grounded) return false;
    if (benchUse && command.type === 'use') {
      const seat = nearestSeat(state, command.id);
      if (seat) approach(state, seat.bench, seat.seat);
      return true;
    }
    if (command.type === 'action') {
      const seat = nearestSeat(state);
      if (!seat || seat.distance > SIT_REACH_M) return false;
      approach(state, seat.bench, seat.seat);
      return true;
    }
    // A new tap or a jump means the bean no longer heads for the seat (a jump also drops the
    // walk there; a tap sets its own target).
    if (act.kind === 'approaching' && (command.type === 'moveTo' || command.type === 'jump')) {
      bean.act = { kind: 'free' };
      if (command.type === 'jump') bean.target = null;
    }
    return false;
  },

  drive({ state }: HubStep) {
    const bean = state.bean;
    const held = state.input.x !== 0 || state.input.y !== 0;
    if (!held) return;
    // Any movement input stands a seated bean up, and cancels the walk to a seat.
    if (bean.act.kind === 'sitting') standUp(state, bean.act, null);
    else if (bean.act.kind === 'approaching') bean.act = { kind: 'free' };
  },

  place({ state }: HubStep) {
    const bean = state.bean;
    const act = bean.act as BenchAct;
    if (act.kind === 'approaching') return; // walking: Planck placed the bean
    const found = find(state, act);
    if (!found) {
      bean.act = { kind: 'free' };
      bean.z = 0;
      return;
    }
    const { bench, seat } = found;
    const on = seatSpot(bench, seat);
    bean.vx = 0;
    bean.vy = 0;
    if (act.kind === 'seating') {
      const p = hopProgress(state.tick, act.startTick, act.endTick);
      bean.x = lerp(act.fromX, on.x, p);
      bean.y = lerp(act.fromY, on.y, p);
      bean.z = hopHeight(p, 0, bench.seatHeight, SEAT_ARC_M);
      if (p === 1) bean.act = { kind: 'sitting', bench: act.bench, seat: act.seat, since: state.tick + 1 };
    } else if (act.kind === 'sitting') {
      bean.x = on.x;
      bean.y = on.y;
      bean.z = bench.seatHeight;
    } else {
      const spot = standSpot(bench, seat);
      const p = hopProgress(state.tick, act.startTick, act.endTick);
      bean.x = lerp(on.x, spot.x, p);
      bean.y = lerp(on.y, spot.y, p);
      bean.z = hopHeight(p, bench.seatHeight, 0, STAND_ARC_M);
      if (p < 1) return;
      bean.z = 0;
      bean.act = { kind: 'free' };
      bean.target = act.then;
      bean.stuckSteps = 0;
    }
  },

  facing({ state }: HubStep) {
    // Seated (and hopping on or off), the bean faces the camera; walking over, it faces its way.
    return state.bean.act.kind === 'approaching' ? null : { x: 0, y: -1 };
  },

  settle({ state }: HubStep) {
    const bean = state.bean;
    const act = bean.act;
    if (act.kind !== 'approaching' || bean.target) return;
    // A leg of the walk ended: stuck short of its end, give up; at a waypoint, walk the next leg;
    // at the stand spot, the hop on starts next step.
    if (!find(state, act) || Math.hypot(bean.x - act.to.x, bean.y - act.to.y) > ARRIVE_M) {
      bean.act = { kind: 'free' };
      return;
    }
    const [next, ...via] = act.via;
    if (next) {
      bean.target = next;
      bean.stuckSteps = 0;
      bean.act = { ...act, to: next, via };
      return;
    }
    const startTick = state.tick + 1;
    bean.act = { kind: 'seating', bench: act.bench, seat: act.seat, startTick, endTick: startTick + ticksFor(SEAT_HOP_S), fromX: bean.x, fromY: bean.y };
  },
};
