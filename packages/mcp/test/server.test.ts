import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer, parseServerArgs } from '../src/server.js';
import { READ_TOOLS, WRITE_TOOLS } from '../src/tools.js';

async function connect(argv: string[]) {
  const { server, session } = buildServer(argv);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientT), server.connect(serverT)]);
  return { client, session, close: () => server.close() };
}

describe('FR-22 MCP lifecycle over a real transport', () => {
  it('AC-22.1: completes the initialise handshake and lists its tools', async () => {
    const { client, close } = await connect(['--headless']);
    expect(client.getServerVersion()?.name).toBe('megabonk');
    const listed = (await client.listTools()).tools;
    const names = listed.map((t) => t.name).sort();
    for (const r of READ_TOOLS) expect(names).toContain(r);
    for (const t of listed) expect(t.inputSchema).toBeDefined();
    await close();
  });

  it('AC-24.4: write tools are absent from tools/list in advisor mode and present in autonomous', async () => {
    const advisor = await connect(['--headless', '--mode=advisor']);
    const advisorNames = (await advisor.client.listTools()).tools.map((t) => t.name);
    for (const w of WRITE_TOOLS) expect(advisorNames).not.toContain(w);
    expect(advisorNames).toContain('advise');
    await advisor.close();

    const auto = await connect(['--headless', '--mode=autonomous']);
    const autoNames = (await auto.client.listTools()).tools.map((t) => t.name);
    for (const w of WRITE_TOOLS) expect(autoNames).toContain(w);
    await auto.close();
  });

  it('AC-22.1/24.1: a round-trip tool call works and a malformed one is a protocol error', async () => {
    const { client, close } = await connect(['--headless', '--seed=77']);
    const started = await client.callTool({ name: 'start_run', arguments: { seed: 77 } });
    expect(started.isError).toBeFalsy();
    await client.callTool({ name: 'step', arguments: { ticks: 120 } });
    const state = await client.callTool({ name: 'get_state', arguments: {} });
    const text = (state.content as { text: string }[])[0]!.text;
    expect(JSON.parse(text).tick).toBeGreaterThan(0);

    // AC-24.1: a schema violation comes back as a structured MCP error result —
    // never an exception, never a crash, and the server stays connected.
    const bad = await client.callTool({ name: 'set_intent', arguments: { kind: 'vector', x: 'north' } });
    expect(bad.isError).toBe(true);
    expect((bad.content as { text: string }[])[0]!.text).toMatch(/-32602|validation/i);
    const stillAlive = await client.callTool({ name: 'get_state', arguments: {} });
    expect(stillAlive.isError).toBeFalsy();
    await close();
  });

  it('FR-22/29: argv parsing defaults to headless autonomous human-parity', () => {
    const d = parseServerArgs([]);
    expect(d.mode).toBe('autonomous');
    expect(d.handicap.profile).toBe('human-parity');
    expect(parseServerArgs(['--mode=advisor']).mode).toBe('advisor');
    expect(parseServerArgs(['--advisor']).mode).toBe('advisor');
    expect(parseServerArgs(['--seed=42']).seed).toBe(42);
    expect(parseServerArgs(['--unrestricted']).handicap.profile).toBe('unrestricted');
    expect(() => parseServerArgs(['--mode=cheat'])).toThrow(/mode/i);
  });
});
