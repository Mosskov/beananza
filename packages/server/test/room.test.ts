import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { HUB_ROOM, MSG_COMMAND, MSG_ROSTER, MSG_SNAPSHOT, MSG_WELCOME, type HubWelcome, type RosterEntry } from '@beananza/shared';
import type { HubSnapshot } from '@beananza/sim';
import type { Server } from '@colyseus/core';
import { startHubServer } from '../src/index';

/** A free TCP port on this machine. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port'))));
    });
  });
}

/** Resolves with the first message of `type` a room gets (after `from`, if given). */
function next<T>(room: Room, type: string, where: (m: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve) => {
    const off = room.onMessage(type, (m: T) => {
      if (!where(m)) return;
      off();
      resolve(m);
    });
  });
}

describe('the hub server over WebSockets (M2)', () => {
  let server: Server;
  let url: string;
  const rooms: Room[] = [];

  beforeAll(async () => {
    const port = await freePort();
    server = await startHubServer(port);
    url = `http://localhost:${port}`;
  });

  afterAll(async () => {
    for (const r of rooms) await r.leave().catch(() => undefined);
    await server.gracefullyShutdown(false);
  });

  const join = async (classCode: string, name: string) => {
    const room = await new Client(url).joinOrCreate(HUB_ROOM, { classCode, name, look: 'green' });
    rooms.push(room);
    return room;
  };

  it('answers the health check', async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('puts a class in one room, sends each player a welcome and everyone snapshots', async () => {
    const a = await join('CLASS1', 'Brave Otter');
    const welcomeA = next<HubWelcome>(a, MSG_WELCOME);
    const rosterA = next<RosterEntry[]>(a, MSG_ROSTER, (r) => r.length === 2);
    const b = await join('CLASS1', 'Calm Owl');
    expect(b.roomId).toBe(a.roomId);
    const snap = await next<HubSnapshot>(b, MSG_SNAPSHOT, (s) => s.beans.length === 2);
    expect(snap.beans.map((q) => q.id).sort()).toEqual([a.sessionId, b.sessionId].sort());
    expect((await rosterA).map((r) => r.name).sort()).toEqual(['Brave Otter', 'Calm Owl']);
    void welcomeA;
  });

  it('keeps other classes apart', async () => {
    const a = await join('CLASS2', 'Kind Fox');
    const b = await join('CLASS3', 'Kind Fox');
    expect(a.roomId).not.toBe(b.roomId);
  });

  it('refuses a free-text name', async () => {
    await expect(new Client(url).joinOrCreate(HUB_ROOM, { classCode: 'CLASS4', name: 'Bob', look: 'green' })).rejects.toThrow();
  });

  it('moves a bean by its player\'s commands', async () => {
    const a = await join('CLASS5', 'Swift Seal');
    const start = await next<HubSnapshot>(a, MSG_SNAPSHOT, (s) => s.beans.length === 1);
    a.send(MSG_COMMAND, { type: 'move', x: 1, y: 0, run: false });
    const later = await next<HubSnapshot>(a, MSG_SNAPSHOT, (s) => s.tick > start.tick + 30);
    expect(later.beans[0]!.x).toBeGreaterThan(start.beans[0]!.x + 0.5);
  });
});
