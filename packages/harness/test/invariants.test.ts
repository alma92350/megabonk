/**
 * PRD §9 layer 2 — property-based invariants (fast-check).
 *
 * These are the properties that must hold for ALL inputs, not for the handful a
 * scripted run happens to produce. Each `it` is named after the PRD line it
 * enforces. Arbitrary seeds and arbitrary input sequences, deliberately including
 * inputs a UI would never send (unnormalised vectors, out-of-range indices).
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { MAX_ENTITIES, TICK_MS, TICKS_PER_SECOND, createRun, step } from '@megabonk/sim';
import type { GameState, InputFrame, RunConfig } from '@megabonk/sim';
import { makeRunConfig } from '@megabonk/content';
import { hashState } from '../src/hash.js';
import { drive } from '../src/drive.js';
import { baselinePolicy, dodgePolicy, randomPolicy, stationaryPolicy } from '../src/policy.js';

const RUNS = Number(process.env.MEGABONK_FULL ? 120 : 30);

/** A movement vector a real UI would never send: unnormalised, sometimes zero. */
const moveArb = fc.record({
  x: fc.double({ min: -3, max: 3, noNaN: true }),
  y: fc.double({ min: -3, max: 3, noNaN: true }),
});

const inputArb: fc.Arbitrary<InputFrame> = fc.record(
  {
    move: moveArb,
    chooseIndex: fc.option(fc.integer({ min: 0, max: 2 }), { nil: undefined }),
    reroll: fc.option(fc.boolean(), { nil: undefined }),
    buyIndex: fc.option(fc.integer({ min: 0, max: 2 }), { nil: undefined }),
  },
  { requiredKeys: ['move'] },
);

const seedArb = fc.integer({ min: 0, max: 2 ** 31 - 1 });

/** Apply a frame safely: an offer needs a valid index or the sim throws by design. */
function safeFrame(state: GameState, frame: InputFrame): InputFrame {
  if (state.phase !== 'offer') return frame;
  const n = state.offer?.options.length ?? 3;
  return { move: frame.move, chooseIndex: Math.min(Math.max(0, frame.chooseIndex ?? 0), n - 1) };
}

function walk(cfg: RunConfig, frames: readonly InputFrame[], check: (s: GameState) => void): GameState {
  let state = createRun(cfg);
  for (const frame of frames) {
    if (state.phase === 'ended') break;
    state = step(state, safeFrame(state, frame), TICK_MS, cfg);
    check(state);
  }
  return state;
}

describe('PRD §9 layer 2: invariants over arbitrary seeds and input sequences', () => {
  it('hp never exceeds maxHp and never goes below 0 after the run ends', () => {
    fc.assert(
      fc.property(seedArb, fc.array(inputArb, { minLength: 40, maxLength: 120 }), (seed, frames) => {
        walk(makeRunConfig(seed), frames, (s) => {
          expect(s.player.hp).toBeLessThanOrEqual(s.player.stats.maxHp + 1e-9);
          expect(s.player.hp).toBeGreaterThanOrEqual(0);
        });
      }),
      { numRuns: RUNS },
    );
  });

  it('gold is never negative (AC-13.1)', () => {
    fc.assert(
      fc.property(seedArb, fc.array(inputArb, { minLength: 40, maxLength: 120 }), (seed, frames) => {
        walk(makeRunConfig(seed), frames, (s) => {
          expect(s.player.gold).toBeGreaterThanOrEqual(0);
        });
      }),
      { numRuns: RUNS },
    );
  });

  it(`live entity count never exceeds MAX_ENTITIES = ${MAX_ENTITIES} (AC-5.3)`, () => {
    fc.assert(
      fc.property(seedArb, fc.array(inputArb, { minLength: 30, maxLength: 80 }), (seed, frames) => {
        walk(makeRunConfig(seed), frames, (s) => {
          expect(s.enemies.length).toBeLessThanOrEqual(MAX_ENTITIES);
        });
      }),
      { numRuns: RUNS },
    );
  });

  it('the player never leaves map bounds (AC-7.3)', () => {
    fc.assert(
      fc.property(seedArb, fc.array(inputArb, { minLength: 60, maxLength: 160 }), (seed, frames) => {
        walk(makeRunConfig(seed), frames, (s) => {
          expect(Math.abs(s.player.pos.x)).toBeLessThanOrEqual(s.map.halfExtent + 1e-9);
          expect(Math.abs(s.player.pos.y)).toBeLessThanOrEqual(s.map.halfExtent + 1e-9);
          expect(Number.isFinite(s.player.pos.x)).toBe(true);
          expect(Number.isFinite(s.player.pos.y)).toBe(true);
        });
      }),
      { numRuns: RUNS },
    );
  });

  it('tick advances by exactly 0 or 1 per step — 0 only while an offer is open (AC-19.2)', () => {
    fc.assert(
      fc.property(seedArb, fc.array(inputArb, { minLength: 60, maxLength: 160 }), (seed, frames) => {
        const cfg = makeRunConfig(seed);
        let state = createRun(cfg);
        for (const frame of frames) {
          const before = state.tick;
          const wasOffer = state.phase === 'offer';
          const wasEnded = state.phase === 'ended';
          state = step(state, safeFrame(state, frame), TICK_MS, cfg);
          const delta = state.tick - before;
          expect(delta === 0 || delta === 1).toBe(true);
          if (delta === 0) expect(wasOffer || wasEnded).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('serialise → deserialise → step ≡ step (state is fully captured, ARCH-1)', () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.array(inputArb, { minLength: 20, maxLength: 90 }),
        inputArb,
        (seed, frames, probe) => {
          const cfg = makeRunConfig(seed);
          const state = walk(cfg, frames, () => undefined);
          if (state.phase === 'ended') return;
          const revived: GameState = JSON.parse(JSON.stringify(state));
          expect(hashState(revived)).toBe(hashState(state));
          const direct = step(state, safeFrame(state, probe), TICK_MS, cfg);
          const roundTripped = step(revived, safeFrame(revived, probe), TICK_MS, cfg);
          expect(hashState(roundTripped)).toBe(hashState(direct));
          expect(roundTripped).toEqual(direct);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('step is pure: the input state is never mutated', () => {
    fc.assert(
      fc.property(seedArb, fc.array(inputArb, { minLength: 20, maxLength: 60 }), inputArb, (seed, frames, probe) => {
        const cfg = makeRunConfig(seed);
        const state = walk(cfg, frames, () => undefined);
        if (state.phase === 'ended') return;
        const before = hashState(state);
        step(state, safeFrame(state, probe), TICK_MS, cfg);
        expect(hashState(state)).toBe(before);
      }),
      { numRuns: RUNS },
    );
  });

  it('every accumulated event carries a tick and a type (AC-8.1)', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const r = drive(makeRunConfig(seed), { ticks: 600, policy: baselinePolicy });
        for (const e of r.events) {
          expect(Number.isInteger(e.tick)).toBe(true);
          expect(e.tick).toBeGreaterThanOrEqual(0);
          expect(typeof e.type).toBe('string');
          expect(e.type.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: Math.min(RUNS, 12) },
    );
  });

  it('counters are monotonically non-decreasing across a run (AC-17.2 in spirit)', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const cfg = makeRunConfig(seed);
        let state = createRun(cfg);
        let kills = 0;
        let goldEarned = 0;
        let damageDealt = 0;
        for (let i = 0; i < 900 && state.phase !== 'ended'; i++) {
          state = step(state, safeFrame(state, baselinePolicy(state, { iteration: i, tick: state.tick })), TICK_MS, cfg);
          expect(state.kills).toBeGreaterThanOrEqual(kills);
          expect(state.goldEarned).toBeGreaterThanOrEqual(goldEarned);
          expect(state.damageDealt).toBeGreaterThanOrEqual(damageDealt - 1e-9);
          kills = state.kills;
          goldEarned = state.goldEarned;
          damageDealt = state.damageDealt;
        }
      }),
      { numRuns: Math.min(RUNS, 10) },
    );
  });

  it('every policy drives an arbitrary seed without throwing', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        for (const policy of [baselinePolicy, dodgePolicy, stationaryPolicy, randomPolicy(seed)]) {
          expect(() =>
            drive(makeRunConfig(seed), { ticks: TICKS_PER_SECOND * 20, policy, collectEvents: false }),
          ).not.toThrow();
        }
      }),
      { numRuns: Math.min(RUNS, 10) },
    );
  });
});
