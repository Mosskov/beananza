import { startHubServer } from './index';

/** Port 2567 is Colyseus's usual one; hosts set PORT. */
const DEFAULT_PORT = 2567;

const port = Number(process.env.PORT ?? DEFAULT_PORT);
if (!Number.isInteger(port) || port <= 0) throw new Error(`PORT must be a port number, got "${process.env.PORT}".`);
await startHubServer(port);
console.log(`beananza hub server on port ${port} (ws://localhost:${port}, health at /health)`);
