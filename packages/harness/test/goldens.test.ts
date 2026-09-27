/**
 * PRD §9 layer 3 — the golden-run corpus.
 *
 * ~20 committed seeds with an expected terminal state hash and headline summary
 * numbers. The corpus asserts HARD when its two fingerprints match what is
 * checked out, and SKIPS with a regeneration hint when either has moved. §11 names
 * the failure mode this avoids: "golden-run tests become noisy and get ignored".
 * Content balance and sim behaviour are both moving targets in this repo, so a
 * corpus that failed on every balance commit would be abandoned within a day.
 *
 * What is NOT skippable, and is asserted unconditionally below: that the corpus
 * exists, is well-formed, covers ~20 distinct seeds, and that whatever the current
 * numbers are, they are REPRODUCIBLE. A stale corpus therefore still proves
 * determinism; it merely stops asserting yesterday's balance.
 */
import { describe, it, expect } from 'vitest';
import {
  GOLDEN_SEEDS,
  GOLDEN_TICKS,
  SIM_BEHAVIOUR_VERSION,
  checkStaleness,
  corpusExists,
  currentContentFingerprint,
  generateCorpus,
  loadCorpus,
  runGolden,
} from '../src/goldens.js';

describe('golden-run corpus: structure', () => {
  it('a corpus is committed and well-formed', () => {
    expect(corpusExists()).toBe(true);
    const corpus = loadCorpus();
    expect(corpus.formatVersion).toBe(1);
    expect(corpus.entries.length).toBeGreaterThanOrEqual(20);
    expect(corpus.ticks).toBeGreaterThan(0);
    expect(corpus.contentFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(typeof corpus.simBehaviourVersion).toBe('number');
  });

  it('covers exactly the declared seed list, with no duplicates', () => {
    const corpus = loadCorpus();
    expect(corpus.entries.map((e) => e.seed)).toEqual([...GOLDEN_SEEDS]);
    expect(new Set(corpus.entries.map((e) => e.seed)).size).toBe(GOLDEN_SEEDS.length);
  });

  it('every entry has a distinct terminal hash — a corpus of one repeated hash proves nothing', () => {
    const corpus = loadCorpus();
    const hashes = new Set(corpus.entries.map((e) => e.hash));
    expect(hashes.size).toBe(corpus.entries.length);
  });
});

describe('golden-run corpus: staleness gate', () => {
  it('reports its own currency, naming both fingerprints', () => {
    const check = checkStaleness(loadCorpus());
    // Printed either way: a developer reading a skip needs to know which moved.
    console.log(`  goldens: ${check.current ? 'CURRENT' : 'STALE'} — ${check.reason}`);
    expect(typeof check.current).toBe('boolean');
    expect(check.reason.length).toBeGreaterThan(0);
  });

  it('detects a content retune as staleness rather than as a test failure', () => {
    const corpus = loadCorpus();
    const retuned = { ...corpus, contentFingerprint: 'deadbeefdeadbeef' };
    const check = checkStaleness(retuned);
    expect(check.current).toBe(false);
    expect(check.reason).toMatch(/content fingerprint changed/);
    expect(check.reason).toMatch(/goldens\.ts --write/);
  });

  it('detects a declared sim-behaviour change the same way', () => {
    const corpus = loadCorpus();
    const check = checkStaleness({ ...corpus, simBehaviourVersion: SIM_BEHAVIOUR_VERSION + 99 });
    expect(check.current).toBe(false);
    expect(check.reason).toMatch(/sim behaviour version changed/);
  });

  it('a freshly generated corpus is by definition current', () => {
    const fresh = generateCorpus(GOLDEN_SEEDS.slice(0, 2), 'baseline', 600);
    expect(checkStaleness(fresh).current).toBe(true);
    expect(fresh.contentFingerprint).toBe(currentContentFingerprint());
    expect(fresh.simBehaviourVersion).toBe(SIM_BEHAVIOUR_VERSION);
  });
});

const corpus = loadCorpus();
const staleness = checkStaleness(corpus);

describe.skipIf(!staleness.current)('golden-run corpus: hard assertions (fingerprints match)', () => {
  for (const expected of corpus.entries) {
    it(`seed ${expected.seed} reproduces its committed terminal hash and summary`, () => {
      const actual = runGolden(expected.seed, corpus.policy, corpus.ticks);
      expect(actual.hash).toBe(expected.hash);
      expect(actual).toEqual(expected);
    });
  }
}, 240_000);

describe.skipIf(staleness.current)('golden-run corpus: STALE — regenerate', () => {
  it('still proves determinism even though the committed numbers are stale', () => {
    console.log(`  goldens are stale: ${staleness.reason}`);
    const seed = GOLDEN_SEEDS[0]!;
    const a = runGolden(seed, corpus.policy, Math.min(corpus.ticks, 3000));
    const b = runGolden(seed, corpus.policy, Math.min(corpus.ticks, 3000));
    expect(b).toEqual(a);
  }, 60_000);
});

describe('golden runs are reproducible regardless of corpus currency', () => {
  it('the same seed and policy give byte-identical golden entries', () => {
    const seed = GOLDEN_SEEDS[3]!;
    expect(runGolden(seed, 'baseline', 2400)).toEqual(runGolden(seed, 'baseline', 2400));
  });

  it(`the declared golden length (${GOLDEN_TICKS} ticks) reaches past the first boss at t=300 s`, () => {
    expect(GOLDEN_TICKS).toBeGreaterThan(300 * 60);
    // Seeds that survive that long must actually witness the boss, or the corpus
    // is not exercising the boss path at all.
    const corpus = loadCorpus();
    const longRuns = corpus.entries.filter((e) => e.seconds >= 305);
    if (longRuns.length > 0) expect(longRuns.some((e) => e.ticks > 300 * 60)).toBe(true);
  });
});
