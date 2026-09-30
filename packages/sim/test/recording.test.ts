import { describe, it, expect } from 'vitest';
import {
  RECORDING_VERSION, RecordingBuilder, inputAtTick, replay, parseRecording,
  type Recording,
} from '../src/recording.js';
import { createRun } from '../src/state.js';
import { step } from '../src/step.js';
import { TICK_MS, TICKS_PER_SECOND } from '../src/rules.js';
import type { InputFrame } from '../src/types.js';
import type { RunConfig } from '../src/content-types.js';
import { fixture } from './fixture.js';

const config = (over: Partial<RunConfig> = {}): RunConfig => ({
  seed: 909, characterId: 'tester', biomeId: 'testfield', content: fixture, ...over,
});

const still: InputFrame = { move: { x: 0, y: 0 } };

describe('run recording', () => {
  it('records only CHANGES, so a long run stays small', () => {
    const b = new RecordingBuilder({ seed: 1, characterId: 'tester', biomeId: 'testfield' });
    for (let t = 0; t < 10_000; t++) b.record(t, { move: { x: 1, y: 0 } });
    const rec = b.build(10_000);
    // One entry for the initial change, not ten thousand.
    expect(rec.inputs.length).toBe(1);
    expect(JSON.stringify(rec).length).toBeLessThan(500);
  });

  it('records each distinct direction change once', () => {
    const b = new RecordingBuilder({ seed: 1, characterId: 'tester', biomeId: 'testfield' });
    b.record(0, { move: { x: 1, y: 0 } });
    b.record(1, { move: { x: 1, y: 0 } });
    b.record(2, { move: { x: 0, y: 1 } });
    b.record(3, { move: { x: 0, y: 1 } });
    b.record(4, { move: { x: 0, y: 0 } });
    expect(b.build(5).inputs.map((i) => i.tick)).toEqual([0, 2, 4]);
  });

  it('records one-shot actions at their exact tick, never coalesced', () => {
    const b = new RecordingBuilder({ seed: 1, characterId: 'tester', biomeId: 'testfield' });
    b.record(10, { move: { x: 0, y: 0 }, chooseIndex: 2 });
    b.record(11, { move: { x: 0, y: 0 }, chooseIndex: 2 });
    const inputs = b.build(12).inputs;
    // Two separate picks at two ticks must both survive: coalescing them would
    // desynchronise every tick after the second level-up.
    expect(inputs.filter((i) => i.chooseIndex === 2)).toHaveLength(2);
  });

  it('inputAtTick reconstructs the held direction between changes', () => {
    const rec: Recording = {
      version: RECORDING_VERSION, seed: 1, characterId: 'tester', biomeId: 'testfield',
      ticks: 100, inputs: [
        { tick: 0, move: { x: 1, y: 0 } },
        { tick: 50, move: { x: 0, y: -1 } },
      ],
    };
    expect(inputAtTick(rec, 0).move).toEqual({ x: 1, y: 0 });
    expect(inputAtTick(rec, 49).move).toEqual({ x: 1, y: 0 });
    expect(inputAtTick(rec, 50).move).toEqual({ x: 0, y: -1 });
    expect(inputAtTick(rec, 99).move).toEqual({ x: 0, y: -1 });
  });

  it('a one-shot action appears at its tick and not at the next', () => {
    const rec: Recording = {
      version: RECORDING_VERSION, seed: 1, characterId: 'tester', biomeId: 'testfield',
      ticks: 10, inputs: [{ tick: 5, move: { x: 0, y: 0 }, chooseIndex: 1 }],
    };
    expect(inputAtTick(rec, 5).chooseIndex).toBe(1);
    expect(inputAtTick(rec, 6).chooseIndex).toBeUndefined();
  });

  it('replays a recorded run to a bit-identical final state', () => {
    const cfg = config();
    const b = new RecordingBuilder({ seed: cfg.seed, characterId: cfg.characterId, biomeId: cfg.biomeId });

    let state = createRun(cfg);
    let tick = 0;
    for (let i = 0; i < 6000 && state.phase !== 'ended'; i++) {
      const input: InputFrame =
        state.phase === 'offer'
          ? { move: { x: 0, y: 0 }, chooseIndex: i % 3 }
          : { move: { x: Math.sign(Math.sin(tick / 90)), y: Math.sign(Math.cos(tick / 70)) } };
      b.record(state.tick, input);
      state = step(state, input, TICK_MS, cfg);
      tick = state.tick;
    }
    const rec = b.build(state.tick);

    const replayed = replay(cfg, rec);
    expect(replayed.state.tick).toBe(state.tick);
    expect(replayed.state.kills).toBe(state.kills);
    expect(replayed.state.player.level).toBe(state.player.level);
    expect(JSON.stringify(replayed.state)).toBe(JSON.stringify(state));
  });

  it('a replay is reproducible: replaying twice gives identical results', () => {
    const cfg = config();
    const b = new RecordingBuilder({ seed: cfg.seed, characterId: cfg.characterId, biomeId: cfg.biomeId });
    let state = createRun(cfg);
    for (let i = 0; i < 1200 && state.phase !== 'ended'; i++) {
      const input: InputFrame = state.phase === 'offer'
        ? { move: { x: 0, y: 0 }, chooseIndex: 0 }
        : { move: { x: 1, y: 0 } };
      b.record(state.tick, input);
      state = step(state, input, TICK_MS, cfg);
    }
    const rec = b.build(state.tick);
    expect(JSON.stringify(replay(cfg, rec).state)).toBe(JSON.stringify(replay(cfg, rec).state));
  });

  it('a recording round-trips through JSON unchanged', () => {
    const b = new RecordingBuilder({ seed: 5, characterId: 'tester', biomeId: 'testfield' });
    b.record(0, { move: { x: 1, y: 1 } });
    b.record(30, { move: { x: 0, y: 0 }, chooseIndex: 1 });
    const rec = b.build(60);
    expect(parseRecording(JSON.stringify(rec)).recording).toEqual(rec);
  });

  it('carries meta-unlocks and difficulty, so a replay starts from the same state', () => {
    const unlocks = { extraRerolls: 2, extraWeaponSlots: 1, bonusLuck: 0.2 };
    const b = new RecordingBuilder({
      seed: 5, characterId: 'tester', biomeId: 'testfield', unlocks, difficulty: 1.5,
    });
    b.record(0, { move: { x: 1, y: 0 } });
    const rec = b.build(120);
    expect(parseRecording(JSON.stringify(rec)).recording).toEqual(rec);
    const cfg = config({ seed: 5, unlocks, difficulty: 1.5 });
    const plain = replay(config({ seed: 5 }), rec).state;
    expect(replay(config({ seed: 5 }), rec).state).toEqual(replay(cfg, rec).state);
    expect(plain.tick).toBeGreaterThan(0);
  });

  it('rejects a recording from a different format version rather than misreplaying it', () => {
    const b = new RecordingBuilder({ seed: 5, characterId: 'tester', biomeId: 'testfield' });
    const rec = { ...b.build(10), version: RECORDING_VERSION + 99 };
    const out = parseRecording(JSON.stringify(rec));
    expect(out.recording).toBeNull();
    expect(out.error).toMatch(/version/i);
  });

  it('rejects malformed input rather than throwing', () => {
    for (const bad of ['', 'not json', '{}', '[]', 'null']) {
      const out = parseRecording(bad);
      expect(out.recording).toBeNull();
      expect(out.error).toBeTruthy();
    }
  });

  it('replaying past the recorded end simply stops, and never invents input', () => {
    const cfg = config();
    const b = new RecordingBuilder({ seed: cfg.seed, characterId: cfg.characterId, biomeId: cfg.biomeId });
    b.record(0, { move: { x: 1, y: 0 } });
    const rec = b.build(120);
    const out = replay(cfg, rec);
    expect(out.state.tick).toBe(120);
    expect(out.truncated).toBe(false);
  });

  it('carries the summary-bearing event log so a replay can be scored', () => {
    const cfg = config();
    const b = new RecordingBuilder({ seed: cfg.seed, characterId: cfg.characterId, biomeId: cfg.biomeId });
    b.record(0, { move: { x: -1, y: 0 } });
    const out = replay(cfg, b.build(TICKS_PER_SECOND * 20));
    expect(out.events.some((e) => e.type === 'run_start')).toBe(true);
    expect(out.events.length).toBeGreaterThan(1);
  });
});
