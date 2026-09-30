import { clampTarget, type HubBean, type HubState, type PortalSpec } from '../scenarios/hub-world';
import { hopHeight, hopProgress, lerp, ticksFor } from './hop';
import type { ActRules, HubInteraction, HubStep } from './types';

/**
 * Region portals (D2): standing rings on the sky island, one per region. Walk into a portal's
 * ring, tap it, or press E near it: the bean floats into the swirl (`entering`) and is then
 * `gone` to that region, which the client (and in M2 the server) turns into leaving the hub. A
 * locked portal (Crystal Caves) bounces the bean back out (`refused`): no text, only its drawing
 * says it is closed (docs/IMPLEMENTATION.md §7). Portals are not solid: the bean walks into them.
 */

/** The regions, in the order DESIGN.md §3 lists them. */
export const REGION_IDS = ['mechanics', 'waves', 'storm', 'crystal'] as const;
export type RegionId = (typeof REGION_IDS)[number];

/** A grounded, walking bean whose centre comes this close to a portal's centre goes in (m). */
export const PORTAL_RING_M = 0.3;
/** E heads for the nearest portal when its centre is this close (m). */
export const PORTAL_REACH_M = 1.6;
/** Floating into the swirl (s), rising this high (m) with this arc (m) on top. */
export const ENTER_S = 0.6;
export const ENTER_RISE_M = 0.5;
export const ENTER_ARC_M = 0.15;
/** Bounced back out of a locked portal (s), this far south (m), with this arc (m). */
export const REFUSED_S = 0.45;
export const REFUSED_BACK_M = 0.7;
export const REFUSED_ARC_M = 0.35;
/** Coming back from a region, the bean appears this far south of the portal's centre (m). */
export const PORTAL_EXIT_M = 1.2;

/** What the bean does with a portal (D21). */
export type PortalAct =
  /** Floating from where it touched the ring into the swirl. */
  | { kind: 'entering'; portal: string; startTick: number; endTick: number; fromX: number; fromY: number }
  /** In the region: the client leaves the hub for it (in M2 the server drops the bean). */
  | { kind: 'gone'; portal: string; region: RegionId; since: number }
  /** Bounced back out of a locked portal. */
  | { kind: 'refused'; portal: string; startTick: number; endTick: number; fromX: number; fromY: number; toX: number; toY: number };

export type PortalActKind = PortalAct['kind'];

/** The portal holds the bean for all three: no walking, no Planck. */
export const PORTAL_ACTS: { readonly [K in PortalActKind]: ActRules } = {
  entering: { walks: false, usesPlanck: false },
  gone: { walks: false, usesPlanck: false },
  refused: { walks: false, usesPlanck: false },
};

/** Where a bean coming back from a portal's region appears: in front of (south of) the portal. */
export function portalExit(portal: PortalSpec): { x: number; y: number } {
  return { x: portal.x, y: portal.y - PORTAL_EXIT_M };
}

const find = (state: HubState, id: string) => state.layout.portals.find((p) => p.id === id);

/** Head for a portal's centre as a tap target; walking into the ring does the rest. */
function headFor(state: HubState, bean: HubBean, portal: PortalSpec): void {
  bean.target = clampTarget(state.layout.walkable, portal.x, portal.y);
  bean.stuckSteps = 0;
}

export const portalInteraction: HubInteraction = {
  name: 'portal',
  acts: PORTAL_ACTS,

  command({ state, bean, rules }: HubStep, command) {
    const act = bean.act;
    if (act.kind === 'gone') return true; // left the hub: nothing reaches the bean any more
    if (act.kind === 'entering' || act.kind === 'refused') return command.type !== 'move';
    if (!rules[act.kind].walks || !bean.grounded) return false;
    if (command.type === 'use') {
      const portal = find(state, command.id);
      if (!portal) return false;
      headFor(state, bean, portal);
      return true;
    }
    if (command.type === 'action') {
      let best: PortalSpec | null = null;
      let bestD = PORTAL_REACH_M;
      for (const p of state.layout.portals) {
        const d = Math.hypot(bean.x - p.x, bean.y - p.y);
        if (d <= bestD) {
          best = p;
          bestD = d;
        }
      }
      if (!best) return false;
      headFor(state, bean, best);
      return true;
    }
    return false;
  },

  place({ state, bean }: HubStep) {
    const act = bean.act as PortalAct;
    const portal = find(state, act.portal);
    if (!portal) {
      bean.act = { kind: 'free' };
      bean.z = 0;
      return;
    }
    bean.vx = 0;
    bean.vy = 0;
    if (act.kind === 'entering') {
      const p = hopProgress(state.tick, act.startTick, act.endTick);
      bean.x = lerp(act.fromX, portal.x, p);
      bean.y = lerp(act.fromY, portal.y, p);
      bean.z = hopHeight(p, 0, ENTER_RISE_M, ENTER_ARC_M);
      if (p === 1) bean.act = { kind: 'gone', portal: portal.id, region: portal.region, since: state.tick + 1 };
    } else if (act.kind === 'gone') {
      bean.x = portal.x;
      bean.y = portal.y;
      bean.z = ENTER_RISE_M;
    } else {
      const p = hopProgress(state.tick, act.startTick, act.endTick);
      bean.x = lerp(act.fromX, act.toX, p);
      bean.y = lerp(act.fromY, act.toY, p);
      bean.z = hopHeight(p, 0, 0, REFUSED_ARC_M);
      if (p < 1) return;
      bean.z = 0;
      bean.act = { kind: 'free' };
    }
  },

  facing({ bean }: HubStep) {
    // Into the swirl facing it (north); bounced back out, facing the camera.
    const kind = bean.act.kind;
    return kind === 'refused' ? { x: 0, y: -1 } : { x: 0, y: 1 };
  },

  settle({ state, bean }: HubStep) {
    if (bean.act.kind !== 'free' || !bean.grounded) return;
    for (const portal of state.layout.portals) {
      if (Math.hypot(bean.x - portal.x, bean.y - portal.y) >= PORTAL_RING_M) continue;
      const startTick = state.tick + 1;
      bean.target = null;
      bean.stuckSteps = 0;
      if (portal.locked) {
        const to = clampTarget(state.layout.walkable, portal.x, portal.y - REFUSED_BACK_M);
        bean.act = { kind: 'refused', portal: portal.id, startTick, endTick: startTick + ticksFor(REFUSED_S), fromX: bean.x, fromY: bean.y, toX: to.x, toY: to.y };
      } else {
        bean.act = { kind: 'entering', portal: portal.id, startTick, endTick: startTick + ticksFor(ENTER_S), fromX: bean.x, fromY: bean.y };
      }
      return;
    }
  },
};
