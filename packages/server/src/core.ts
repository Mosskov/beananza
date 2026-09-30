import { CLASS_CODE_PATTERN, isPresetName, lookToString, parseLook, type HubJoinOptions, type RosterEntry } from '@beananza/shared';
import {
  DEFAULT_LAYOUT,
  FixedStepper,
  HUB_LAYOUTS,
  REGION_IDS,
  Sim,
  createHubScenario,
  portalExit,
  snapshotHub,
  type HubBeanCommand,
  type HubCommand,
  type HubSnapshot,
  type HubState,
} from '@beananza/sim';

/**
 * One class's hub on the server (M2), without any networking: the hub sim as the authority, the
 * players (names and looks, which never enter the sim), and the checks every message from a
 * client passes. `HubRoom` wraps it in a Colyseus room; tests drive it directly.
 */

/** Why a join was refused. The message goes back to the client. */
export class JoinRefused extends Error {}

/**
 * Commands a player may send: a token bucket refilled by sim steps (so it is deterministic),
 * CMD_PER_STEP a step (30 a second) up to CMD_BURST. Held keys send a command only when they
 * change, so real play stays far below it.
 */
export const CMD_BURST = 60;
export const CMD_PER_STEP = 0.5;
/** Tap targets beyond this far from the island's centre are not real taps (m). */
const MAX_COORD_M = 200;

interface Player extends RosterEntry {
  tokens: number;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const inRange = (v: unknown, limit: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;

/**
 * A command from the network as a sim command for `player`, or null if it is not one. Anything
 * the client put in `player` is ignored: a client only ever moves its own bean.
 */
export function parseCommand(player: string, raw: unknown): HubBeanCommand | null {
  if (!isObject(raw)) return null;
  switch (raw.type) {
    case 'move':
      if (!inRange(raw.x, 1) || !inRange(raw.y, 1) || typeof raw.run !== 'boolean') return null;
      return { type: 'move', x: raw.x, y: raw.y, run: raw.run, player };
    case 'moveTo':
      if (!inRange(raw.x, MAX_COORD_M) || !inRange(raw.y, MAX_COORD_M)) return null;
      return { type: 'moveTo', x: raw.x, y: raw.y, player };
    case 'jump':
    case 'action':
      return { type: raw.type, player };
    case 'use':
      if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > 64) return null;
      return { type: 'use', id: raw.id, player };
    default:
      return null;
  }
}

/** Check a client's join options; throws JoinRefused with the reason. */
export function checkJoin(raw: unknown): HubJoinOptions {
  if (!isObject(raw)) throw new JoinRefused('No join options.');
  if (typeof raw.classCode !== 'string' || !CLASS_CODE_PATTERN.test(raw.classCode)) throw new JoinRefused('Not a class code.');
  if (!isPresetName(raw.name)) throw new JoinRefused('Not one of the names to choose from.');
  if (typeof raw.look !== 'string' || raw.look.length > 100) throw new JoinRefused('Not a look.');
  const { unknown } = parseLook(raw.look);
  if (unknown.length) throw new JoinRefused('Not a look.');
  if (raw.from !== undefined && !(REGION_IDS as readonly string[]).includes(raw.from as string)) throw new JoinRefused('Not a region.');
  return { classCode: raw.classCode, name: raw.name, look: raw.look, ...(raw.from !== undefined ? { from: raw.from as string } : {}) };
}

export class HubServerCore {
  readonly sim: Sim<HubState, HubCommand>;
  private readonly stepper = new FixedStepper();
  private readonly players = new Map<string, Player>();

  constructor(readonly layout: string = DEFAULT_LAYOUT) {
    const spec = HUB_LAYOUTS[layout];
    if (!spec) throw new Error(`No hub layout "${layout}".`);
    this.sim = new Sim(createHubScenario({ layout: spec, local: false }), 1);
  }

  get playerCount(): number {
    return this.players.size;
  }

  /** A player arrives: checked options, a bean at the start or in front of the portal it came back through. */
  join(id: string, raw: unknown): RosterEntry {
    const options = checkJoin(raw);
    if (this.players.has(id)) throw new JoinRefused('Already in the hub.');
    const portal = this.sim.state.layout.portals.find((p) => p.region === options.from);
    this.sim.enqueue({ type: 'join', player: id, ...(portal ? { at: portalExit(portal) } : {}) });
    // The look as the server understood it: normalised, so every client draws the same.
    const entry: RosterEntry = { id, name: options.name, look: lookToString(parseLook(options.look).look) };
    this.players.set(id, { ...entry, tokens: CMD_BURST });
    return entry;
  }

  leave(id: string): void {
    if (!this.players.delete(id)) return;
    this.sim.enqueue({ type: 'leave', player: id });
  }

  /** A message from a player's client. Returns whether it became a command. */
  command(id: string, raw: unknown): boolean {
    const player = this.players.get(id);
    if (!player || player.tokens < 1) return false;
    const command = parseCommand(id, raw);
    if (!command) return false;
    player.tokens -= 1;
    this.sim.enqueue(command);
    return true;
  }

  /** Advance by real time (s), in fixed steps. Returns how many steps ran. */
  tick(seconds: number): number {
    let steps = 0;
    this.stepper.advance(seconds, () => {
      this.sim.step();
      steps += 1;
      for (const p of this.players.values()) p.tokens = Math.min(CMD_BURST, p.tokens + CMD_PER_STEP);
    });
    return steps;
  }

  snapshot(): HubSnapshot {
    return snapshotHub(this.sim.state);
  }

  roster(): RosterEntry[] {
    return [...this.players.values()].map(({ id, name, look }) => ({ id, name, look }));
  }
}
