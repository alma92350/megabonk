import { describe, it, expect } from 'vitest';
import { TICKS_PER_SECOND } from '@megabonk/sim';
import { createSession } from '../src/session.js';
import type { AgentRunSummary, McpSession } from '../src/session.js';
import { resolveHandicap } from '../src/handicap.js';
import { baselinePolicy, driveRun } from '../src/policy.js';

const quiet = () => {};

function run(
  seed: number,
  profile: 'human-parity' | 'unrestricted',
  frames: number,
  difficulty?: number,
): { summary: AgentRunSummary; session: McpSession } {
  const session = createSession({
    seed,
    mode: 'autonomous',
    handicap: resolveHandicap({ profile }),
    warn: quiet,
    ...(difficulty !== undefined ? { runOptions: { difficulty } } : {}),
  });
  session.startRun();
  const summary = driveRun(session, baselinePolicy, { maxFrames: frames });
  return { summary, session };
}

describe('FR-26/FR-28 the agent path as a regression test', () => {
  it('AC-28.5/26.2: same seed + same policy under the handicap gives an identical summary', () => {
    const first = JSON.stringify(run(2024, 'human-parity', 3000).summary);
    for (let i = 0; i < 12; i++) {
      expect(JSON.stringify(run(2024, 'human-parity', 3000).summary)).toBe(first);
    }
    // And the handicap is not a global: a second profile in the same process does
    // not perturb the first.
    run(2024, 'unrestricted', 500);
    expect(JSON.stringify(run(2024, 'human-parity', 3000).summary)).toBe(first);
  });

  it('AC-28.5: different seeds actually diverge — the determinism check is not vacuous', () => {
    const a = run(11, 'human-parity', 1500).summary;
    const b = run(12, 'human-parity', 1500).summary;
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it(
    'AC-26.1: the baseline policy completes a full 900 s run under the handicap without error',
    { timeout: 120_000 },
    () => {
      const { summary, session } = run(808, 'human-parity', 900 * TICKS_PER_SECOND * 2);
      expect(session.engine.state.phase).toBe('ended');
      expect(summary.inProgress).toBe(false);
      expect(summary.agentProfile).toBe('human-parity');
      expect(summary.seconds).toBeGreaterThan(0);
      expect(['survived', 'died']).toContain(summary.outcome);
    },
  );
});

describe('FR-30 parity validation', () => {
  /**
   * AC-30.3: the check that catches a handicap silently wired to a no-op.
   *
   * Measured on the PRD's own parity metric — run duration — at a difficulty that
   * kills the baseline policy under both profiles, so the comparison is about how
   * long each survives rather than about who reaches the 900 s wall first.
   *
   * Aggregate, not per-seed: the handicap raises the *distribution* of outcomes, and
   * an individual seed can still favour the blinded agent by luck.
   */
  it('AC-30.3: the same policy under unrestricted measurably outlives human-parity', () => {
    const seeds = [1, 2, 3, 4];
    const frames = 30_000;
    const survival = (profile: 'human-parity' | 'unrestricted'): number[] =>
      seeds.map((seed) => run(seed, profile, frames, 4).session.engine.state.tick);

    const bound = survival('human-parity');
    const free = survival('unrestricted');
    const total = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

    const ratio = total(free) / total(bound);
    expect(total(free)).toBeGreaterThan(total(bound));
    // A no-op handicap would sit at ~1.0. Measured ~1.74 at the time of writing.
    expect(ratio).toBeGreaterThan(1.25);
  });

  it('AC-30.3: unrestricted also takes dramatically less damage at standard difficulty', () => {
    const seeds = [1, 2, 3];
    const damage = (profile: 'human-parity' | 'unrestricted'): number =>
      seeds.reduce((sum, seed) => sum + run(seed, profile, 5000).summary.damageTaken, 0);
    const bound = damage('human-parity');
    const free = damage('unrestricted');
    expect(free).toBeLessThan(bound);
    expect(free).toBeLessThan(bound * 0.6);
  });

  it('AC-29.1/30.x: a summary always discloses which profile produced it', () => {
    expect(run(5, 'human-parity', 300).summary.agentProfile).toBe('human-parity');
    expect(run(5, 'unrestricted', 300).summary.agentProfile).toBe('unrestricted');
  });
});
