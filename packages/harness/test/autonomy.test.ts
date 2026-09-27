/**
 * PRD §2.3: "Autonomous agent run completion rate (handicap on) ≥ 80% of runs
 * reach the 10-minute mark", and FR-26/AC-26.1-2.
 *
 * This file MEASURES and REPORTS the rate; it does not assert 80%. The rate is a
 * joint property of the policy and of content balance, and content balance is
 * being retuned by someone else right now. Asserting 80% here would either fail
 * every CI run for reasons outside this package, or push whoever is on call to
 * "fix" it by making the policy cleverer — which hides the balance signal the game
 * designer needs. So the numbers are printed, and the assertions are limited to
 * what the harness itself owns: runs complete without error, and they are
 * reproducible.
 *
 * Two policies are measured on the same seeds precisely so the cause is
 * attributable: `baseline` is the naive AC-26.1 policy (kite nearest, pick 0) and
 * ignores incoming projectiles; `dodge` is the same policy plus projectile
 * avoidance. A gap between them is "the policy is naive"; a shortfall that both
 * share is "the content is too hard at this stage of tuning".
 */
import { describe, it, expect } from 'vitest';
import { TICKS_PER_SECOND } from '@megabonk/sim';
import { makeRunConfig } from '@megabonk/content';
import { drive, FULL_RUN_TICKS } from '../src/drive.js';
import { baselinePolicy, dodgePolicy, type Policy } from '../src/policy.js';

const TEN_MINUTES_S = 600;
const SEEDS = [1, 2, 3, 7, 11, 13, 42, 99] as const;

interface Rate {
  readonly reached: number;
  readonly of: number;
  readonly medianSeconds: number;
  readonly maxSeconds: number;
  readonly errors: number;
}

function measureRate(policy: Policy): Rate {
  const durations: number[] = [];
  let reached = 0;
  let errors = 0;
  for (const seed of SEEDS) {
    try {
      const r = drive(makeRunConfig(seed), {
        ticks: FULL_RUN_TICKS,
        policy,
        collectEvents: false,
      });
      const seconds = r.state.tick / TICKS_PER_SECOND;
      durations.push(seconds);
      if (seconds >= TEN_MINUTES_S) reached++;
    } catch {
      errors++;
    }
  }
  durations.sort((a, b) => a - b);
  return {
    reached,
    of: SEEDS.length,
    medianSeconds: durations[Math.floor(durations.length / 2)] ?? 0,
    maxSeconds: durations[durations.length - 1] ?? 0,
    errors,
  };
}

describe('PRD §2.3 autonomous completion rate (measured, not enforced)', () => {
  it('reports the 10-minute completion rate for the naive and the dodging policy', () => {
    const naive = measureRate(baselinePolicy);
    const dodging = measureRate(dodgePolicy);
    const pct = (r: Rate): string => `${((100 * r.reached) / r.of).toFixed(0)}%`;
    console.log(
      `  autonomous completion vs PRD target >= 80%:\n` +
        `    baseline (naive, ignores projectiles): ${naive.reached}/${naive.of} = ${pct(naive)} ` +
        `(median ${naive.medianSeconds.toFixed(0)} s, best ${naive.maxSeconds.toFixed(0)} s)\n` +
        `    dodge    (same + projectile evasion):  ${dodging.reached}/${dodging.of} = ${pct(dodging)} ` +
        `(median ${dodging.medianSeconds.toFixed(0)} s, best ${dodging.maxSeconds.toFixed(0)} s)`,
    );
    // What the harness owns: no errors, and every run produced a duration.
    expect(naive.errors).toBe(0);
    expect(dodging.errors).toBe(0);
    expect(naive.medianSeconds).toBeGreaterThan(0);
    expect(dodging.medianSeconds).toBeGreaterThan(0);
  }, 180_000);

  it('AC-26.1 the baseline policy drives a run to termination without error', () => {
    const r = drive(makeRunConfig(1), { ticks: FULL_RUN_TICKS, policy: baselinePolicy });
    expect(['ended', 'tick-budget']).toContain(r.stopReason);
    expect(r.events.some((e) => e.type === 'run_end')).toBe(r.state.phase === 'ended');
  }, 60_000);

  it('AC-26.2 the same policy and seed produce an identical RunSummary', () => {
    const a = drive(makeRunConfig(13), { ticks: FULL_RUN_TICKS, policy: baselinePolicy });
    const b = drive(makeRunConfig(13), { ticks: FULL_RUN_TICKS, policy: baselinePolicy });
    expect(b.summary).toEqual(a.summary);
  }, 60_000);

  it('projectile avoidance measurably improves survival — the handicap gap is real', () => {
    // If this ever stops holding, either the dodge logic is a no-op or projectiles
    // stopped being the dominant cause of death. Both are worth knowing.
    const naive = measureRate(baselinePolicy);
    const dodging = measureRate(dodgePolicy);
    expect(dodging.medianSeconds).toBeGreaterThan(naive.medianSeconds);
  }, 180_000);
});
