/**
 * The canonical headless run driver (PRD §9 layer 3, FR-26).
 *
 * Everything else in the harness — determinism sweep, property tests, golden
 * corpus, benchmarks, the `agent:auto` CLI — goes through this function, so the
 * tick accounting is written down once and tested once.
 *
 * THE TICK-COUNTING CONTRACT
 * --------------------------
 * `step` does not advance `state.tick` while an offer is open (AC-19.2). A loop
 * written as `for (let i = 0; i < ticks; i++)` therefore stops short of the game
 * time it appears to request, by exactly the number of offers resolved — which in
 * a 900 s run is 30-odd ticks of missing game time and, in practice, a boss that
 * "never spawned". This loop's condition is `state.tick < ticks`, and a separate
 * iteration cap (not a tick cap) is what protects against a policy that never
 * resolves an offer.
 */

import { TICKS_PER_SECOND, TICK_MS, createRun, step, summarise } from '@megabonk/sim';
import type { GameState, InputFrame, RunConfig, RunSummary, SimEvent } from '@megabonk/sim';
import { baselinePolicy, type Policy } from './policy.js';

/** 15 game-minutes at 60 Hz: the PRD §2.3 full-run budget. */
export const FULL_RUN_TICKS = 54_000;

export type StopReason = 'ended' | 'tick-budget' | 'iteration-cap';

export interface DriveOptions {
  /** Sim ticks to advance at most. Defaults to a full 15-minute run. */
  readonly ticks?: number;
  readonly policy?: Policy;
  /**
   * Hard cap on loop iterations. Defaults to `ticks + 20000`, which is generous
   * headroom over the ~40 offers a real run resolves while still turning a
   * pathological policy (one that rerolls forever) into a reported stop rather
   * than a hung test.
   */
  readonly maxIterations?: number;
  /** Recorded in the summary (AC-29.1). Null means "a human drove this". */
  readonly agentProfile?: string | null;
  /** Set false for benchmarks, where retaining ~200k events dominates the cost. */
  readonly collectEvents?: boolean;
  /** Called once per ADVANCED tick, never on an offer iteration. */
  readonly onTick?: (state: GameState) => void;
}

export interface DriveResult {
  readonly state: GameState;
  /** Every event of the whole run, in order. Empty when `collectEvents: false`. */
  readonly events: readonly SimEvent[];
  readonly summary: RunSummary;
  readonly iterations: number;
  readonly offersResolved: number;
  readonly stopReason: StopReason;
  /** True when the tick budget or the iteration cap cut the run short. */
  readonly truncated: boolean;
}

function frameFor(state: GameState, policy: Policy, iteration: number): InputFrame {
  const proposed = policy(state, { iteration, tick: state.tick });
  if (state.phase !== 'offer') return proposed;

  const options = state.offer?.options.length ?? 0;
  if (proposed.reroll === true && state.player.rerolls > 0) return proposed;
  // Clamp rather than propagate: `step` throws on an out-of-range index, and a
  // policy bug should not look like a sim crash. Index 0 is the FR-26 default.
  const wanted = proposed.chooseIndex ?? 0;
  const chooseIndex = Number.isInteger(wanted) && wanted >= 0 && wanted < options ? wanted : 0;
  return { move: { x: 0, y: 0 }, chooseIndex };
}

export function drive(config: RunConfig, opts: DriveOptions = {}): DriveResult {
  const ticks = opts.ticks ?? FULL_RUN_TICKS;
  const policy = opts.policy ?? baselinePolicy;
  const collect = opts.collectEvents !== false;
  const maxIterations = opts.maxIterations ?? ticks + 20_000;
  const profile = opts.agentProfile ?? null;

  let state = createRun(config);
  const events: SimEvent[] = collect ? [...state.events] : [];
  let iterations = 0;
  let offersResolved = 0;
  let stopReason: StopReason = 'tick-budget';

  while (state.tick < ticks) {
    if (iterations >= maxIterations) {
      stopReason = 'iteration-cap';
      break;
    }
    if (state.phase === 'ended') {
      stopReason = 'ended';
      break;
    }
    iterations++;
    const wasOffer = state.phase === 'offer';
    const before = state.tick;
    state = step(state, frameFor(state, policy, iterations), TICK_MS, config);
    if (collect && state.events.length > 0) events.push(...state.events);
    if (wasOffer && state.tick === before) offersResolved++;
    else if (opts.onTick) opts.onTick(state);
  }
  if (state.phase === 'ended' && stopReason === 'tick-budget') stopReason = 'ended';

  const truncated = state.phase !== 'ended';
  // A truncated run has no `run_end` event, so `summarise` would report
  // `seconds: 0` and a default outcome. Feed it a synthetic terminator instead of
  // polluting the returned event log: the log stays exactly what the sim emitted.
  const forSummary: readonly SimEvent[] = truncated
    ? [
        ...events,
        {
          tick: state.tick,
          type: 'run_end',
          data: { outcome: 'died', seconds: state.tick / TICKS_PER_SECOND, truncated: true },
        },
      ]
    : events;

  return {
    state,
    events,
    summary: summarise(forSummary, profile),
    iterations,
    offersResolved,
    stopReason,
    truncated,
  };
}
