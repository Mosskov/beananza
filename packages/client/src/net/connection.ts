import { Client, type Room } from '@colyseus/sdk';
import {
  HUB_ROOM,
  MSG_COMMAND,
  MSG_ROSTER,
  MSG_SNAPSHOT,
  MSG_WELCOME,
  type HubJoinOptions,
  type HubWelcome,
  type RosterEntry,
} from '@beananza/shared';
import type { HubBeanCommand, HubSnapshot } from '@beananza/sim';
import { SnapshotBuffer } from './snapshot-buffer';

/**
 * The client's side of the multiplayer hub (M2): one joined class room. It keeps the roster and
 * the server's snapshots (in a SnapshotBuffer) and sends this player's commands.
 */

/** The hub server: VITE_HUB_URL when built for hosting, else port 2567 on this page's host (dev, LAN). */
export function hubServerUrl(): string {
  const configured = import.meta.env.VITE_HUB_URL as string | undefined;
  if (configured) return configured;
  return `${window.location.protocol}//${window.location.hostname}:2567`;
}

export class HubConnection {
  readonly buffer = new SnapshotBuffer();
  roster: RosterEntry[];
  /** Set when the connection is gone for good (not a short drop the SDK reconnects from). */
  closed = false;
  private readonly rosterListeners: (() => void)[] = [];

  private constructor(
    private readonly room: Room,
    readonly welcome: HubWelcome,
  ) {
    this.roster = welcome.roster;
    room.onMessage(MSG_SNAPSHOT, (s: HubSnapshot) => this.buffer.push(s, performance.now()));
    room.onMessage(MSG_ROSTER, (r: RosterEntry[]) => {
      this.roster = r;
      for (const f of this.rosterListeners) f();
    });
    room.onLeave(() => {
      this.closed = true;
    });
  }

  /** Join a class's hub; resolves once the server has welcomed this player. */
  static async join(url: string, options: HubJoinOptions): Promise<HubConnection> {
    const room = await new Client(url).joinOrCreate(HUB_ROOM, options);
    // The welcome is the server's first message; snapshots that arrive with it are kept too.
    const early: HubSnapshot[] = [];
    const offSnap = room.onMessage(MSG_SNAPSHOT, (s: HubSnapshot) => early.push(s));
    const welcome = await new Promise<HubWelcome>((resolve) => {
      const off = room.onMessage(MSG_WELCOME, (w: HubWelcome) => {
        off();
        resolve(w);
      });
    });
    offSnap();
    const connection = new HubConnection(room, welcome);
    for (const s of early) connection.buffer.push(s, performance.now());
    return connection;
  }

  get you(): string {
    return this.welcome.you;
  }

  onRoster(listener: () => void): void {
    this.rosterListeners.push(listener);
  }

  send(command: HubBeanCommand): void {
    if (!this.closed) this.room.send(MSG_COMMAND, command);
  }

  async leave(): Promise<void> {
    this.closed = true;
    await this.room.leave().catch(() => undefined);
  }
}

/** The joined hub, handed from the join flow (main.ts) to the online hub scene. */
let current: HubConnection | null = null;

export function setHubConnection(connection: HubConnection): void {
  current = connection;
}

export function hubConnection(): HubConnection {
  if (!current) throw new Error('Not connected to a hub.');
  return current;
}
