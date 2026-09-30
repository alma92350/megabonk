/**
 * `npm run agent:live` — attach an agent to the game in your browser.
 *
 * Starts the bridge if nothing is on the port, then loops: read the live state,
 * observe it through the handicap, decide, post back.
 */

import { bridgeApi, bridgeUrl, DEFAULT_BRIDGE_PORT } from '@megabonk/bridge';
import { startBridge } from '@megabonk/bridge/server';
import { LiveAgent, type LiveMode } from './live.js';
import { parseHandicapArgs, resolveHandicap } from './handicap.js';

interface Args {
  readonly mode: LiveMode;
  readonly port: number;
  readonly hz: number;
}

export function parseLiveArgs(argv: readonly string[]): Args {
  let mode: LiveMode = 'advisor';
  let port = DEFAULT_BRIDGE_PORT;
  let hz = 10;
  for (const arg of argv) {
    if (arg === '--autonomous') mode = 'autonomous';
    else if (arg === '--advisor') mode = 'advisor';
    else if (arg.startsWith('--mode=')) {
      const v = arg.slice(7);
      if (v !== 'advisor' && v !== 'autonomous') {
        throw new Error(`Unknown --mode "${v}". Valid: advisor, autonomous.`);
      }
      mode = v;
    } else if (arg.startsWith('--port=')) {
      const v = Number(arg.slice(7));
      if (!Number.isInteger(v) || v < 0 || v > 65535) throw new Error(`Bad --port "${arg}".`);
      port = v;
    } else if (arg.startsWith('--hz=')) {
      const v = Number(arg.slice(5));
      if (!Number.isFinite(v) || v <= 0 || v > 60) throw new Error(`Bad --hz "${arg}".`);
      hz = v;
    }
  }
  return { mode, port, hz };
}

async function main(): Promise<void> {
  const args = parseLiveArgs(process.argv.slice(2));
  const api = bridgeApi(bridgeUrl(args.port));

  let owned: Awaited<ReturnType<typeof startBridge>> | null = null;
  try {
    await api.health();
    console.error(`[hollowlight] using the bridge already running on :${args.port}`);
  } catch {
    owned = await startBridge({ port: args.port });
    console.error(`[hollowlight] started a bridge on :${owned.port}`);
  }

  const agent = new LiveAgent(api, {
    handicap: resolveHandicap(parseHandicapArgs(process.argv.slice(2))),
    mode: args.mode,
  });

  console.error(
    `[hollowlight] ${args.mode} agent attached at ${args.hz} Hz.\n` +
      `[hollowlight] open the game, start a run, and it will ${
        args.mode === 'advisor' ? 'advise you on screen' : 'take the controls'
      }.\n[hollowlight] Ctrl-C to detach.`,
  );

  let announced = false;
  const timer = setInterval(() => {
    void (async () => {
      if (!announced) {
        const status = await agent.status();
        if (status.clientConnected) {
          announced = true;
          console.error('[hollowlight] game detected — agent is live.');
        }
      }
      await agent.act();
    })();
  }, 1000 / args.hz);

  const shutdown = async (): Promise<void> => {
    clearInterval(timer);
    // Always hand the controls back; leaving a browser stuck under agent
    // control after the process exits would be the worst possible failure.
    await agent.release();
    await owned?.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

const isMain = process.argv[1]?.includes('live-cli');
if (isMain) {
  main().catch((err: unknown) => {
    console.error('[hollowlight] live agent failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
