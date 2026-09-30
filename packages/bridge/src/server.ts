/**
 * The co-play bridge.
 *
 * The browser game and the MCP server are separate processes that need to meet:
 * the page publishes what is happening, the agent reads it and posts back advice
 * or an intent. This is the piece that makes the PRD's headline feature real
 * rather than headless-only.
 *
 * Deliberately a tiny node:http server with ZERO dependencies. A WebSocket would
 * be a better fit for push, but the only correct way to get one here is another
 * dependency, and the traffic is a few small JSON documents at ~10 Hz on
 * loopback. Polling is entirely adequate and keeps the install surface at zero.
 *
 * Design rules that matter:
 *  - LAST WRITE WINS, never a queue. The agent must act on what is happening
 *    now; a backlog of stale snapshots is worse than no snapshot.
 *  - Every document carries a version, so a reader can tell "unchanged" from
 *    "changed back", which a deep-equality check cannot.
 *  - Loopback only. This exposes live game state and accepts control input.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/** 4 MiB. A full GameState at the entity cap is far below this. */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface BridgeOptions {
  readonly port?: number;
  /** Ignored except for tests; the bridge always binds loopback. */
  readonly host?: string;
}

export interface BridgeHandle {
  readonly port: number;
  readonly host: string;
  readonly server: Server;
  close(): Promise<void>;
}

interface Versioned<T> {
  value: T | null;
  version: number;
  updatedAt: number;
}

function empty<T>(): Versioned<T> {
  return { value: null, version: 0, updatedAt: 0 };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'cache-control': 'no-store',
  });
  res.end(text);
}

async function readJson(req: IncomingMessage): Promise<{ ok: true; data: unknown } | { ok: false; status: number }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    // Refuse early rather than buffering an unbounded body into memory.
    if (size > MAX_BODY_BYTES) return { ok: false, status: 413 };
    chunks.push(buf);
  }
  try {
    return { ok: true, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { ok: false, status: 400 };
  }
}

export async function startBridge(options: BridgeOptions = {}): Promise<BridgeHandle> {
  const state = empty<unknown>();
  const advice = empty<unknown>();
  const intent = empty<unknown>();
  // FR-21 follow-up: the sim clock only advances via the page's rAF loop, which
  // browsers throttle hard once a tab is backgrounded. Without this, a frozen
  // `/state` (tick not moving, version still climbing from the 100ms poll) is
  // indistinguishable from a genuinely stuck or crashed page — an attached
  // agent cannot tell "nothing to do, the human tabbed away" from "something
  // is broken." The client posts document.visibilityState here on change.
  const visibility = empty<unknown>();
  // `/state` only ever carries a GameState, and the client only publishes one
  // while screen === 'run' — so leaving a run (back to the hub, or onto the
  // summary screen) makes `/state` go silent, indistinguishable to a reader
  // from a stuck page. This is published on every poll regardless of screen.
  const screen = empty<unknown>();

  const server = createServer((req, res) => {
    // A request that dies in flight must never take the bridge with it.
    //
    // The browser aborts in-flight POSTs on every reload or navigation, and the
    // page publishes at ~10 Hz, so there is nearly always one in flight. An
    // aborted body makes `for await (const chunk of req)` throw inside
    // readJson; with the rejection discarded (`void handle(...)`) that became an
    // unhandled rejection, which Node turns into a process exit. That is not
    // theoretical — it killed a live bridge mid-run at 11:49.
    handle(req, res).catch((err: unknown) => {
      const code = (err as { code?: string } | null)?.code;
      // ECONNRESET / 'aborted' are the client hanging up: normal, not a fault.
      if (code !== 'ECONNRESET' && String(err) !== 'Error: aborted') {
        process.stderr.write(`[hollowlight] bridge request failed: ${String(err)}\n`);
      }
      if (!res.headersSent) {
        try {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end('{"error":"request failed"}');
        } catch {
          /* socket already gone — nothing to report to */
        }
      } else {
        res.destroy();
      }
    });
    // Socket-level errors arrive as 'error' events, which are ALSO fatal when
    // unhandled, by the same route.
    req.on('error', () => {});
    res.on('error', () => {});
  });
  server.on('clientError', (_err, socket) => {
    socket.destroy();
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = (req.url ?? '/').split('?')[0] ?? '/';

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      });
      res.end();
      return;
    }

    if (url === '/health') {
      send(res, 200, {
        ok: true,
        role: 'megabonk-bridge',
        // "Is anyone actually playing?" is the first thing an attached agent
        // needs to know, and it cannot infer it from a null snapshot alone.
        clientConnected: state.version > 0,
        stateVersion: state.version,
        adviceVersion: advice.version,
        intentVersion: intent.version,
        // null until the page has ever reported in; true/false once it has.
        pageVisible: visibility.value,
        // null until the page has ever reported in; 'hub' | 'run' | 'summary'
        // once it has. The one field that tells a reader "nothing published
        // to /state" apart from "not in a run right now."
        screen: screen.value,
      });
      return;
    }

    const slot =
      url === '/state'
        ? state
        : url === '/advice'
          ? advice
          : url === '/intent'
            ? intent
            : url === '/visibility'
              ? visibility
              : url === '/screen'
                ? screen
                : null;
    if (slot === null) {
      send(res, 404, { error: `unknown path ${url}` });
      return;
    }
    const key =
      url === '/state'
        ? 'snapshot'
        : url === '/advice'
          ? 'advice'
          : url === '/visibility'
            ? 'visible'
            : url === '/screen'
              ? 'screen'
              : 'intent';

    if (req.method === 'GET') {
      send(res, 200, { [key]: slot.value, version: slot.version, updatedAt: slot.updatedAt });
      return;
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      if (!body.ok) {
        send(res, body.status, { error: body.status === 413 ? 'body too large' : 'invalid JSON' });
        return;
      }
      const record = body.data as Record<string, unknown> | null;
      const next = record !== null && typeof record === 'object' ? record[key] ?? null : null;
      slot.value = next;
      slot.version += 1;
      slot.updatedAt = Date.now();
      send(res, 200, { ok: true, version: slot.version });
      return;
    }

    send(res, 405, { error: `method ${req.method ?? '?'} not allowed` });
  }

  const host = '127.0.0.1';
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 7391, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const port = (server.address() as AddressInfo).port;

  return {
    port,
    host,
    server,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
