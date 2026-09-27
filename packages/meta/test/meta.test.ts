import { describe, it, expect } from 'vitest';
import {
  EMPTY_PROFILE, QUESTS, UNLOCKS, applyRun, parseProfile, purchase,
  serialiseProfile, unlocksFor, type Profile,
} from '../src/index.js';
import { silverFor, type RunSummary } from '@megabonk/sim';

const summary = (over: Partial<RunSummary> = {}): RunSummary => ({
  seed: 1, outcome: 'died', seconds: 100, kills: 40, bossKills: 0, level: 5,
  goldEarned: 120, silverEarned: silverFor(40, 5, false), damageTaken: 30,
  picks: [], agentProfile: null, ...over,
});

describe('FR-15 silver and save file', () => {
  it('AC-15.1 silver is a pure function of the summary counters', () => {
    expect(silverFor(40, 5, false)).toBe(4 + 10);
    expect(silverFor(40, 5, true)).toBe(4 + 10 + 50);
  });

  it('AC-15.2 a profile round-trips deeply equal', () => {
    const p = applyRun(EMPTY_PROFILE, summary());
    expect(parseProfile(serialiseProfile(p)).profile).toEqual(p);
  });

  it('AC-15.3 corrupt input yields a fresh profile plus a warning, never a throw', () => {
    for (const bad of ['not json{', '[]', 'null', '42', '"str"']) {
      const out = parseProfile(bad);
      expect(out.profile.silver).toBe(0);
      expect(out.warning).toBeDefined();
    }
    expect(parseProfile(null).profile).toEqual(EMPTY_PROFILE);
    expect(parseProfile(undefined).warning).toBeUndefined();
  });

  it('AC-15.4 a foreign schema version is rejected explicitly, not misread', () => {
    const out = parseProfile(JSON.stringify({ ...EMPTY_PROFILE, schemaVersion: 99, silver: 9999 }));
    expect(out.profile.silver).toBe(0);
    expect(out.warning).toMatch(/schema version/);
  });

  it('sanitises hostile field types rather than trusting the file', () => {
    const out = parseProfile(JSON.stringify({
      schemaVersion: 1, silver: -500, purchased: ['reroll', 7, null], quests: 'nope',
      runsPlayed: NaN, bestSeconds: 'x', bestKills: Infinity,
    }));
    expect(out.profile.silver).toBe(0);
    expect(out.profile.purchased).toEqual(['reroll']);
    expect(out.profile.quests).toEqual([]);
    expect(out.profile.runsPlayed).toBe(0);
    expect(out.profile.bestKills).toBe(0);
  });
});

describe('FR-16 unlocks', () => {
  it('AC-16.1 purchase deducts silver and is non-mutating', () => {
    const rich: Profile = { ...EMPTY_PROFILE, silver: 1000 };
    const out = purchase(rich, 'reroll');
    expect(out.ok).toBe(true);
    expect(out.profile.silver).toBe(1000 - 150);
    expect(out.profile.purchased).toEqual(['reroll']);
    expect(rich.silver).toBe(1000);
  });

  it('refuses when short of silver and changes nothing', () => {
    const poor: Profile = { ...EMPTY_PROFILE, silver: 10 };
    const out = purchase(poor, 'slot');
    expect(out.ok).toBe(false);
    expect(out.profile).toEqual(poor);
  });

  it('refuses a duplicate purchase and an unknown id', () => {
    const owned: Profile = { ...EMPTY_PROFILE, silver: 1000, purchased: ['reroll'] };
    expect(purchase(owned, 'reroll').ok).toBe(false);
    expect(purchase(owned, 'nonsense').ok).toBe(false);
  });

  it('AC-16.2 resolves purchased ids into the MetaUnlocks the sim consumes', () => {
    const all: Profile = { ...EMPTY_PROFILE, purchased: UNLOCKS.map((u) => u.id) };
    expect(unlocksFor(all)).toEqual({ extraRerolls: 1, extraWeaponSlots: 1, bonusLuck: 5 });
  });

  it('ignores an unknown purchased id from a newer build instead of crashing', () => {
    const future: Profile = { ...EMPTY_PROFILE, purchased: ['reroll', 'from-the-future'] };
    expect(unlocksFor(future)).toEqual({ extraRerolls: 1, extraWeaponSlots: 0, bonusLuck: 0 });
  });
});

describe('FR-17 quests', () => {
  it('AC-17.1 evaluation is a pure function of (profile, summary)', () => {
    const a = applyRun(EMPTY_PROFILE, summary());
    const b = applyRun(EMPTY_PROFILE, summary());
    expect(a).toEqual(b);
  });

  it('AC-17.2 progress is monotonic — a bad run never reduces it', () => {
    const good = applyRun(EMPTY_PROFILE, summary({ kills: 500, level: 25, seconds: 700, bossKills: 3 }));
    const after = applyRun(good, summary({ kills: 1, level: 1, seconds: 5, bossKills: 0 }));
    for (const q of after.quests) {
      const before = good.quests.find((x) => x.id === q.id)!;
      expect(q.progress).toBeGreaterThanOrEqual(before.progress);
      if (before.completed) expect(q.completed).toBe(true);
    }
  });

  it("'sum' quests accumulate across runs; 'best' quests take the maximum", () => {
    let p = applyRun(EMPTY_PROFILE, summary({ kills: 60 }));
    p = applyRun(p, summary({ kills: 60 }));
    expect(p.quests.find((q) => q.id === 'exterminator')!.progress).toBe(120);
    expect(p.quests.find((q) => q.id === 'centurion')!.progress).toBe(60);
  });

  it('progress never exceeds the target', () => {
    let p = EMPTY_PROFILE;
    for (let i = 0; i < 40; i++) p = applyRun(p, summary({ kills: 900 }));
    for (const q of p.quests) {
      const def = QUESTS.find((d) => d.id === q.id)!;
      expect(q.progress).toBeLessThanOrEqual(def.target);
    }
  });

  it('awards Untouchable only for a clean 2-minute run', () => {
    const clean = applyRun(EMPTY_PROFILE, summary({ seconds: 130, damageTaken: 0 }));
    expect(clean.quests.find((q) => q.id === 'untouched')!.completed).toBe(true);
    const hurt = applyRun(EMPTY_PROFILE, summary({ seconds: 130, damageTaken: 1 }));
    expect(hurt.quests.find((q) => q.id === 'untouched')!.completed).toBe(false);
  });

  it('ships 12 quests with unique ids and positive targets', () => {
    expect(QUESTS).toHaveLength(12);
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(12);
    for (const q of QUESTS) expect(q.target).toBeGreaterThan(0);
  });

  it('accumulates silver across runs and tracks bests', () => {
    let p = applyRun(EMPTY_PROFILE, summary({ kills: 40, level: 5, seconds: 100 }));
    const firstSilver = p.silver;
    p = applyRun(p, summary({ kills: 10, level: 2, seconds: 50 }));
    expect(p.silver).toBeGreaterThan(firstSilver);
    expect(p.runsPlayed).toBe(2);
    expect(p.bestSeconds).toBe(100);
    expect(p.bestKills).toBe(40);
  });
});
