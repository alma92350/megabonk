import { describe, it, expect } from 'vitest';
import { GameClient } from '../src/app.js';
import { loadRecordings, saveRecording, exportCorpus, RECORDINGS_KEY, MAX_STORED } from '../src/recordings.js';
import { replay, makeRunConfigSafe } from './replay-helper.js';
import type { StoredRecording } from '../src/recordings.js';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

const entry = (seed: number): StoredRecording => ({
  recording: { version: 1, seed, characterId: 'bonker', biomeId: 'verdant', ticks: 10, inputs: [] },
  seconds: 1, kills: 0, level: 1, outcome: 'died',
});

describe('recording storage', () => {
  it('round-trips through storage', () => {
    const s = memoryStorage();
    saveRecording(s, entry(1));
    expect(loadRecordings(s)).toHaveLength(1);
    expect(loadRecordings(s)[0]!.recording.seed).toBe(1);
  });

  it('keeps the newest first and caps the list', () => {
    const s = memoryStorage();
    for (let i = 0; i < MAX_STORED + 5; i++) saveRecording(s, entry(i));
    const all = loadRecordings(s);
    expect(all).toHaveLength(MAX_STORED);
    expect(all[0]!.recording.seed).toBe(MAX_STORED + 4);
  });

  it('survives storage that throws, as a private window does', () => {
    const hostile = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    expect(loadRecordings(hostile)).toEqual([]);
    expect(() => saveRecording(hostile, entry(1))).not.toThrow();
  });

  it('survives absent storage and corrupt contents', () => {
    expect(loadRecordings(null)).toEqual([]);
    const s = memoryStorage();
    s.setItem(RECORDINGS_KEY, 'not json');
    expect(loadRecordings(s)).toEqual([]);
    s.setItem(RECORDINGS_KEY, '{"not":"an array"}');
    expect(loadRecordings(s)).toEqual([]);
  });

  it('exports a corpus file the harness can read', () => {
    const out = JSON.parse(exportCorpus([entry(1), entry(2)]));
    expect(out.runs).toHaveLength(2);
    expect(out.runs[0].seed).toBe(1);
  });
});

describe('AC-30.1: a recorded run replays bit-identically', () => {
  it('a full played run reproduces its own final state from seed + inputs alone', () => {
    const client = new GameClient({ seedSource: () => 4242 });
    client.setViewport(1280, 800);
    client.startRun();

    // Play: a wandering human, taking cards as they come.
    for (let frame = 0; frame < 2600; frame++) {
      const t = frame / 12;
      client.keys.clear();
      client.keys.down(Math.sin(t) > 0 ? 'KeyD' : 'KeyA');
      if (Math.cos(t) > 0) client.keys.down('KeyW');
      if (client.state?.phase === 'offer') client.onKey('Digit1', true);
      client.advance(16.7);
      if (client.screen === 'summary') break;
    }

    const played = client.state!;
    const recording = client.lastRecording ?? client.sealRecording();
    expect(recording).not.toBeNull();
    expect(recording!.inputs.length).toBeGreaterThan(0);
    // A change-log, not a per-tick dump: far fewer entries than ticks.
    expect(recording!.inputs.length).toBeLessThan(played.tick);

    const out = replay(makeRunConfigSafe(recording!.seed), recording!);
    expect(out.state.tick).toBe(played.tick);
    expect(JSON.stringify(out.state)).toBe(JSON.stringify(played));
  });
});
