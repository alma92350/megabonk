import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { xpForLevel, grantXp, RARITIES, rarityWeights, rollRarity, RARITY_MULTIPLIER } from '../src/progression.js';
import { createRng } from '../src/rng.js';

describe('FR-2 XP and levelling', () => {
  it('AC-2.1 xpForLevel matches the published curve', () => {
    expect(xpForLevel(1)).toBe(10);
    expect(xpForLevel(4)).toBe(80);
    expect(xpForLevel(10)).toBe(317);
  });

  it('is strictly increasing, so levelling never gets cheaper', () => {
    for (let n = 1; n < 200; n++) expect(xpForLevel(n + 1)).toBeGreaterThan(xpForLevel(n));
  });

  it('rejects a level below 1 rather than returning a nonsense threshold', () => {
    expect(() => xpForLevel(0)).toThrow();
    expect(() => xpForLevel(-3)).toThrow();
  });

  it('AC-2.3 overflow XP carries: 15 XP at level 1 leaves 5 toward level 2', () => {
    const out = grantXp({ level: 1, xp: 0 }, 15);
    expect(out.level).toBe(2);
    expect(out.xp).toBe(5);
    expect(out.levelsGained).toBe(1);
  });

  it('AC-2.2 a single grant crossing two thresholds queues TWO level-ups and loses no XP', () => {
    // level 1 needs 10, level 2 needs 29 => 39 clears both, 1 left over.
    const need = xpForLevel(1) + xpForLevel(2);
    const out = grantXp({ level: 1, xp: 0 }, need + 1);
    expect(out.levelsGained).toBe(2);
    expect(out.level).toBe(3);
    expect(out.xp).toBe(1);
  });

  it('a grant short of the threshold banks XP without levelling', () => {
    const out = grantXp({ level: 1, xp: 0 }, 9);
    expect(out).toEqual({ level: 1, xp: 9, levelsGained: 0 });
  });

  it('conserves XP: total granted always equals consumed thresholds plus remainder', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000 }), (amount) => {
        const out = grantXp({ level: 1, xp: 0 }, amount);
        let consumed = 0;
        for (let l = 1; l < out.level; l++) consumed += xpForLevel(l);
        return consumed + out.xp === amount;
      }),
      { numRuns: 300 },
    );
  });

  it('rejects a negative grant rather than silently draining levels', () => {
    expect(() => grantXp({ level: 1, xp: 0 }, -5)).toThrow();
  });

  it('never mutates the progress it is given', () => {
    const p = { level: 1, xp: 3 };
    grantXp(p, 50);
    expect(p).toEqual({ level: 1, xp: 3 });
  });
});

describe('FR-4 rarity and Luck', () => {
  it('AC-4.1 at luck 0 the distribution is exactly 60/25/10/4/1', () => {
    const w = rarityWeights(0);
    expect(w.common).toBeCloseTo(0.6, 12);
    expect(w.uncommon).toBeCloseTo(0.25, 12);
    expect(w.rare).toBeCloseTo(0.1, 12);
    expect(w.epic).toBeCloseTo(0.04, 12);
    expect(w.legendary).toBeCloseTo(0.01, 12);
  });

  it('always normalises to 1', () => {
    for (const luck of [0, 1, 5, 10, 20, 30, 50, 100]) {
      const w = rarityWeights(luck);
      const sum = RARITIES.reduce((acc, r) => acc + w[r], 0);
      expect(sum).toBeCloseTo(1, 9);
    }
  });

  it('AC-4.2 luck raises legendary and lowers common', () => {
    expect(rarityWeights(10).legendary).toBeGreaterThan(rarityWeights(0).legendary);
    expect(rarityWeights(10).common).toBeLessThan(rarityWeights(0).common);
  });

  it('AC-4.3 no weight goes negative, and at luck 30 common is exactly 0', () => {
    for (const luck of [0, 15, 19.9, 20, 25, 30, 60, 100]) {
      const w = rarityWeights(luck);
      for (const r of RARITIES) expect(w[r]).toBeGreaterThanOrEqual(0);
    }
    expect(rarityWeights(30).common).toBe(0);
    const sum = RARITIES.reduce((a, r) => a + rarityWeights(30)[r], 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it('AC-4.4 observed legendary frequency at luck 0 is 1.0% ± 0.15pp over 100k draws', () => {
    let rng = createRng(20260927, 'upgradeOffer');
    let legendary = 0;
    const N = 100000;
    for (let i = 0; i < N; i++) {
      const r = rollRarity(rng, 0);
      if (r.value === 'legendary') legendary++;
      rng = r.state;
    }
    expect(legendary / N).toBeGreaterThan(0.0085);
    expect(legendary / N).toBeLessThan(0.0115);
  });

  it('AC-4.5 rarity multipliers are 1.0 / 1.3 / 1.7 / 2.2 / 3.0', () => {
    expect(RARITIES.map((r) => RARITY_MULTIPLIER[r])).toEqual([1.0, 1.3, 1.7, 2.2, 3.0]);
  });

  it('rollRarity is deterministic for a given state', () => {
    const rng = createRng(77, 'upgradeOffer');
    expect(rollRarity(rng, 7).value).toBe(rollRarity(rng, 7).value);
  });

  it('clamps negative luck instead of producing garbage weights', () => {
    expect(rarityWeights(-50)).toEqual(rarityWeights(0));
  });
});
