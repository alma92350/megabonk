/** `npm run bridge` — run the co-play bridge on its own. */
import { DEFAULT_BRIDGE_PORT } from './index.js';
import { startBridge } from './server.js';

const portArg = process.argv.slice(2).find((a) => a.startsWith('--port='));
const port = portArg ? Number(portArg.slice(7)) : DEFAULT_BRIDGE_PORT;

startBridge({ port })
  .then((h) => {
    console.error(`[megabonk] bridge listening on http://127.0.0.1:${h.port} (loopback only)`);
    const stop = (): void => void h.close().then(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  })
  .catch((err: unknown) => {
    console.error('[megabonk] bridge failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
