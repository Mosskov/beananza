import { Room, type Client } from '@colyseus/core';
import {
  HUB_MAX_PLAYERS,
  HUB_RECONNECT_S,
  HUB_SNAPSHOT_HZ,
  MSG_COMMAND,
  MSG_ROSTER,
  MSG_SNAPSHOT,
  MSG_WELCOME,
  type HubWelcome,
} from '@beananza/shared';
import { SIM_HZ } from '@beananza/sim';
import { HubServerCore, checkJoin } from './core';

/**
 * One class's hub (M2): a Colyseus room per class code (`filterBy(['classCode'])`). The room
 * steps the hub sim at 60 Hz as the authority and broadcasts a snapshot HUB_SNAPSHOT_HZ times a
 * second; clients send commands. Nothing is stored: when the last player leaves, the room goes.
 */
export interface HubRoomStats {
  ticks: number;
  steps: number;
  tickMsTotal: number;
  tickMsMax: number;
}

/** How long each class's sim steps take, by class code, for the load check (`shot:multi --bots`). */
export const hubRoomStats = new Map<string, HubRoomStats>();

export class HubRoom extends Room {
  override maxClients = HUB_MAX_PLAYERS;
  private core!: HubServerCore;

  override onCreate(options: unknown): void {
    // The creating player's options are checked again in onJoin; here only the layout matters.
    const { classCode } = checkJoin(options);
    this.core = new HubServerCore();
    const stats: HubRoomStats = { ticks: 0, steps: 0, tickMsTotal: 0, tickMsMax: 0 };
    hubRoomStats.set(classCode, stats);
    this.setTimestep((deltaMs) => {
      const started = performance.now();
      stats.steps += this.core.tick(deltaMs / 1000);
      const ms = performance.now() - started;
      stats.ticks += 1;
      stats.tickMsTotal += ms;
      stats.tickMsMax = Math.max(stats.tickMsMax, ms);
    }, 1000 / SIM_HZ);
    this.clock.setInterval(() => this.broadcast(MSG_SNAPSHOT, this.core.snapshot()), 1000 / HUB_SNAPSHOT_HZ);
    this.onMessage(MSG_COMMAND, (client: Client, message: unknown) => {
      this.core.command(client.sessionId, message);
    });
  }

  override onJoin(client: Client, options: unknown): void {
    const entry = this.core.join(client.sessionId, options);
    const welcome: HubWelcome = { you: entry.id, layout: this.core.layout, roster: this.core.roster() };
    client.send(MSG_WELCOME, welcome);
    client.send(MSG_SNAPSHOT, this.core.snapshot());
    this.broadcast(MSG_ROSTER, this.core.roster(), { except: client });
  }

  /** A dropped connection (wifi, a sleeping laptop) may come back and keep its bean. */
  override async onDrop(client: Client): Promise<void> {
    try {
      await this.allowReconnection(client, HUB_RECONNECT_S);
    } catch {
      // Not back in time: onLeave drops the bean.
    }
  }

  override onReconnect(client: Client): void {
    client.send(MSG_SNAPSHOT, this.core.snapshot());
    client.send(MSG_ROSTER, this.core.roster());
  }

  override onLeave(client: Client): void {
    this.core.leave(client.sessionId);
    this.broadcast(MSG_ROSTER, this.core.roster());
  }
}
