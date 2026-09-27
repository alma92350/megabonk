/**
 * NFR-2 benchmark gate: `npm run bench`
 *
 * Measures the two PRD §2.3 performance targets and compares them against a
 * committed baseline, failing on a regression worse than 20%:
 *
 *   - sim step at several live-entity counts, up to the MAX_ENTITIES cap  (< 8 ms p95)
 *   - headless full run, 15 game-minutes = 54,000 ticks                   (< 10 s)
 *
 * Two deliberate choices about the measurement:
 *
 * 1. The entity-count scenarios use harmless, unkillable enemies and a frozen
 *    spawn rate, so the live population is EXACTLY the number in the label for
 *    the whole window. A swarm that is still spawning and dying measures a moving
 *    population and produces a number that drifts run to run.
 * 2. The full-run timing is measured over several seeds and reported as
 *    p50/max, because wall time is strongly seed-dependent: a build that
 *    out-damages the spawn rate ends with tens of live enemies, one that does not
 *    ends with hundreds, and the tick cost follows the population. Reporting a
 *    single seed would be reporting whichever number flattered us.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_ENTITIES, TICK_MS, step } from '@megabonk/sim';
import type { GameState, RunConfig } from '@megabonk/sim';
import { makeRunConfig } from '@megabonk/content';
import { drive, FULL_RUN_TICKS } from './drive.js';
import { stationaryPolicy, baselinePolicy } from './policy.js';
import { benchSwarmConfig, frozenConfig, survivableConfig } from './scenarios.js';
import { argWarnings, boolArg, intArg, parseArgs } from './args.js';

export const BASELINE_PATH = fileURLToPath(new URL('../bench-baseline.json', import.meta.url));

/** PRD §2.3 targets, as numbers so the report can state the gap either way. */
export const PRD_STEP_P95_MS = 8;
export const PRD_FULL_RUN_MS = 10_000;
/** A regression worse than this against the committed baseline fails the gate. */
export const REGRESSION_TOLERANCE = 0.2;

export const ENTITY_COUNTS: readonly number[] = [100, 500, 1000, MAX_ENTITIES];

export interface Quantiles {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly mean: number;
  readonly samples: number;
}

function quantiles(values: readonly number[]): Quantiles {
  const sorted = values.slice().sort((a, b) => a - b);
  const at = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  const mean = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99), mean, samples: sorted.length };
}

function round(n: number, dp = 3): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/**
 * Build a state holding exactly `count` live enemies, with a config whose spawn
 * rate is zero so the population cannot move during measurement.
 */
export function staticPopulation(count: number, seed = 7): { state: GameState; config: RunConfig } {
  const swarm = benchSwarmConfig(makeRunConfig(seed));
  const frozen = frozenConfig(swarm);
  let ticks = 0;
  const r = drive(swarm, {
    ticks: 4000,
    policy: stationaryPolicy,
    collectEvents: false,
    onTick: () => { ticks++; },
  });
  void ticks;
  if (r.state.enemies.length < count) {
    throw new Error(`bench: could only reach ${r.state.enemies.length} live enemies, needed ${count}`);
  }
  // Lowest ids first, so the retained subset is stable across runs.
  const enemies = r.state.enemies.slice().sort((a, b) => a.id - b.id).slice(0, count);
  return { state: { ...r.state, enemies, events: [] }, config: frozen };
}

export interface StepMeasurement extends Quantiles {
  readonly entities: number;
  /** Live enemies actually present on the last measured tick, as a sanity check. */
  readonly observedEntities: number;
}

export function measureStepCost(count: number, samples = 400, warmup = 60): StepMeasurement {
  const { state: start, config } = staticPopulation(count);
  let state = start;
  const input = { move: { x: 0.6, y: 0.8 } };
  for (let i = 0; i < warmup; i++) {
    state = step(state, state.phase === 'offer' ? { ...input, chooseIndex: 0 } : input, TICK_MS, config);
  }
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const frame = state.phase === 'offer' ? { ...input, chooseIndex: 0 } : input;
    const t0 = performance.now();
    state = step(state, frame, TICK_MS, config);
    times.push(performance.now() - t0);
  }
  return { ...quantiles(times), entities: count, observedEntities: state.enemies.length };
}

export interface FullRunMeasurement {
  readonly seeds: readonly number[];
  readonly ticks: number;
  readonly perSeedMs: readonly number[];
  readonly p50Ms: number;
  readonly maxMs: number;
  readonly finalEnemies: readonly number[];
}

/**
 * Time a full 54,000-tick headless run. Uses the survivable scenario, because
 * with current balance a real run ends on player death at around t=140 s and
 * timing that would not measure the 15-game-minute budget at all.
 */
export function measureFullRun(seeds: readonly number[] = [1, 2, 3], ticks = FULL_RUN_TICKS): FullRunMeasurement {
  const perSeedMs: number[] = [];
  const finalEnemies: number[] = [];
  for (const seed of seeds) {
    const config = survivableConfig(makeRunConfig(seed));
    const t0 = performance.now();
    const r = drive(config, { ticks, policy: stationaryPolicy, collectEvents: false });
    perSeedMs.push(round(performance.now() - t0, 1));
    finalEnemies.push(r.state.enemies.length);
    if (r.state.tick !== ticks) {
      throw new Error(`bench: full run for seed ${seed} stopped at tick ${r.state.tick} (${r.stopReason})`);
    }
  }
  const sorted = perSeedMs.slice().sort((a, b) => a - b);
  return {
    seeds,
    ticks,
    perSeedMs,
    p50Ms: sorted[Math.floor(sorted.length / 2)] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
    finalEnemies,
  };
}

export interface BenchReport {
  readonly formatVersion: 1;
  readonly generatedAt: string;
  readonly node: string;
  readonly steps: readonly StepMeasurement[];
  readonly fullRun: FullRunMeasurement;
}

export function runBenchmarks(samples: number, fullRunSeeds: readonly number[]): BenchReport {
  return {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    node: process.version,
    steps: ENTITY_COUNTS.map((n) => measureStepCost(n, samples)),
    fullRun: measureFullRun(fullRunSeeds),
  };
}

export function loadBaseline(): BenchReport | null {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as BenchReport;
}

export function writeBaseline(report: BenchReport): void {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export interface Comparison {
  readonly metric: string;
  readonly current: number;
  readonly baseline: number | null;
  readonly deltaPct: number | null;
  readonly regressed: boolean;
}

export function compareToBaseline(report: BenchReport, baseline: BenchReport | null): Comparison[] {
  const out: Comparison[] = [];
  const add = (metric: string, current: number, base: number | undefined): void => {
    if (base === undefined || base <= 0) {
      out.push({ metric, current: round(current), baseline: null, deltaPct: null, regressed: false });
      return;
    }
    const deltaPct = ((current - base) / base) * 100;
    out.push({
      metric,
      current: round(current),
      baseline: round(base),
      deltaPct: round(deltaPct, 1),
      regressed: deltaPct > REGRESSION_TOLERANCE * 100,
    });
  };

  for (const s of report.steps) {
    const base = baseline?.steps.find((b) => b.entities === s.entities);
    add(`step p95 @ ${s.entities} entities (ms)`, s.p95, base?.p95);
  }
  add('full run p50 (ms)', report.fullRun.p50Ms, baseline?.fullRun.p50Ms);
  return out;
}

export interface PrdCheck {
  readonly metric: string;
  readonly measured: number;
  readonly target: number;
  readonly withinTarget: boolean;
}

export function checkPrdTargets(report: BenchReport): PrdCheck[] {
  const cap = report.steps.find((s) => s.entities === MAX_ENTITIES);
  const checks: PrdCheck[] = [];
  if (cap) {
    checks.push({
      metric: `sim step p95 @ ${MAX_ENTITIES} entities`,
      measured: round(cap.p95),
      target: PRD_STEP_P95_MS,
      withinTarget: cap.p95 < PRD_STEP_P95_MS,
    });
  }
  checks.push({
    metric: 'headless full run (15 game-minutes), p50 of seeds',
    measured: round(report.fullRun.p50Ms, 0),
    target: PRD_FULL_RUN_MS,
    withinTarget: report.fullRun.p50Ms < PRD_FULL_RUN_MS,
  });
  checks.push({
    metric: 'headless full run (15 game-minutes), worst seed',
    measured: round(report.fullRun.maxMs, 0),
    target: PRD_FULL_RUN_MS,
    withinTarget: report.fullRun.maxMs < PRD_FULL_RUN_MS,
  });
  return checks;
}

export const BENCH_USAGE = `megabonk benchmark gate (NFR-2)

  npm run bench [-- options]

  --update            overwrite the committed baseline with this run's numbers
  --samples=N         step samples per entity count (default 400)
  --seeds=a,b,c       seeds for the full-run timing (default 1,2,3)
  --quick             fewer samples and one full-run seed, for a fast local check
  --json              machine-readable report on stdout
  --strict-prd        also exit non-zero when a PRD §2.3 target is missed
  --help              this text`;

export function runBenchCli(argv: readonly string[], log: (s: string) => void = console.log): number {
  const args = parseArgs(argv, ['samples', 'seeds']);
  const known = ['update', 'samples', 'seeds', 'quick', 'json', 'strict-prd', 'help'];
  if (boolArg(args, 'help')) {
    log(BENCH_USAGE);
    return 0;
  }
  for (const w of argWarnings(args, known)) log(`warning: ${w}`);

  const quick = boolArg(args, 'quick');
  const samples = intArg(args, 'samples', quick ? 120 : 400);
  const rawSeeds = args.values.seeds;
  const seeds = rawSeeds
    ? rawSeeds.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
    : quick
      ? [1]
      : [1, 2, 3];

  log('Running benchmarks (this measures, it does not simulate gameplay)...');
  const report = runBenchmarks(samples, seeds.length > 0 ? seeds : [1]);

  if (boolArg(args, 'json')) {
    log(JSON.stringify({ report, prd: checkPrdTargets(report), comparison: compareToBaseline(report, loadBaseline()) }, null, 2));
    return 0;
  }

  log('');
  log('  entities    p50      p95      p99     mean    (ms/tick)');
  for (const s of report.steps) {
    log(
      `  ${String(s.entities).padStart(8)}  ${s.p50.toFixed(3).padStart(6)}  ${s.p95
        .toFixed(3)
        .padStart(6)}  ${s.p99.toFixed(3).padStart(6)}  ${s.mean.toFixed(3).padStart(6)}`,
    );
  }
  log('');
  log(`  full run ${report.fullRun.ticks} ticks x ${report.fullRun.seeds.length} seed(s): ` +
    `${report.fullRun.perSeedMs.map((m) => `${(m / 1000).toFixed(2)}s`).join(', ')} ` +
    `(p50 ${(report.fullRun.p50Ms / 1000).toFixed(2)}s, worst ${(report.fullRun.maxMs / 1000).toFixed(2)}s)`);
  log(`  final live enemies per seed: ${report.fullRun.finalEnemies.join(', ')}`);

  log('');
  log('  PRD §2.3 targets');
  const prd = checkPrdTargets(report);
  for (const c of prd) {
    log(`    ${c.withinTarget ? 'PASS' : 'MISS'}  ${c.metric}: ${c.measured} vs target < ${c.target}`);
  }

  if (boolArg(args, 'update')) {
    writeBaseline(report);
    log('');
    log(`  baseline updated: ${BASELINE_PATH}`);
    return 0;
  }

  const baseline = loadBaseline();
  log('');
  if (!baseline) {
    log('  no committed baseline found — run `npm run bench -- --update` to create one');
    return 0;
  }
  log(`  regression gate vs baseline from ${baseline.generatedAt} (tolerance ${REGRESSION_TOLERANCE * 100}%)`);
  const comparisons = compareToBaseline(report, baseline);
  let regressed = false;
  for (const c of comparisons) {
    const delta = c.deltaPct === null ? '   n/a' : `${c.deltaPct > 0 ? '+' : ''}${c.deltaPct}%`;
    log(`    ${c.regressed ? 'FAIL' : 'ok  '}  ${c.metric}: ${c.current} (baseline ${String(c.baseline)}, ${delta})`);
    if (c.regressed) regressed = true;
  }

  const prdMissed = prd.some((c) => !c.withinTarget);
  if (regressed) {
    log('');
    log('  BENCHMARK REGRESSION: a metric is more than 20% slower than the committed baseline.');
    return 1;
  }
  if (prdMissed && boolArg(args, 'strict-prd')) {
    log('');
    log('  PRD TARGET MISSED (--strict-prd).');
    return 1;
  }
  return 0;
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return entry.endsWith('bench.ts') || entry.endsWith('bench.js');
}

if (isMain()) {
  process.exitCode = runBenchCli(process.argv.slice(2));
}

export { baselinePolicy };
