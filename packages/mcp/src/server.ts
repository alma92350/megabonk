/**
 * FR-22: the MCP server, over STDIO.
 *
 * AC-22.3: stdio only. No socket, no HTTP transport, no listener of any kind is
 * created here — there is nothing for anything outside this process to connect to.
 * Killing this process cannot stall the game either: in attached mode the game owns
 * its own clock and the session only supplies InputFrames (AC-22.2).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { parseHandicapArgs, resolveHandicap } from './handicap.js';
import type { ResolvedHandicap } from './handicap.js';
import { createSession } from './session.js';
import type { McpSession, SessionMode } from './session.js';
import { callTool, toolsFor } from './tools.js';

export interface ServerOptions {
  readonly mode: SessionMode;
  readonly headless: boolean;
  readonly seed: number;
  readonly handicap: ResolvedHandicap;
}

export function parseServerArgs(argv: readonly string[]): ServerOptions {
  let mode: SessionMode = 'autonomous';
  let seed = 1;
  for (const arg of argv) {
    if (arg === '--advisor') mode = 'advisor';
    else if (arg === '--autonomous') mode = 'autonomous';
    else if (arg.startsWith('--mode=')) {
      const value = arg.slice('--mode='.length);
      if (value !== 'advisor' && value !== 'autonomous') {
        throw new Error(`Unknown --mode "${value}". Valid modes: advisor, autonomous.`);
      }
      mode = value;
    } else if (arg.startsWith('--seed=')) {
      const value = Number(arg.slice('--seed='.length));
      if (!Number.isInteger(value)) throw new Error(`--seed must be an integer, got "${arg}".`);
      seed = value;
    }
  }
  return {
    mode,
    // v1 ships the headless owner; a live IPC attachment reuses the same surface.
    headless: true,
    seed,
    handicap: resolveHandicap(parseHandicapArgs(argv)),
  };
}

export function buildServer(argv: readonly string[]): {
  server: McpServer;
  session: McpSession;
  options: ServerOptions;
} {
  const options = parseServerArgs(argv);
  const session = createSession({
    mode: options.mode,
    seed: options.seed,
    handicap: options.handicap,
  });
  const server = new McpServer(
    { name: 'megabonk', version: '0.1.0' },
    {
      instructions:
        `Megabonk run control. Handicap profile: ${options.handicap.profile}. ` +
        'Observations are delayed and filtered (FR-27); actions are delayed and rate-limited (FR-28). ' +
        'Movement intents persist until replaced, so the run never waits for you.',
    },
  );

  // AC-24.4: only the tools this mode exposes are registered at all.
  for (const spec of toolsFor(options.mode)) {
    server.registerTool(
      spec.name,
      { description: spec.description, inputSchema: spec.inputSchema },
      (args: unknown) => {
        const result = callTool(session, options.mode, spec.name, args as Record<string, unknown>);
        return result.isError === true
          ? { content: [...result.content], isError: true }
          : { content: [...result.content] };
      },
    );
  }

  return { server, session, options };
}

export async function main(argv: readonly string[]): Promise<void> {
  const { server } = buildServer(argv);
  await server.connect(new StdioServerTransport());
}

const invokedAs = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedAs === import.meta.url) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    process.stderr.write(`mcp server failed: ${String(err)}\n`);
    process.exit(1);
  });
}
