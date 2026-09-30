import { createEndpoint, createRouter, defineRoom, defineServer, type Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { HUB_ROOM } from '@beananza/shared';
import { HubRoom } from './room';

export { HubRoom, hubRoomStats } from './room';
export { HubServerCore, JoinRefused, checkJoin, parseCommand, CMD_BURST, CMD_PER_STEP } from './core';

/**
 * The multiplayer hub server (M2): the `hub` room, one per class code, plus `GET /health` for
 * the host's health checks. `pnpm server:dev` runs it on port 2567 (`PORT` overrides it).
 */
export function createHubServer(): Server {
  return defineServer({
    transport: new WebSocketTransport(),
    rooms: { [HUB_ROOM]: defineRoom(HubRoom).filterBy(['classCode']) },
    routes: createRouter({
      health: createEndpoint('/health', { method: 'GET' }, async () => ({ ok: true })),
    }),
  });
}

/** Start a hub server on `port`; resolves once it listens. */
export async function startHubServer(port: number): Promise<Server> {
  const server = createHubServer();
  await server.listen(port);
  return server;
}
