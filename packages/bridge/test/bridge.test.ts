import { describe, it, expect, afterEach } from 'vitest';
import { startBridge, type BridgeHandle } from '../src/server.js';

let handle: BridgeHandle | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
});

async function boot(): Promise<{ url: string }> {
  handle = await startBridge({ port: 0, host: '127.0.0.1' });
  return { url: `http://127.0.0.1:${handle.port}` };
}

const post = (url: string, path: string, body: unknown) =>
  fetch(url + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('the co-play bridge', () => {
  it('starts on an ephemeral port and reports health', async () => {
    const { url } = await boot();
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.role).toBe('megabonk-bridge');
  });

  it('binds loopback only — never an external interface', async () => {
    handle = await startBridge({ port: 0 });
    expect(handle.host).toBe('127.0.0.1');
  });

  it('round-trips a game snapshot from the client to a reader', async () => {
    const { url } = await boot();
    expect((await (await fetch(`${url}/state`)).json()).snapshot).toBeNull();

    const snapshot = { tick: 42, phase: 'playing', player: { hp: 10 } };
    const put = await post(url, '/state', { snapshot });
    expect(put.status).toBe(200);

    const got = await (await fetch(`${url}/state`)).json();
    expect(got.snapshot).toEqual(snapshot);
    expect(got.version).toBe(1);
  });

  it('keeps only the latest snapshot — the agent must never read a stale queue', async () => {
    const { url } = await boot();
    for (let i = 1; i <= 5; i++) await post(url, '/state', { snapshot: { tick: i } });
    const got = await (await fetch(`${url}/state`)).json();
    expect(got.snapshot.tick).toBe(5);
    expect(got.version).toBe(5);
  });

  it('round-trips advice from the agent to the client', async () => {
    const { url } = await boot();
    expect((await (await fetch(`${url}/advice`)).json()).advice).toBeNull();

    await post(url, '/advice', { advice: { pickIndex: 1, rationale: 'take the crit tome' } });
    const got = await (await fetch(`${url}/advice`)).json();
    expect(got.advice.pickIndex).toBe(1);
    expect(got.advice.rationale).toBe('take the crit tome');
  });

  it('clears advice when the agent posts null', async () => {
    const { url } = await boot();
    await post(url, '/advice', { advice: { pickIndex: 0, rationale: 'x' } });
    await post(url, '/advice', { advice: null });
    expect((await (await fetch(`${url}/advice`)).json()).advice).toBeNull();
  });

  it('round-trips an agent intent, and versions it so the client can detect change', async () => {
    const { url } = await boot();
    await post(url, '/intent', { intent: { move: { x: 1, y: 0 } } });
    const a = await (await fetch(`${url}/intent`)).json();
    expect(a.intent.move).toEqual({ x: 1, y: 0 });
    expect(a.version).toBe(1);

    await post(url, '/intent', { intent: { move: { x: 0, y: -1 }, chooseIndex: 2 } });
    const b = await (await fetch(`${url}/intent`)).json();
    expect(b.intent.chooseIndex).toBe(2);
    expect(b.version).toBe(2);
  });

  it('serves CORS headers so the browser page can reach it from the vite origin', async () => {
    const { url } = await boot();
    const res = await fetch(`${url}/state`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const pre = await fetch(`${url}/state`, { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('rejects malformed JSON with 400 rather than crashing the process', async () => {
    const { url } = await boot();
    const res = await fetch(`${url}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    // The bridge is still alive and serving.
    expect((await fetch(`${url}/health`)).status).toBe(200);
  });

  it('rejects an oversized body rather than buffering it without limit', async () => {
    const { url } = await boot();
    const huge = { snapshot: { blob: 'x'.repeat(6 * 1024 * 1024) } };
    const res = await post(url, '/state', huge);
    expect(res.status).toBe(413);
    expect((await fetch(`${url}/health`)).status).toBe(200);
  });

  it('404s an unknown path instead of guessing', async () => {
    const { url } = await boot();
    expect((await fetch(`${url}/nope`)).status).toBe(404);
  });

  it('reports whether a client is currently publishing, so the agent can tell', async () => {
    const { url } = await boot();
    expect((await (await fetch(`${url}/health`)).json()).clientConnected).toBe(false);
    await post(url, '/state', { snapshot: { tick: 1 } });
    expect((await (await fetch(`${url}/health`)).json()).clientConnected).toBe(true);
  });

  it('close() releases the port so a restart is immediate', async () => {
    const h = await startBridge({ port: 0 });
    const port = h.port;
    await h.close();
    const again = await startBridge({ port });
    expect(again.port).toBe(port);
    await again.close();
  });
});
