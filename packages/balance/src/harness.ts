/**
 * Headless balance harness.
 *
 * Runs N seeded runs with a scripted policy through the real `createRun`/`step`
 * loop and reports distributions. Nothing here reaches into the sim: it submits
 * InputFrames and reads GameState, which is exactly the contract the client and
 * the MCP server use. If a number measured here is wrong, the game is wrong.
 */

import { TICK_MS, TICKS_PER_SECOND, createRun, step, summarise } from '@megabonk/sim';
import type { GameState, RunConfig, RunSummary, SimEvent } from '@megabonk/sim';
import { makeRunConfig, type RunOptions } from '@megabonk/content';
import { inputFor, type Policy } from './policies.js';

export interface SampleRow {
  readonly seconds: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly level: number;
  readonly kills: number;
  readonly gold: number;
  readonly enemies: number;
  /** Damage dealt during the preceding sample window, per second. */
  readonly dps: number;
  /** Damage taken during the preceding sample window, per second. */
  readonly dtps: number;
}

export interface RunResult {
  readonly seed: number;
  readonly policy: string;
  readonly summary: RunSummary;
  readonly survived: boolean;
  readonly seconds: number;
  readonly level: number;
  readonly kills: number;
  readonly gold: number;
  readonly samples: readonly SampleRow[];
  /** Level at each whole minute reached, index 0 = 60 s. */
  readonly levelAtMinute: readonly number[];
  readonly finalState: GameState;
  /** Only populated when `collectEvents` is set; a 900 s run emits ~10^5 events. */
  readonly events?: readonly SimEvent[];
}

export interface RunOpts extends RunOptions {
  /** Stop early at this many seconds even if the player is alive. */
  readonly maxSeconds?: number;
  /** Sample cadence in seconds. */
  readonly sampleEvery?: number;
  readonly collectEvents?: boolean;
}

/** Run one seeded run to death, to `maxSeconds`, or to the biome's end. */
export function runOnce(seed: number, policy: Policy, opts: RunOpts = {}): RunResult {
  const sampleEvery = opts.sampleEvery ?? 15;
  const maxSeconds = opts.maxSeconds ?? 900;
  const cfg: RunConfig = makeRunConfig(seed, opts);

  let state = createRun(cfg);
  const events: SimEvent[] = [...state.events];
  const samples: SampleRow[] = [];
  const levelAtMinute: number[] = [];

  const sampleTicks = Math.max(1, Math.round(sampleEvery * TICKS_PER_SECOND));
  const limitTicks = Math.round(maxSeconds * TICKS_PER_SECOND);
  let lastDealt = 0;
  let lastTaken = 0;
  let nextMinute = 1;

  // An offer pauses the sim (tick does not advance), so a tick budget alone would
  // deadlock on a state that keeps re-opening offers. Guard on iterations too.
  let guard = 0;
  const guardLimit = limitTicks * 2 + 200000;

  while (state.phase !== 'ended' && state.tick < limitTicks && guard++ < guardLimit) {
    state = step(state, inputFor(state, policy), TICK_MS, cfg);
    if (state.events.length > 0) events.push(...state.events);

    if (state.tick % sampleTicks === 0 && state.phase !== 'offer') {
      const window = sampleTicks / TICKS_PER_SECOND;
      samples.push({
        seconds: state.tick / TICKS_PER_SECOND,
        hp: state.player.hp,
        maxHp: state.player.stats.maxHp,
        level: state.player.level,
        kills: state.kills,
        gold: state.player.gold,
        enemies: state.enemies.length,
        dps: (state.damageDealt - lastDealt) / window,
        dtps: (state.damageTaken - lastTaken) / window,
      });
      lastDealt = state.damageDealt;
      lastTaken = state.damageTaken;
    }
    while (state.tick >= nextMinute * 60 * TICKS_PER_SECOND) {
      levelAtMinute.push(state.player.level);
      nextMinute++;
    }
  }

  const summary = summarise(events);
  return {
    seed,
    policy: policy.name,
    summary,
    survived: state.outcome === 'survived' || state.phase !== 'ended',
    seconds: state.tick / TICKS_PER_SECOND,
    level: state.player.level,
    kills: state.kills,
    gold: state.player.gold,
    samples,
    levelAtMinute,
    finalState: state,
    ...(opts.collectEvents === true ? { events } : {}),
  };
}

export function runMany(seeds: readonly number[], policy: Policy, opts: RunOpts = {}): RunResult[] {
  return seeds.map((s) => runOnce(s, policy, opts));
}

export function seedRange(from: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => from + i);
}

// ---------------------------------------------------------------------------
// Distribution helpers. Median and quantiles, not means: run length is
// heavy-tailed and a mean hides the seed that died at 40 s.
// ---------------------------------------------------------------------------

export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const w = idx - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

export interface Distribution {
  readonly n: number;
  readonly min: number;
  readonly p25: number;
  readonly median: number;
  readonly p75: number;
  readonly max: number;
  readonly mean: number;
}

export function describe(values: readonly number[]): Distribution {
  return {
    n: values.length,
    min: values.length ? Math.min(...values) : Number.NaN,
    p25: quantile(values, 0.25),
    median: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    max: values.length ? Math.max(...values) : Number.NaN,
    mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : Number.NaN,
  };
}

export interface CohortReport {
  readonly policy: string;
  readonly seeds: number;
  readonly survivalRate: number;
  readonly duration: Distribution;
  readonly level: Distribution;
  readonly kills: Distribution;
  readonly gold: Distribution;
  readonly damageTaken: Distribution;
  /** Fraction of runs still alive at each 60 s mark, index 0 = 60 s. */
  readonly aliveAtMinute: readonly number[];
  /** Median level at each 60 s mark. */
  readonly medianLevelAtMinute: readonly number[];
  /** Median damage-dealt-per-second at each sample point. */
  readonly dpsCurve: readonly { readonly seconds: number; readonly medianDps: number }[];
}

export function report(results: readonly RunResult[], maxSeconds = 900): CohortReport {
  const minutes = Math.floor(maxSeconds / 60);
  const aliveAtMinute: number[] = [];
  const medianLevelAtMinute: number[] = [];
  for (let m = 0; m < minutes; m++) {
    const alive = results.filter((r) => r.seconds > (m + 1) * 60 - 1e-9 || r.survived).length;
    aliveAtMinute.push(alive / Math.max(1, results.length));
    const levels = results.map((r) => r.levelAtMinute[m]).filter((v): v is number => v !== undefined);
    medianLevelAtMinute.push(levels.length ? quantile(levels, 0.5) : Number.NaN);
  }

  const sampleTimes = new Set<number>();
  for (const r of results) for (const s of r.samples) sampleTimes.add(s.seconds);
  const dpsCurve = [...sampleTimes]
    .sort((a, b) => a - b)
    .map((seconds) => {
      const vals = results
        .map((r) => r.samples.find((s) => s.seconds === seconds)?.dps)
        .filter((v): v is number => v !== undefined);
      return { seconds, medianDps: quantile(vals, 0.5) };
    });

  return {
    policy: results[0]?.policy ?? 'none',
    seeds: results.length,
    // `survived` rather than `outcome === 'survived'`: a cohort truncated at
    // maxSeconds has no outcome yet, and counting those as deaths would report
    // every short measurement run as a 0% survival rate.
    survivalRate: results.filter((r) => r.survived).length / Math.max(1, results.length),
    duration: describe(results.map((r) => r.seconds)),
    level: describe(results.map((r) => r.level)),
    kills: describe(results.map((r) => r.kills)),
    gold: describe(results.map((r) => r.summary.goldEarned)),
    damageTaken: describe(results.map((r) => r.summary.damageTaken)),
    aliveAtMinute,
    medianLevelAtMinute,
    dpsCurve,
  };
}

function fmt(n: number, places = 1): string {
  return Number.isFinite(n) ? n.toFixed(places) : '--';
}

export function formatReport(r: CohortReport): string {
  const lines: string[] = [];
  lines.push(`policy=${r.policy}  seeds=${r.seeds}  survivalRate=${fmt(r.survivalRate * 100)}%`);
  const row = (label: string, d: Distribution) =>
    `  ${label.padEnd(9)} min=${fmt(d.min)} p25=${fmt(d.p25)} med=${fmt(d.median)} p75=${fmt(d.p75)} max=${fmt(d.max)}`;
  lines.push(row('duration', r.duration));
  lines.push(row('level', r.level));
  lines.push(row('kills', r.kills));
  lines.push(row('gold', r.gold));
  lines.push(row('dmgTaken', r.damageTaken));
  lines.push(`  alive@min  ${r.aliveAtMinute.map((v) => fmt(v * 100, 0)).join(' ')}`);
  lines.push(`  level@min  ${r.medianLevelAtMinute.map((v) => fmt(v, 0)).join(' ')}`);
  lines.push(
    `  dps        ${r.dpsCurve.map((p) => `${p.seconds}s:${fmt(p.medianDps, 0)}`).join(' ')}`,
  );
  return lines.join('\n');
}
