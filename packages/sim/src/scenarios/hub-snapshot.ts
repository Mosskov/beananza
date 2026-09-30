import { createRng } from '../rng';
import type { RailCart } from '../rail';
import type { HubAct, HubBean, HubState, PlazaLayout } from './hub-world';

/**
 * The hub as the M2 server sends it (D5): what clients need to draw every bean and cart, and
 * nothing they do not (tap targets, stuck counters, logs). Numbers are rounded to 0.1 mm or
 * 1 mm/s, which keeps messages small; clients only draw them, the server's sim stays exact.
 */
export interface HubSnapshot {
  tick: number;
  beans: SnapshotBean[];
  carts: RailCart[];
}

export interface SnapshotBean {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Facing (a unit vector on the ground). */
  fx: number;
  fy: number;
  grounded: boolean;
  /** Take-off and touchdown times of the last jump (s), for the jump, fall and land clips. */
  jump: { startedAt: number; landedAt: number | null } | null;
  act: HubAct;
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const r3 = (v: number) => Math.round(v * 1e3) / 1e3;

/** Every fractional number in an act (positions, waypoints) rounded to 0.1 mm; ticks stay whole. */
function roundAct(act: HubAct): HubAct {
  return JSON.parse(JSON.stringify(act, (_key, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? r4(v) : v))) as HubAct;
}

export function snapshotHub(state: HubState): HubSnapshot {
  return {
    tick: state.tick,
    beans: state.beans.map((b) => ({
      id: b.id,
      x: r4(b.x),
      y: r4(b.y),
      z: r4(b.z),
      vx: r3(b.vx),
      vy: r3(b.vy),
      vz: r3(b.vz),
      fx: r4(b.facingX),
      fy: r4(b.facingY),
      grounded: b.grounded,
      jump: b.lastJump ? { startedAt: r4(b.lastJump.startedAt), landedAt: b.lastJump.landedAt === null ? null : r4(b.lastJump.landedAt) } : null,
      act: roundAct(b.act),
    })),
    carts: (state.rail?.carts ?? []).map((c) => ({ id: c.id, mass: c.mass, riderMass: c.riderMass, x: r4(c.x), v: r3(c.v) })),
  };
}

/** A bean as a client draws it: the snapshot's fields, and neutral values for the rest. */
function beanFromSnapshot(s: SnapshotBean): HubBean {
  return {
    id: s.id,
    input: { x: 0, y: 0, run: false },
    x: s.x,
    y: s.y,
    z: s.z,
    vx: s.vx,
    vy: s.vy,
    vz: s.vz,
    grounded: s.grounded,
    facingX: s.fx,
    facingY: s.fy,
    target: null,
    stuckSteps: 0,
    jumps: 0,
    lastJump: s.jump ? { ...s.jump, peakZ: 0 } : null,
    act: s.act,
  };
}

/**
 * A hub state to draw, rebuilt from a snapshot and the layout (which the client already has, by
 * name). Only for drawing: it is never stepped.
 */
export function hubStateFromSnapshot(layout: PlazaLayout, gravity: number, snapshot: HubSnapshot): HubState {
  return {
    tick: snapshot.tick,
    rng: createRng(0),
    layout,
    gravity,
    beans: snapshot.beans.map(beanFromSnapshot),
    rail: layout.rail ? { carts: snapshot.carts.map((c) => ({ ...c })), collisions: [], riders: [] } : null,
  };
}
