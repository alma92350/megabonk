import { describe, it, expect, vi } from 'vitest';
import { CoPlay } from '../src/coplay.js';
import type { BridgeApi, AdvicePayload, IntentPayload } from '@megabonk/bridge';
import { getAdvice, clearAdvice } from '../src/advice.js';

function fakeApi(over: Partial<BridgeApi> = {}): BridgeApi {
  return {
    base: 'http://127.0.0.1:0',
    health: async () => ({ ok: true, clientConnected: true, stateVersion: 0 }),
    publishState: async () => {},
    readState: async () => ({ value: null, version: 0 }),
    publishAdvice: async () => {},
    readAdvice: async () => ({ value: null, version: 0 }),
    publishIntent: async () => {},
    readIntent: async () => ({ value: null, version: 0 }),
    ...over,
  };
}

const host = () => ({ state: { tick: 7, phase: 'playing' } as unknown, agent: { control: false, move: null as unknown, choose: null as number | null } });

describe('co-play bridge client', () => {
  it('publishes the current game state on each poll', async () => {
    const published: unknown[] = [];
    const h = host();
    const co = new CoPlay(fakeApi({ publishState: async (s) => void published.push(s) }), {
      getState: () => h.state,
      applyAdvice: () => {},
      applyIntent: () => {},
    });
    await co.poll();
    await co.poll();
    expect(published).toHaveLength(2);
    expect((published[0] as { tick: number }).tick).toBe(7);
  });

  it('publishes nothing when there is no run in progress', async () => {
    const published: unknown[] = [];
    const co = new CoPlay(fakeApi({ publishState: async (s) => void published.push(s) }), {
      getState: () => null,
      applyAdvice: () => {},
      applyIntent: () => {},
    });
    await co.poll();
    expect(published).toHaveLength(0);
  });

  it('applies advice from the agent exactly once per version change', async () => {
    let version = 1;
    const advice: AdvicePayload = { pickIndex: 2, rationale: 'crit scales with your build' };
    const seen: (AdvicePayload | null)[] = [];
    const co = new CoPlay(
      fakeApi({ readAdvice: async () => ({ value: advice, version }) }),
      { getState: () => host().state, applyAdvice: (a) => seen.push(a), applyIntent: () => {} },
    );
    await co.poll();
    await co.poll(); // same version: must not re-apply
    expect(seen).toHaveLength(1);
    version = 2;
    await co.poll();
    expect(seen).toHaveLength(2);
  });

  it('applies an agent intent only when it changes', async () => {
    let version = 1;
    const intent: IntentPayload = { move: { x: 1, y: 0 }, control: true };
    const seen: IntentPayload[] = [];
    const co = new CoPlay(
      fakeApi({ readIntent: async () => ({ value: intent, version }) }),
      { getState: () => host().state, applyAdvice: () => {}, applyIntent: (i) => seen.push(i) },
    );
    await co.poll();
    await co.poll();
    expect(seen).toHaveLength(1);
    version = 5;
    await co.poll();
    expect(seen).toHaveLength(2);
  });

  it('AC-21.1: a bridge that is not running never throws and never touches the game', async () => {
    const fail = async () => {
      throw new Error('ECONNREFUSED');
    };
    const applied: unknown[] = [];
    const co = new CoPlay(
      fakeApi({ publishState: fail, readAdvice: fail, readIntent: fail }),
      {
        getState: () => host().state,
        applyAdvice: (a) => applied.push(a),
        applyIntent: (i) => applied.push(i),
      },
    );
    await expect(co.poll()).resolves.toBeUndefined();
    expect(applied).toEqual([]);
    expect(co.connected).toBe(false);
  });

  it('reports connected once a poll succeeds, and disconnected after it fails', async () => {
    let broken = false;
    const co = new CoPlay(
      fakeApi({
        publishState: async () => {
          if (broken) throw new Error('down');
        },
      }),
      { getState: () => host().state, applyAdvice: () => {}, applyIntent: () => {} },
    );
    await co.poll();
    expect(co.connected).toBe(true);
    broken = true;
    await co.poll();
    expect(co.connected).toBe(false);
  });

  it('does not overlap polls if one is slow — a backlog would publish stale state', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const co = new CoPlay(
      fakeApi({
        publishState: async () => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((r) => setTimeout(r, 15));
          inFlight--;
        },
      }),
      { getState: () => host().state, applyAdvice: () => {}, applyIntent: () => {} },
    );
    await Promise.all([co.poll(), co.poll(), co.poll()]);
    expect(maxInFlight).toBe(1);
  });

  it('start() schedules polling and stop() halts it', async () => {
    vi.useFakeTimers();
    try {
      let polls = 0;
      const co = new CoPlay(
        fakeApi({ publishState: async () => void polls++ }),
        { getState: () => host().state, applyAdvice: () => {}, applyIntent: () => {} },
        { intervalMs: 100 },
      );
      co.start();
      await vi.advanceTimersByTimeAsync(350);
      const after = polls;
      expect(after).toBeGreaterThan(0);
      co.stop();
      await vi.advanceTimersByTimeAsync(500);
      expect(polls).toBe(after);
    } finally {
      vi.useRealTimers();
    }
  });

  it('routes advice into the module advice store, which is what the overlay reads', async () => {
    clearAdvice();
    const co = new CoPlay(
      fakeApi({ readAdvice: async () => ({ value: { pickIndex: 1, rationale: 'go wide' }, version: 3 }) }),
      { getState: () => host().state },
    );
    await co.poll();
    expect(getAdvice()?.pickIndex).toBe(1);
    expect(getAdvice()?.rationale).toBe('go wide');
    clearAdvice();
  });
});
