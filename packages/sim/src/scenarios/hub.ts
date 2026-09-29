import { BoxShape, ChainShape, CircleShape, World, type Body } from 'planck';
import type { Scenario } from '../sim';
import { FIXED_DT, ticksToSeconds } from '../time';
import { EARTH_GRAVITY } from '../constants';
import { CART_HALF_LENGTH, stepRail } from '../rail';
import { cartInteraction } from '../interactions/cart';
import type { HubInteraction, HubStep } from '../interactions/types';
import {
  CART_HALF_DEPTH,
  DEFAULT_PLAZA,
  HUB_BEAN_RADIUS_M,
  HUB_JUMP_SPEED,
  HUB_RUN_SPEED,
  HUB_STUCK_STEPS,
  HUB_WALK_SPEED,
  actWalks,
  clampTarget,
  type HubBean,
  type HubCommand,
  type HubOptions,
  type HubRailState,
  type HubState,
  type PlazaLayout,
  type RailLayout,
} from './hub-world';

export * from './hub-world';

/**
 * The hub plaza, seen from ¾ top-down (D1). Coordinates (D15): the ground plane is x east and
 * y north, in metres; z is height above the ground, and gravity pulls along −z. How that is
 * projected onto the screen is the client's business.
 *
 * Ground movement goes through Planck.js (D4, hub only): the bean is a circle that the walkable
 * area's edges and the props' footprints stop. Jumps are not in Planck: z is integrated
 * exactly, the same way as the drop, so a timed jump gives textbook numbers (D16).
 *
 * Carts on the east-west rail move in the exact 1D rail sim (`rail.ts`, D4, D19). In Planck
 * they are only kinematic boxes, so the bean bumps into them.
 *
 * What the bean does with things (pushing a cart, riding one) is its interaction state,
 * `bean.act` (D21), owned by one module per interaction (`../interactions/`). This file runs
 * the world and calls the modules in a fixed order.
 */

/** The interaction modules, in the order they are offered commands and run. */
const INTERACTIONS: readonly HubInteraction[] = [cartInteraction];

const ownerOf = (kind: HubBean['act']['kind']) => INTERACTIONS.find((m) => m.acts.includes(kind));

/** A step counts as blocked if it made less than this share of the intended progress. */
const STUCK_PROGRESS = 0.25;
/** Collisions kept in the state for logs and checks. */
const COLLISION_LOG = 16;
/** Closer than this to a tap target counts as arrived (m). */
const ARRIVE_EPSILON = 1e-6;
/**
 * A blocked step this close to the target also counts as arrived (m): Planck's 0.01 m contact
 * skin plus its 0.005 m slop keep the bean from reaching a target set right against an edge,
 * a corner or a prop, and that should not have to wait out the stuck timer.
 */
const ARRIVE_BLOCKED_M = 0.02;

/**
 * The Planck world for a layout. The sim state stays authoritative and plain JSON: every step
 * copies the bean's position and velocity in and reads them back out. Warm starting is off, so
 * no solver impulses carry over between steps and a step depends only on the state.
 */
function buildWorld(layout: PlazaLayout): { world: World; bean: Body; carts: Map<string, Body> } {
  const world = new World({ gravity: { x: 0, y: 0 }, warmStarting: false, allowSleep: false });
  const w = layout.walkable;
  const edges = world.createBody();
  edges.createFixture(
    new ChainShape(
      [
        { x: w.minX, y: w.minY },
        { x: w.maxX, y: w.minY },
        { x: w.maxX, y: w.maxY },
        { x: w.minX, y: w.maxY },
      ],
      true,
    ),
    { friction: 0 },
  );
  for (const prop of layout.props) {
    const body = world.createBody({ position: { x: prop.x, y: prop.y } });
    body.createFixture(new BoxShape(prop.halfWidth, prop.halfDepth), { friction: 0 });
  }
  // Carts are kinematic: the rail sim moves them, Planck only makes the bean bump into them.
  const carts = new Map<string, Body>();
  for (const c of layout.rail?.carts ?? []) {
    const body = world.createKinematicBody({ position: { x: c.x, y: layout.rail?.y ?? 0 } });
    body.createFixture(new BoxShape(CART_HALF_LENGTH, CART_HALF_DEPTH), { friction: 0 });
    carts.set(c.id, body);
  }
  const bean = world.createDynamicBody({ position: layout.start, fixedRotation: true, allowSleep: false });
  bean.createFixture(new CircleShape(HUB_BEAN_RADIUS_M), { density: 1, friction: 0, restitution: 0 });
  return { world, bean, carts };
}

/**
 * Exact vertical motion under constant gravity, with the touchdown solved inside the step
 * (same method as the drop scenario).
 */
function stepHeight(bean: HubBean, g: number, tick: number): void {
  if (bean.grounded) return;
  const dt = FIXED_DT;
  const z = bean.z + bean.vz * dt - 0.5 * g * dt * dt;
  if (z > 0) {
    bean.z = z;
    bean.vz -= g * dt;
    if (bean.lastJump) bean.lastJump.peakZ = Math.max(bean.lastJump.peakZ, z);
    return;
  }
  const tau = (bean.vz + Math.sqrt(bean.vz * bean.vz + 2 * g * bean.z)) / g;
  if (bean.lastJump) bean.lastJump.landedAt = ticksToSeconds(tick) + tau;
  bean.z = 0;
  bean.vz = 0;
  bean.grounded = true;
}

function initialBean(start: { x: number; y: number }): HubBean {
  return {
    x: start.x,
    y: start.y,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: true,
    facingX: 0,
    facingY: -1, // towards the camera
    target: null,
    stuckSteps: 0,
    jumps: 0,
    lastJump: null,
    act: { kind: 'free' },
  };
}

function initialRail(rail: RailLayout | null): HubRailState | null {
  if (!rail) return null;
  return { carts: rail.carts.map((c) => ({ id: c.id, mass: c.mass, riderMass: 0, x: c.x, v: 0 })), collisions: [], riders: [] };
}

/** One scenario instance per Sim: it owns that sim's Planck world. */
export function createHubScenario(options: HubOptions = {}): Scenario<HubState, HubCommand> {
  const layout: PlazaLayout = structuredCloneLayout(options.layout ?? DEFAULT_PLAZA);
  if (options.start) layout.start = { ...options.start };
  const gravity = options.gravity ?? EARTH_GRAVITY;
  const { world, bean: body, carts: cartBodies } = buildWorld(layout);

  return {
    name: 'hub',
    init: () => ({
      layout,
      gravity,
      input: { x: 0, y: 0, run: false },
      bean: initialBean(layout.start),
      rail: initialRail(layout.rail),
    }),
    step(state, commands) {
      const bean = state.bean;
      const step: HubStep = { state, time: ticksToSeconds(state.tick) };
      for (const c of commands) {
        // Commands will one day arrive over the network: drop any with non-finite numbers.
        if ((c.type === 'move' || c.type === 'moveTo') && !(Number.isFinite(c.x) && Number.isFinite(c.y))) continue;
        if (INTERACTIONS.some((m) => m.command(step, c))) continue;
        if (c.type === 'move') {
          state.input = { x: c.x, y: c.y, run: c.run };
        } else if (c.type === 'moveTo') {
          bean.target = clampTarget(state.layout.walkable, c.x, c.y);
          bean.stuckSteps = 0;
        } else if (c.type === 'jump' && bean.grounded) {
          bean.grounded = false;
          bean.vz = HUB_JUMP_SPEED;
          bean.jumps += 1;
          bean.lastJump = { startedAt: ticksToSeconds(state.tick), landedAt: null, peakZ: 0 };
        }
      }

      // Desired ground velocity. Held keys win over a tap target and cancel it.
      const speed = state.input.run ? HUB_RUN_SPEED : HUB_WALK_SPEED;
      let vx = 0;
      let vy = 0;
      let targetDistance = 0;
      let intended = 0;
      const held = Math.hypot(state.input.x, state.input.y);
      if (held > 0) {
        bean.target = null;
        bean.stuckSteps = 0;
        // Normalise so diagonals are no faster; partial stick input moves proportionally slower.
        const scale = held > 1 ? speed / held : speed;
        vx = state.input.x * scale;
        vy = state.input.y * scale;
      } else if (bean.target) {
        const dx = bean.target.x - bean.x;
        const dy = bean.target.y - bean.y;
        targetDistance = Math.hypot(dx, dy);
        intended = Math.min(speed * FIXED_DT, targetDistance);
        if (targetDistance > 0) {
          // On the last step, arrive exactly instead of overshooting.
          const v = intended / FIXED_DT;
          vx = (dx / targetDistance) * v;
          vy = (dy / targetDistance) * v;
        }
      }
      // An interaction that holds the bean (riding, a hop) takes it off its feet.
      if (!actWalks(bean.act)) {
        vx = 0;
        vy = 0;
        bean.target = null;
      }
      for (const m of INTERACTIONS) m.drive?.(step, { vx, vy });
      const act = bean.act;
      const walks = actWalks(act);

      // Carts first, in the exact 1D rail sim, with the bean's push if it walks into an end.
      const railLayout = state.layout.rail;
      const railY = railLayout?.y ?? 0;
      const carts = state.rail?.carts ?? [];
      const push = act.kind === 'pushing' ? { cart: act.cart, dir: act.dir, run: act.run } : null;
      const cartsBefore = carts.map((c) => c.x);
      if (railLayout && state.rail) {
        // A bean standing on the rail (not riding, not the one pushing) stops carts that roll
        // into it; pushing, it only ever touches the end it pushes away from itself.
        const onRail = walks && Math.abs(bean.y - railY) < CART_HALF_DEPTH + HUB_BEAN_RADIUS_M;
        const obstacle = onRail ? { lo: bean.x - HUB_BEAN_RADIUS_M, hi: bean.x + HUB_BEAN_RADIUS_M } : null;
        const hits = stepRail(railLayout, carts, push, ticksToSeconds(state.tick), FIXED_DT, obstacle);
        if (hits.length) state.rail.collisions = [...state.rail.collisions, ...hits].slice(-COLLISION_LOG);
      }
      // Each kinematic cart body sweeps from where it was to where the rail put it, so Planck
      // shoves the bean out of its way.
      carts.forEach((c, i) => {
        const from = cartsBefore[i] ?? c.x;
        cartBodies.get(c.id)?.setTransform({ x: from, y: railY }, 0);
        cartBodies.get(c.id)?.setLinearVelocity({ x: (c.x - from) / FIXED_DT, y: 0 });
      });

      // Ground motion and collisions (Planck), from the state, only while the bean walks
      // freely. Every other act (pushing, riding) places the bean itself.
      body.setActive(act.kind === 'free');
      body.setTransform({ x: bean.x, y: bean.y }, 0);
      body.setLinearVelocity({ x: vx, y: vy });
      body.setAwake(true);
      world.step(FIXED_DT, 8, 3);
      for (const c of carts) {
        cartBodies.get(c.id)?.setTransform({ x: c.x, y: railY }, 0);
        cartBodies.get(c.id)?.setLinearVelocity({ x: 0, y: 0 });
      }
      const owner = ownerOf(act.kind);
      if (owner) {
        owner.place(step);
      } else {
        const p = body.getPosition();
        const v = body.getLinearVelocity();
        bean.x = p.x;
        bean.y = p.y;
        bean.vx = v.x;
        bean.vy = v.y;
      }

      // Facing: the act's own rule, or the direction of ground movement (kept while idle).
      const facing = owner ? owner.facing(step) : vx !== 0 || vy !== 0 ? { x: vx / Math.hypot(vx, vy), y: vy / Math.hypot(vx, vy) } : null;
      if (facing) {
        bean.facingX = facing.x;
        bean.facingY = facing.y;
      }

      // Tap target: arrived, making progress, or stuck.
      if (bean.target) {
        const remaining = Math.hypot(bean.target.x - bean.x, bean.target.y - bean.y);
        if (remaining <= ARRIVE_EPSILON) {
          bean.target = null;
          bean.stuckSteps = 0;
        } else if (!push && targetDistance - remaining < STUCK_PROGRESS * intended) {
          bean.stuckSteps += 1;
          if (remaining <= ARRIVE_BLOCKED_M || bean.stuckSteps >= HUB_STUCK_STEPS) {
            bean.target = null;
            bean.stuckSteps = 0;
          }
        } else {
          bean.stuckSteps = 0;
        }
      }

      if (actWalks(bean.act)) stepHeight(bean, state.gravity, state.tick);
    },
  };
}

function structuredCloneLayout(layout: PlazaLayout): PlazaLayout {
  return {
    walkable: { ...layout.walkable },
    props: layout.props.map((p) => ({ ...p })),
    start: { ...layout.start },
    rail: layout.rail ? { ...layout.rail, carts: layout.rail.carts.map((c) => ({ ...c })) } : null,
  };
}
