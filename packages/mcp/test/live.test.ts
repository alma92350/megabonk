import { describe, it, expect, afterEach } from 'vitest';
import { bridgeApi } from '@megabonk/bridge';
import { startBridge, type BridgeHandle } from '@megabonk/bridge/server';
import { LiveAgent } from '../src/live.js';
import { resolveHandicap } from '../src/handicap.js';
import { createRun, step, TICK_MS } from '@megabonk/sim';
import { makeRunConfig } from '@megabonk/content';
import type { GameState } from '@megabonk/sim';

let handle: BridgeHandle | null = null;
afterEach(async () => {
  await handle?.close();
  handle = null;
});

/** A real, mid-run game state to publish, so this exercises real observation. */
function liveState(ticks = 400): GameState {
  const cfg = makeRunConfig(7);
  let s = createRun(cfg);
  for (let i = 0; i < ticks && s.phase !== 'ended'; i++) {
    s = step(s, s.phase === 'offer' ? { move: { x: 0, y: 0 }, chooseIndex: 0 } : { move: { x: 1, y: 0 } }, TICK_MS, cfg);
  }
  return s;
}

async function boot() {
  handle = await startBridge({ port: 0 });
  return bridgeApi(`http://127.0.0.1:${handle.port}`);
}

describe('LiveAgent: the agent attached to a real running game', () => {
  it('reports not-attached when no client is publishing', async () => {
    const api = await boot();
    const agent = new LiveAgent(api, { handicap: resolveHandicap({}) });
    expect((await agent.status()).clientConnected).toBe(false);
  });

  it('observes the published game through the FR-27 handicap, not raw', async () => {
    const api = await boot();
    const state = liveState();
    await api.publishState(state);

    const agent = new LiveAgent(api, { handicap: resolveHandicap({}) });
    const obs = await agent.observe();
    expect(obs).not.toBeNull();

    // AC-27.6: positions quantised.
    expect((obs!.player.pos.x * 4) % 1).toBeCloseTo(0, 9);
    // AC-27.3/24.6: the enemy list is capped and viewport-filtered, so it must
    // not simply mirror the raw state.
    expect(obs!.enemies.length).toBeLessThanOrEqual(24);
    // AC-27.7: no forbidden keys anywhere in the payload.
    const json = JSON.stringify(obs);
    expect(/"[^"]*(velocity|nextAttack|aiState|seed|rng)[^"]*":/i.test(json)).toBe(false);
  });

  it('never sees more enemies than the raw state contains', async () => {
    const api = await boot();
    const state = liveState();
    await api.publishState(state);
    const agent = new LiveAgent(api, { handicap: resolveHandicap({}) });
    const obs = await agent.observe();
    expect(obs!.enemies.length).toBeLessThanOrEqual(state.enemies.length);
  });

  it('defaults to advisor mode — an agent never takes the controls uninvited', async () => {
    const api = await boot();
    await api.publishState(liveState());
    const agent = new LiveAgent(api, { handicap: resolveHandicap({}) });
    await agent.act();
    expect((await api.readIntent()).value).toBeNull();
    expect((await api.readAdvice()).value).not.toBeNull();
  });

  it('publishes a movement intent derived from its policy when autonomous', async () => {
    const api = await boot();
    await api.publishState(liveState());
    const agent = new LiveAgent(api, { handicap: resolveHandicap({}), mode: 'autonomous' });

    await agent.act();
    const intent = await api.readIntent();
    expect(intent.value).not.toBeNull();
    expect(intent.value!.move).toBeDefined();
    // AC-28.3: movement is one of the 8 compass directions a keyboard can express.
    const { x, y } = intent.value!.move!;
    expect(Number.isInteger(x)).toBe(true);
    expect(Number.isInteger(y)).toBe(true);
    expect(Math.abs(x)).toBeLessThanOrEqual(1);
    expect(Math.abs(y)).toBeLessThanOrEqual(1);
  });

  it('in advisor mode it posts advice and NEVER an intent', async () => {
    const api = await boot();
    await api.publishState(liveState());
    const agent = new LiveAgent(api, { handicap: resolveHandicap({}), mode: 'advisor' });

    await agent.act();
    expect((await api.readIntent()).value).toBeNull();
    const advice = await api.readAdvice();
    expect(advice.value).not.toBeNull();
    expect(typeof advice.value!.rationale).toBe('string');
  });

  it('in autonomous mode it takes control explicitly, never implicitly', async () => {
    const api = await boot();
    await api.publishState(liveState());
    const agent = new LiveAgent(api, { handicap: resolveHandicap({}), mode: 'autonomous' });
    await agent.act();
    expect((await api.readIntent()).value!.control).toBe(true);
  });

  it('recommends a card and explains why when an offer is open', async () => {
    const api = await boot();
    // Drive until an offer screen is actually open.
    const cfg = makeRunConfig(3);
    let s = createRun(cfg);
    for (let i = 0; i < 20000 && s.phase !== 'offer'; i++) {
      s = step(s, { move: { x: 1, y: 0 } }, TICK_MS, cfg);
    }
    expect(s.phase).toBe('offer');
    await api.publishState(s);

    const agent = new LiveAgent(api, { handicap: resolveHandicap({}), mode: 'advisor' });
    await agent.act();
    const advice = (await api.readAdvice()).value!;
    expect(advice.pickIndex).toBeGreaterThanOrEqual(0);
    expect(advice.pickIndex).toBeLessThan(s.offer!.options.length);
    expect(advice.rationale!.length).toBeGreaterThan(0);
  });

  it('does nothing and does not throw when the game has not started', async () => {
    const api = await boot();
    const agent = new LiveAgent(api, { handicap: resolveHandicap({}) });
    await expect(agent.act()).resolves.toBeUndefined();
    expect((await api.readIntent()).value).toBeNull();
  });

  it('survives a bridge that disappears mid-session', async () => {
    const api = await boot();
    await api.publishState(liveState());
    const agent = new LiveAgent(api, { handicap: resolveHandicap({}) });
    await agent.act();
    await handle!.close();
    handle = null;
    await expect(agent.act()).resolves.toBeUndefined();
  });

  it('respects the rate limit rather than spamming the bridge every call', async () => {
    const api = await boot();
    await api.publishState(liveState());
    const agent = new LiveAgent(api, {
      handicap: resolveHandicap({}),
      mode: 'autonomous',
    });
    await agent.act();
    const first = (await api.readIntent()).version;
    // Same published state, immediately again: the agent must not churn intents
    // faster than its own actuation cadence allows.
    await agent.act();
    const second = (await api.readIntent()).version;
    expect(second - first).toBeLessThanOrEqual(1);
  });
});
