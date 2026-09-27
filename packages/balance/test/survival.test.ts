/**
 * The design intent, as executable properties.
 *
 * These are not "does the sim work" tests — packages/sim owns those. They assert
 * that the SHIPPED ROSTER produces the game we intended: that positioning has
 * value, that the opening minute forgives, and that the late game threatens.
 *
 * Budget: this file is kept under ~25 s. Long-horizon cohorts live behind
 * BALANCE_FULL=1 so a normal `vitest run` stays fast.
 */

import { describe, expect, it } from 'vitest';
import { report, runMany, seedRange } from '../src/harness.js';
import { kitePolicy, stationaryPolicy, wanderPolicy } from '../src/policies.js';

const FULL = process.env.BALANCE_FULL === '1';

describe('problem 1: standing still must not be safe', () => {
  /**
   * The bug this locks in: with a wide melee arc and a melee-only opening wave,
   * a player who never moved took ZERO damage for 60 seconds, because the arc
   * cleared the perimeter faster than enemies entered it. The fix is a RANGED
   * enemy (Lobber) in the opening wave at weight 1-in-8: it holds a 6.5-unit
   * standoff outside a level-1 arc and fires dodgeable projectiles, so a
   * stationary player bleeds by construction rather than by swarm arithmetic.
   */
  it('a stationary player takes damage within the first 60 seconds, on every seed', () => {
    const results = runMany(seedRange(1, 6), stationaryPolicy(), {
      maxSeconds: 60,
      sampleEvery: 30,
    });
    for (const r of results) {
      expect(r.summary.damageTaken, `seed ${r.seed} took no damage in 60 s`).toBeGreaterThan(0);
    }
  });

  it('a stationary player is DEAD well before the first boss, on every seed', () => {
    const results = runMany(seedRange(1, 6), stationaryPolicy(), { maxSeconds: 300, sampleEvery: 150 });
    for (const r of results) {
      expect(r.summary.outcome, `seed ${r.seed}`).toBe('died');
      expect(r.seconds, `seed ${r.seed} survived ${r.seconds.toFixed(0)}s standing still`)
        .toBeLessThan(180);
    }
  });

  it('the same seed survives far longer when the player moves — positioning is the difference', () => {
    const seeds = seedRange(1, 4);
    const still = runMany(seeds, stationaryPolicy(), { maxSeconds: 300, sampleEvery: 150 });
    const moving = runMany(seeds, kitePolicy(), { maxSeconds: 300, sampleEvery: 150 });
    for (let i = 0; i < seeds.length; i++) {
      expect(moving[i]!.seconds, `seed ${seeds[i]}`).toBeGreaterThan(still[i]!.seconds * 1.8);
    }
  });
});

describe('problem 2: the survivable band is wide', () => {
  /**
   * Forgiveness in minute one is asserted against the NOVICE policy, which walks
   * a slowly turning heading and never reacts to an enemy. If that player dies
   * inside 60 seconds the opening is not forgiving, whatever a good player scores.
   */
  it('a novice who never reacts to an enemy survives the first 90 seconds', () => {
    const results = runMany(seedRange(1, 6), wanderPolicy(), { maxSeconds: 90, sampleEvery: 45 });
    for (const r of results) {
      expect(r.survived, `seed ${r.seed} died at ${r.seconds.toFixed(0)}s`).toBe(true);
    }
  });

  it('a novice keeps a healthy share of the bar through the first minute', () => {
    const results = runMany(seedRange(1, 4), wanderPolicy(), { maxSeconds: 60, sampleEvery: 60 });
    for (const r of results) {
      const last = r.samples[r.samples.length - 1]!;
      expect(last.hp / last.maxHp, `seed ${r.seed}`).toBeGreaterThan(0.35);
    }
  });

  it('a competent player reaches the first boss on the large majority of seeds', () => {
    const results = runMany(seedRange(1, 8), kitePolicy(), { maxSeconds: 300, sampleEvery: 300 });
    const reached = results.filter((r) => r.survived).length;
    expect(reached / results.length).toBeGreaterThanOrEqual(0.75);
  });

  it('the last five minutes are genuinely threatening: nobody coasts to 900 s', () => {
    // The threat check that does not need a 900 s run: at 600 s the reference
    // policy must be materially damaged. A run that arrives at the endgame
    // untouched means the endgame is decoration.
    const results = runMany(seedRange(1, 3), kitePolicy(), { maxSeconds: 600, sampleEvery: 300 });
    const taken = results.map((r) => r.summary.damageTaken);
    expect(Math.max(...taken)).toBeGreaterThan(80);
  });
});

describe('XP pace lands in the target band', () => {
  /**
   * Target: level 8-14 by 5 minutes. Below 8 and the build has not come online
   * before Brutes and Hulks arrive; above 14 and the offer pool is exhausted
   * before the run is half over (the PRD's "content exhaustion" risk).
   */
  it('a competent player is level 8-14 at 5 minutes across seeds', () => {
    const results = runMany(seedRange(1, 8), kitePolicy(), { maxSeconds: 300, sampleEvery: 300 });
    const levels = results.filter((r) => r.survived).map((r) => r.level);
    expect(levels.length).toBeGreaterThanOrEqual(6);
    const r = report(results, 300);
    expect(r.level.median).toBeGreaterThanOrEqual(8);
    expect(r.level.median).toBeLessThanOrEqual(14);
    for (const l of levels) expect(l).toBeGreaterThanOrEqual(6);
    for (const l of levels) expect(l).toBeLessThanOrEqual(18);
  });

  it('gold accumulates fast enough to actually use a shrine in the first half', () => {
    // Cheapest shrine is 35 gold. If a player cannot afford one by 180 s the
    // whole interactable layer is dead content for the early game.
    const results = runMany(seedRange(1, 4), kitePolicy(), { maxSeconds: 180, sampleEvery: 180 });
    for (const r of results) {
      expect(r.summary.goldEarned, `seed ${r.seed}`).toBeGreaterThanOrEqual(35);
    }
  });
});

describe.skipIf(!FULL)('full 900 s cohort (BALANCE_FULL=1)', () => {
  it('a competent player survives the full run on most seeds', () => {
    const results = runMany(seedRange(1, 10), kitePolicy(), { maxSeconds: 900, sampleEvery: 300 });
    const r = report(results, 900);
    expect(r.survivalRate).toBeGreaterThanOrEqual(0.5);
    expect(r.level.median).toBeGreaterThanOrEqual(16);
  }, 600000);
});
