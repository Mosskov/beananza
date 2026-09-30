import { BoxShape, ChainShape, CircleShape, World, type Body } from 'planck';
import type { Scenario } from '../sim';
import { FIXED_DT, ticksToSeconds } from '../time';
import { EARTH_GRAVITY } from '../constants';
import { CART_HALF_LENGTH, leaveCart, stepRail, type RailObstacle, type RailPush } from '../rail';
import { ACT_RULES, INTERACTIONS } from '../interactions';
import type { HubStep } from '../interactions/types';
import {
  CART_HALF_DEPTH,
  DEFAULT_PLAZA,
  HUB_BEAN_RADIUS_M,
  HUB_JUMP_SPEED,
  HUB_RUN_SPEED,
  HUB_STUCK_STEPS,
  HUB_WALK_SPEED,
  LOCAL_PLAYER,
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
 * The hub, seen from ¾ top-down (D1). Coordinates (D15): the ground plane is x east and y north,
 * in metres; z is height above the ground, and gravity pulls along −z. How that is projected
 * onto the screen is the client's business.
 *
 * Every bean in `state.beans` (one offline, a whole class on the M2 server) is stepped by the
 * same rules, in join order. Ground movement goes through Planck.js (D4, hub only): each bean is
 * a circle that the walkable area's edges and the props' footprints stop; beans pass through
 * each other, so a crowd can never block a portal, the bench or a cart. Jumps are not in Planck:
 * z is integrated exactly, the same way as the drop, so a timed jump gives textbook numbers (D16).
 *
 * Carts on the east-west rail move in the exact 1D rail sim (`rail.ts`, D4, D19). In Planck
 * they are only kinematic boxes, so beans bump into them.
 *
 * What a bean does with things (pushing a cart, riding one) is its interaction state,
 * `bean.act` (D21), owned by one module per interaction (`../interactions/`). This file runs
 * the world and calls the modules in a fixed order.
 */

const ownerOf = (kind: HubBean['act']['kind']) => INTERACTIONS.find((m) => kind in m.acts);

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
/** Beans share this negative collision group: Planck never makes them collide with each other. */
const BEAN_GROUP = -1;

/**
 * The Planck world for a layout. The sim state stays authoritative and plain JSON: every step
 * copies the beans' positions and velocities in and reads them back out. Warm starting is off,
 * so no solver impulses carry over between steps and a step depends only on the state.
 */
function buildWorld(layout: PlazaLayout): { world: World; carts: Map<string, Body> } {
  const world = new World({ gravity: { x: 0, y: 0 }, warmStarting: false, allowSleep: false });
  const edges = world.createBody();
  edges.createFixture(new ChainShape(layout.walkable.points.map((p) => ({ x: p.x, y: p.y })), true), { friction: 0 });
  // Props and benches are solid footprints.
  for (const prop of [...layout.props, ...layout.benches]) {
    const body = world.createBody({ position: { x: prop.x, y: prop.y } });
    body.createFixture(new BoxShape(prop.halfWidth, prop.halfDepth), { friction: 0 });
  }
  // Carts are kinematic: the rail sim moves them, Planck only makes beans bump into them.
  const carts = new Map<string, Body>();
  for (const c of layout.rail?.carts ?? []) {
    const body = world.createKinematicBody({ position: { x: c.x, y: layout.rail?.y ?? 0 } });
    body.createFixture(new BoxShape(CART_HALF_LENGTH, CART_HALF_DEPTH), { friction: 0 });
    carts.set(c.id, body);
  }
  return { world, carts };
}

function createBeanBody(world: World, at: { x: number; y: number }): Body {
  const body = world.createDynamicBody({ position: at, fixedRotation: true, allowSleep: false });
  body.createFixture(new CircleShape(HUB_BEAN_RADIUS_M), { density: 1, friction: 0, restitution: 0, filterGroupIndex: BEAN_GROUP });
  return body;
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

function initialBean(id: string, start: { x: number; y: number }): HubBean {
  return {
    id,
    input: { x: 0, y: 0, run: false },
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

/** A player's id: short, printable, and never a prototype key. */
const validPlayer = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);

/** What one bean wants this step, worked out before anything moves. */
interface Intent {
  bean: HubBean;
  step: HubStep;
  vx: number;
  vy: number;
  targetDistance: number;
  intended: number;
  pushing: boolean;
  usesPlanck: boolean;
}

/** One scenario instance per Sim: it owns that sim's Planck world. */
export function createHubScenario(options: HubOptions = {}): Scenario<HubState, HubCommand> {
  const layout: PlazaLayout = structuredCloneLayout(options.layout ?? DEFAULT_PLAZA);
  if (options.start) layout.start = { ...options.start };
  const gravity = options.gravity ?? EARTH_GRAVITY;
  const local = options.local ?? true;
  const { world, carts: cartBodies } = buildWorld(layout);
  /** Planck bodies by bean id, kept in step with `state.beans`. */
  const bodies = new Map<string, Body>();
  if (local) bodies.set(LOCAL_PLAYER, createBeanBody(world, layout.start));

  /** Give every bean a body and drop the bodies of beans that left. */
  function syncBodies(state: HubState): void {
    const ids = new Set(state.beans.map((b) => b.id));
    for (const [id, body] of bodies) {
      if (ids.has(id)) continue;
      world.destroyBody(body);
      bodies.delete(id);
    }
    for (const b of state.beans) if (!bodies.has(b.id)) bodies.set(b.id, createBeanBody(world, { x: b.x, y: b.y }));
  }

  return {
    name: 'hub',
    init: () => ({
      layout,
      gravity,
      beans: local ? [initialBean(LOCAL_PLAYER, layout.start)] : [],
      rail: initialRail(layout.rail),
    }),
    step(state, commands) {
      const time = ticksToSeconds(state.tick);
      const stepFor = (bean: HubBean): HubStep => ({ state, bean, time, rules: ACT_RULES });

      for (const c of commands) {
        // Commands arrive over the network in M2: drop any that are malformed.
        if (c.type === 'join') {
          if (!validPlayer(c.player) || state.beans.some((b) => b.id === c.player)) continue;
          const at = c.at && Number.isFinite(c.at.x) && Number.isFinite(c.at.y) ? clampTarget(state.layout.walkable, c.at.x, c.at.y) : state.layout.start;
          state.beans.push(initialBean(c.player, at));
          continue;
        }
        if (c.type === 'leave') {
          const bean = state.beans.find((b) => b.id === c.player);
          if (!bean) continue;
          // A rider leaves its cart as if it hopped out (momentum is conserved).
          if (bean.act.kind === 'riding') {
            const cartId = bean.act.cart;
            const cart = state.rail?.carts.find((k) => k.id === cartId);
            if (cart) leaveCart(cart);
          }
          state.beans = state.beans.filter((b) => b !== bean);
          continue;
        }
        if ((c.type === 'move' || c.type === 'moveTo') && !(Number.isFinite(c.x) && Number.isFinite(c.y))) continue;
        if (c.type === 'use' && typeof c.id !== 'string') continue;
        const bean = state.beans.find((b) => b.id === (c.player ?? LOCAL_PLAYER));
        if (!bean) continue;
        const step = stepFor(bean);
        if (INTERACTIONS.some((m) => m.command(step, c))) continue;
        if (c.type === 'move') {
          bean.input = { x: c.x, y: c.y, run: c.run };
        } else if (c.type === 'moveTo') {
          bean.target = clampTarget(state.layout.walkable, c.x, c.y);
          bean.stuckSteps = 0;
        } else if (c.type === 'jump' && bean.grounded) {
          bean.grounded = false;
          bean.vz = HUB_JUMP_SPEED;
          bean.jumps += 1;
          bean.lastJump = { startedAt: time, landedAt: null, peakZ: 0 };
        }
      }
      syncBodies(state);

      // Each bean's desired ground velocity. Held keys win over a tap target and cancel it.
      const intents: Intent[] = state.beans.map((bean) => {
        const step = stepFor(bean);
        const speed = bean.input.run ? HUB_RUN_SPEED : HUB_WALK_SPEED;
        let vx = 0;
        let vy = 0;
        let targetDistance = 0;
        let intended = 0;
        const held = Math.hypot(bean.input.x, bean.input.y);
        if (held > 0) {
          bean.target = null;
          bean.stuckSteps = 0;
          // Normalise so diagonals are no faster; partial stick input moves proportionally slower.
          const scale = held > 1 ? speed / held : speed;
          vx = bean.input.x * scale;
          vy = bean.input.y * scale;
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
        if (!ACT_RULES[bean.act.kind].walks) {
          vx = 0;
          vy = 0;
          bean.target = null;
        }
        for (const m of INTERACTIONS) m.drive?.(step, { vx, vy });
        const act = bean.act;
        return { bean, step, vx, vy, targetDistance, intended, pushing: act.kind === 'pushing', usesPlanck: ACT_RULES[act.kind].usesPlanck };
      });

      // Carts first, in the exact 1D rail sim, with the push of every bean walking into an end.
      const railLayout = state.layout.rail;
      const railY = railLayout?.y ?? 0;
      const carts = state.rail?.carts ?? [];
      const cartsBefore = carts.map((c) => c.x);
      if (railLayout && state.rail) {
        const pushes: RailPush[] = [];
        const obstacles: RailObstacle[] = [];
        for (const { bean } of intents) {
          const act = bean.act;
          if (act.kind === 'pushing') pushes.push({ cart: act.cart, dir: act.dir, run: act.run });
          // A bean standing on the rail (not riding) stops carts that roll into it; pushing, it
          // only ever touches the end it pushes away from itself.
          const onRail = ACT_RULES[act.kind].walks && Math.abs(bean.y - railY) < CART_HALF_DEPTH + HUB_BEAN_RADIUS_M;
          if (onRail) obstacles.push({ lo: bean.x - HUB_BEAN_RADIUS_M, hi: bean.x + HUB_BEAN_RADIUS_M });
        }
        const hits = stepRail(railLayout, carts, pushes, time, FIXED_DT, obstacles);
        if (hits.length) state.rail.collisions = [...state.rail.collisions, ...hits].slice(-COLLISION_LOG);
      }
      // Each kinematic cart body sweeps from where it was to where the rail put it, so Planck
      // shoves beans out of its way.
      carts.forEach((c, i) => {
        const from = cartsBefore[i] ?? c.x;
        cartBodies.get(c.id)?.setTransform({ x: from, y: railY }, 0);
        cartBodies.get(c.id)?.setLinearVelocity({ x: (c.x - from) / FIXED_DT, y: 0 });
      });

      // Ground motion and collisions (Planck), from the state, only for beans that walk freely.
      // Every other act (pushing, riding, hops) places the bean itself.
      for (const { bean, vx, vy, usesPlanck } of intents) {
        const body = bodies.get(bean.id);
        if (!body) continue;
        body.setActive(usesPlanck);
        body.setTransform({ x: bean.x, y: bean.y }, 0);
        body.setLinearVelocity({ x: vx, y: vy });
        body.setAwake(true);
      }
      world.step(FIXED_DT, 8, 3);
      for (const c of carts) {
        cartBodies.get(c.id)?.setTransform({ x: c.x, y: railY }, 0);
        cartBodies.get(c.id)?.setLinearVelocity({ x: 0, y: 0 });
      }

      for (const { bean, step, vx, vy, targetDistance, intended, pushing, usesPlanck } of intents) {
        const body = bodies.get(bean.id);
        if (usesPlanck && body) {
          const p = body.getPosition();
          const v = body.getLinearVelocity();
          bean.x = p.x;
          bean.y = p.y;
          bean.vx = v.x;
          bean.vy = v.y;
        }
        const owner = ownerOf(bean.act.kind);
        owner?.place(step);

        // Facing: the act's own rule, or else the direction of ground movement (kept while idle).
        const moving = vx !== 0 || vy !== 0;
        const facing = owner?.facing(step) ?? (moving ? { x: vx / Math.hypot(vx, vy), y: vy / Math.hypot(vx, vy) } : null);
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
          } else if (!pushing && targetDistance - remaining < STUCK_PROGRESS * intended) {
            bean.stuckSteps += 1;
            if (remaining <= ARRIVE_BLOCKED_M || bean.stuckSteps >= HUB_STUCK_STEPS) {
              bean.target = null;
              bean.stuckSteps = 0;
            }
          } else {
            bean.stuckSteps = 0;
          }
        }

        if (ACT_RULES[bean.act.kind].walks) stepHeight(bean, state.gravity, state.tick);
        for (const m of INTERACTIONS) m.settle?.(step);
      }
    },
  };
}

function structuredCloneLayout(layout: PlazaLayout): PlazaLayout {
  return {
    walkable: { points: layout.walkable.points.map((p) => ({ ...p })) },
    props: layout.props.map((p) => ({ ...p })),
    benches: layout.benches.map((b) => ({ ...b, seats: b.seats.map((q) => ({ ...q })) })),
    portals: layout.portals.map((p) => ({ ...p })),
    start: { ...layout.start },
    rail: layout.rail ? { ...layout.rail, carts: layout.rail.carts.map((c) => ({ ...c })) } : null,
  };
}
