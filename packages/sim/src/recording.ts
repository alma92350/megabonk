/**
 * Run recording and replay.
 *
 * A recording is a SEED plus an input log — nothing else. Because `step` is a
 * pure deterministic function of (state, input, dt), those two things
 * reconstruct a run exactly, which is what makes this the cheapest possible
 * artifact: a 15-minute run is a few hundred bytes, not a state dump.
 *
 * Two things this unlocks:
 *  - A corpus of real human runs, which FR-30's parity validation needs and
 *    which nothing else can supply (AC-30.1/30.2).
 *  - Replay, PRD open question #3, answered in favour of seed + input log.
 *
 * The log stores CHANGES, not per-tick frames. Movement is held between changes,
 * so a run where the player walks west for ten seconds is one entry. One-shot
 * actions (an upgrade pick) are stored per occurrence and never coalesced —
 * merging two picks would desynchronise every tick after the second level-up.
 */

import { createRun } from './state.js';
import { step } from './step.js';
import { TICK_MS } from './rules.js';
import type { MetaUnlocks, RunConfig } from './content-types.js';
import type { GameState, InputFrame, SimEvent, Vec2 } from './types.js';

export const RECORDING_VERSION = 1;

export interface RecordedInput {
  readonly tick: number;
  readonly move: Vec2;
  readonly chooseIndex?: number;
  readonly reroll?: boolean;
  readonly buyIndex?: number;
}

export interface Recording {
  readonly version: number;
  readonly seed: number;
  readonly characterId: string;
  readonly biomeId: string;
  /** Total ticks the run lasted. Replay stops here. */
  readonly ticks: number;
  readonly inputs: readonly RecordedInput[];
  /** Meta-unlocks the run started with; without them a replay diverges. */
  readonly unlocks?: MetaUnlocks;
  /** Difficulty multiplier the run started with. */
  readonly difficulty?: number;
  /** Optional provenance: who or what produced this run. */
  readonly source?: string;
  readonly label?: string;
}

export interface RecordingMeta {
  readonly seed: number;
  readonly characterId: string;
  readonly biomeId: string;
  readonly unlocks?: MetaUnlocks;
  readonly difficulty?: number;
  readonly source?: string;
  readonly label?: string;
}

function sameMove(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

function hasOneShot(input: InputFrame): boolean {
  return (
    input.chooseIndex !== undefined || input.reroll === true || input.buyIndex !== undefined
  );
}

/** Accumulates a recording as a run is played. Cheap enough to run every tick. */
export class RecordingBuilder {
  private readonly inputs: RecordedInput[] = [];
  private lastMove: Vec2 | null = null;

  constructor(private readonly meta: RecordingMeta) {}

  record(tick: number, input: InputFrame): void {
    const oneShot = hasOneShot(input);
    // A one-shot always gets its own entry; otherwise only a direction CHANGE does.
    if (!oneShot && this.lastMove !== null && sameMove(this.lastMove, input.move)) return;

    const entry: RecordedInput = {
      tick,
      move: { x: input.move.x, y: input.move.y },
      ...(input.chooseIndex !== undefined ? { chooseIndex: input.chooseIndex } : {}),
      ...(input.reroll === true ? { reroll: true } : {}),
      ...(input.buyIndex !== undefined ? { buyIndex: input.buyIndex } : {}),
    };
    this.inputs.push(entry);
    this.lastMove = entry.move;
  }

  get length(): number {
    return this.inputs.length;
  }

  build(ticks: number): Recording {
    return {
      version: RECORDING_VERSION,
      seed: this.meta.seed,
      characterId: this.meta.characterId,
      biomeId: this.meta.biomeId,
      ticks,
      inputs: this.inputs.slice(),
      ...(this.meta.unlocks !== undefined ? { unlocks: this.meta.unlocks } : {}),
      ...(this.meta.difficulty !== undefined ? { difficulty: this.meta.difficulty } : {}),
      ...(this.meta.source !== undefined ? { source: this.meta.source } : {}),
      ...(this.meta.label !== undefined ? { label: this.meta.label } : {}),
    };
  }
}

const NO_MOVE: Vec2 = Object.freeze({ x: 0, y: 0 });

/**
 * The input frame for a tick: the last movement change at or before it, plus any
 * one-shot recorded at exactly this tick.
 */
export function inputAtTick(recording: Recording, tick: number): InputFrame {
  let move: Vec2 = NO_MOVE;
  let oneShot: RecordedInput | null = null;
  for (const entry of recording.inputs) {
    if (entry.tick > tick) break;
    move = entry.move;
    if (entry.tick === tick && hasOneShot(entry)) oneShot = entry;
  }
  return {
    move,
    ...(oneShot?.chooseIndex !== undefined ? { chooseIndex: oneShot.chooseIndex } : {}),
    ...(oneShot?.reroll === true ? { reroll: true } : {}),
    ...(oneShot?.buyIndex !== undefined ? { buyIndex: oneShot.buyIndex } : {}),
  };
}

export interface ReplayResult {
  readonly state: GameState;
  readonly events: readonly SimEvent[];
  /** True when the run ended before the recorded tick count was reached. */
  readonly truncated: boolean;
}

/**
 * Re-run a recording. The config must supply the same content bundle the
 * recording was made against; a different roster is a different game and will
 * simply diverge, which is why the harness pins a content fingerprint.
 */
export function replay(config: RunConfig, recording: Recording): ReplayResult {
  const cfg: RunConfig = {
    ...config,
    seed: recording.seed,
    characterId: recording.characterId,
    biomeId: recording.biomeId,
    ...(recording.unlocks !== undefined ? { unlocks: recording.unlocks } : {}),
    ...(recording.difficulty !== undefined ? { difficulty: recording.difficulty } : {}),
  };
  let state = createRun(cfg);
  const events: SimEvent[] = [...state.events];

  // An open offer freezes the clock, so this loop is bounded by iterations as
  // well as by ticks — otherwise an unanswered offer would spin forever.
  let guard = 0;
  const maxIterations = recording.ticks * 4 + 10_000;
  while (state.tick < recording.ticks && state.phase !== 'ended' && guard++ < maxIterations) {
    state = step(state, inputAtTick(recording, state.tick), TICK_MS, cfg);
    for (const e of state.events) events.push(e);
  }

  return { state, events, truncated: state.phase === 'ended' && state.tick < recording.ticks };
}

export interface ParsedRecording {
  readonly recording: Recording | null;
  readonly error?: string;
}

/** Treats the input as untrusted: a recording may come from a file a user picked. */
export function parseRecording(raw: string): ParsedRecording {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { recording: null, error: 'not valid JSON' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { recording: null, error: 'not a recording object' };
  }
  const r = data as Partial<Recording>;
  if (r.version !== RECORDING_VERSION) {
    return {
      recording: null,
      error: `recording format version ${String(r.version)} is not ${RECORDING_VERSION}`,
    };
  }
  if (
    !Number.isFinite(r.seed) ||
    typeof r.characterId !== 'string' ||
    typeof r.biomeId !== 'string' ||
    !Number.isFinite(r.ticks) ||
    !Array.isArray(r.inputs)
  ) {
    return { recording: null, error: 'recording is missing required fields' };
  }
  const inputs: RecordedInput[] = [];
  for (const raw of r.inputs) {
    const e = raw as Partial<RecordedInput>;
    if (!Number.isFinite(e.tick) || typeof e.move !== 'object' || e.move === null) continue;
    if (!Number.isFinite(e.move.x) || !Number.isFinite(e.move.y)) continue;
    inputs.push({
      tick: e.tick as number,
      move: { x: e.move.x, y: e.move.y },
      ...(Number.isFinite(e.chooseIndex) ? { chooseIndex: e.chooseIndex as number } : {}),
      ...(e.reroll === true ? { reroll: true } : {}),
      ...(Number.isFinite(e.buyIndex) ? { buyIndex: e.buyIndex as number } : {}),
    });
  }
  return {
    recording: {
      version: RECORDING_VERSION,
      seed: r.seed as number,
      characterId: r.characterId,
      biomeId: r.biomeId,
      ticks: r.ticks as number,
      inputs,
      ...(typeof r.unlocks === 'object' && r.unlocks !== null ? { unlocks: r.unlocks } : {}),
      ...(Number.isFinite(r.difficulty) ? { difficulty: r.difficulty as number } : {}),
      ...(typeof r.source === 'string' ? { source: r.source } : {}),
      ...(typeof r.label === 'string' ? { label: r.label } : {}),
    },
  };
}
