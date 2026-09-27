/**
 * PRD §2.3: "Determinism: same seed → identical final state hash, 100% over 1000
 * randomised seeds." NFR-1 restates it as the property everything else rests on.
 *
 * The default suite runs a few dozen seeds with short runs, which is what catches
 * a determinism leak in practice within a save-test cycle. The full 1000-seed
 * sweep at full run length is gated:
 *
 *     MEGABONK_FULL=1 npx vitest run packages/harness/test/determinism.test.ts
 */
import { describe, it, expect } from 'vitest';
import { createRun, step, TICK_MS } from '@megabonk/sim';
import { makeRunConfig } from '@megabonk/content';
import { drive, FULL_RUN_TICKS } from '../src/drive.js';
import { baselinePolicy, randomPolicy, stationaryPolicy } from '../src/policy.js';
import { hashState } from '../src/hash.js';
import { survivableConfig } from '../src/scenarios.js';

const FULL = process.env.MEGABONK_FULL === '1' || process.env.MEGABONK_FULL === 'true';

/**
 * Seeds spread over the whole 32-bit space rather than 1..N: adjacent seeds are
 * the easy case for a seeded PRNG, and a sweep of 1..40 would not notice a stream
 * derivation that only collides for large or negative seeds.
 */
function scatteredSeeds(count: number): number[] {
  const seeds: number[] = [];
  let x = 0x1234567;
  for (let i = 0; i < count; i++) {
    x = Math.imul(x ^ (x >>> 15), 0x2545f491) >>> 0;
    x = (x ^ (x >>> 13)) >>> 0;
    seeds.push(x >>> 1);
  }
  return seeds;
}

describe('PRD §2.3 determinism: same seed → identical terminal state hash', () => {
  const seeds = scatteredSeeds(FULL ? 1000 : 32);
  const ticks = FULL ? FULL_RUN_TICKS : 1800;

  it(`holds for ${seeds.length} randomised seeds under the baseline policy`, () => {
    const mismatches: Array<{ seed: number; a: string; b: string }> = [];
    for (const seed of seeds) {
      const cfg = makeRunConfig(seed);
      const a = drive(cfg, { ticks, policy: baselinePolicy, collectEvents: false });
      const b = drive(cfg, { ticks, policy: baselinePolicy, collectEvents: false });
      const ha = hashState(a.state);
      const hb = hashState(b.state);
      if (ha !== hb) mismatches.push({ seed, a: ha, b: hb });
    }
    expect(mismatches).toEqual([]);
  }, FULL ? 1_800_000 : 120_000);

  it('holds under a wandering policy, which touches more of the input space', () => {
    for (const seed of scatteredSeeds(FULL ? 200 : 12)) {
      const cfg = makeRunConfig(seed);
      const a = drive(cfg, { ticks: 1200, policy: randomPolicy(seed), collectEvents: false });
      const b = drive(cfg, { ticks: 1200, policy: randomPolicy(seed), collectEvents: false });
      expect(hashState(b.state)).toBe(hashState(a.state));
    }
  }, 300_000);

  it('distinct seeds produce distinct terminal hashes (the hash is not a constant)', () => {
    const hashes = new Set<string>();
    for (const seed of scatteredSeeds(24)) {
      const r = drive(makeRunConfig(seed), { ticks: 900, policy: baselinePolicy, collectEvents: false });
      hashes.add(hashState(r.state));
    }
    expect(hashes.size).toBe(24);
  });

  it('the whole event log is reproduced, not merely the terminal state', () => {
    for (const seed of scatteredSeeds(8)) {
      const cfg = makeRunConfig(seed);
      const a = drive(cfg, { ticks: 2400, policy: baselinePolicy });
      const b = drive(cfg, { ticks: 2400, policy: baselinePolicy });
      expect(b.events).toEqual(a.events);
      expect(b.summary).toEqual(a.summary);
    }
  }, 60_000);

  it('a run interrupted and resumed from a serialised snapshot lands on the same hash', () => {
    // Replay via snapshot must agree with a straight-through run, or the MCP
    // boundary and the replay artifact are both unsound (ARCH-1 serialisability).
    const cfg = makeRunConfig(4242);
    const straight = drive(cfg, { ticks: 1500, policy: stationaryPolicy, collectEvents: false });

    let state = createRun(cfg);
    for (let i = 0; state.tick < 1500 && state.phase !== 'ended'; i++) {
      const frame = stationaryPolicy(state, { iteration: i, tick: state.tick });
      state = step(state, state.phase === 'offer' ? { ...frame, chooseIndex: 0 } : frame, TICK_MS, cfg);
      if (state.tick === 700) state = JSON.parse(JSON.stringify(state));
    }
    expect(hashState(state)).toBe(hashState(straight.state));
  });

  it('a full 15-minute run is deterministic end to end (AC-26.2)', () => {
    const cfg = survivableConfig(makeRunConfig(31337));
    const a = drive(cfg, { ticks: FULL_RUN_TICKS, policy: stationaryPolicy, collectEvents: false });
    const b = drive(cfg, { ticks: FULL_RUN_TICKS, policy: stationaryPolicy, collectEvents: false });
    expect(a.state.tick).toBe(FULL_RUN_TICKS);
    expect(hashState(b.state)).toBe(hashState(a.state));
  }, 180_000);
});
