/**
 * FR-15..FR-17 meta-progression: silver, unlocks, quests, profile persistence.
 *
 * Pure functions plus a storage port. The port exists because the same rules run
 * in two places — a JSON file under ./save for the harness and MCP server,
 * localStorage for the browser — and duplicating the rules per platform is how
 * they drift apart.
 */

import type { MetaUnlocks, RunSummary } from '@megabonk/sim';

export const PROFILE_SCHEMA_VERSION = 1;

export interface QuestProgress {
  readonly id: string;
  readonly progress: number;
  readonly completed: boolean;
}

export interface Profile {
  readonly schemaVersion: number;
  readonly silver: number;
  readonly purchased: readonly string[];
  readonly quests: readonly QuestProgress[];
  readonly runsPlayed: number;
  readonly bestSeconds: number;
  readonly bestKills: number;
}

export const EMPTY_PROFILE: Profile = Object.freeze({
  schemaVersion: PROFILE_SCHEMA_VERSION,
  silver: 0,
  purchased: [],
  quests: [],
  runsPlayed: 0,
  bestSeconds: 0,
  bestKills: 0,
});

export interface UnlockDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly cost: number;
  /** Applied to a run when purchased. Additive across purchases. */
  readonly effect: Partial<MetaUnlocks>;
}

/** FR-16: three unlocks in v1, all aimed at the RNG-frustration risk. */
export const UNLOCKS: readonly UnlockDef[] = Object.freeze([
  {
    id: 'reroll', name: 'Second Thoughts', cost: 150,
    description: '+1 upgrade reroll per run.',
    effect: { extraRerolls: 1 },
  },
  {
    id: 'slot', name: 'Bigger Backpack', cost: 400,
    description: '+1 weapon slot.',
    effect: { extraWeaponSlots: 1 },
  },
  {
    id: 'luck', name: 'Born Lucky', cost: 250,
    description: '+5 starting Luck. Better upgrade rarities.',
    effect: { bonusLuck: 5 },
  },
]);

/** Resolve purchased unlock ids into the MetaUnlocks the sim consumes (AC-16.2). */
export function unlocksFor(profile: Profile): MetaUnlocks {
  let extraRerolls = 0;
  let extraWeaponSlots = 0;
  let bonusLuck = 0;
  for (const id of profile.purchased) {
    const def = UNLOCKS.find((u) => u.id === id);
    if (!def) continue; // unknown id from a newer build: ignore, never crash
    extraRerolls += def.effect.extraRerolls ?? 0;
    extraWeaponSlots += def.effect.extraWeaponSlots ?? 0;
    bonusLuck += def.effect.bonusLuck ?? 0;
  }
  return { extraRerolls, extraWeaponSlots, bonusLuck };
}

export interface PurchaseResult {
  readonly profile: Profile;
  readonly ok: boolean;
  readonly reason?: string;
}

/** AC-16.1: deducts silver, refuses when short or already owned, never mutates. */
export function purchase(profile: Profile, unlockId: string): PurchaseResult {
  const def = UNLOCKS.find((u) => u.id === unlockId);
  if (!def) return { profile, ok: false, reason: `unknown unlock "${unlockId}"` };
  if (profile.purchased.includes(unlockId)) {
    return { profile, ok: false, reason: 'already purchased' };
  }
  if (profile.silver < def.cost) {
    return { profile, ok: false, reason: `needs ${def.cost} silver, have ${profile.silver}` };
  }
  return {
    ok: true,
    profile: {
      ...profile,
      silver: profile.silver - def.cost,
      purchased: [...profile.purchased, unlockId].sort(),
    },
  };
}

export interface QuestDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly target: number;
  /** Progress this run contributed. Pure function of the summary (AC-17.1). */
  readonly measure: (s: RunSummary) => number;
  /** 'best' keeps the highest single-run value; 'sum' accumulates across runs. */
  readonly mode: 'best' | 'sum';
}

/** FR-17: 12 quests. Authored to nudge experimentation rather than grinding. */
export const QUESTS: readonly QuestDef[] = Object.freeze([
  { id: 'first-blood', name: 'First Blood', description: 'Kill 10 enemies.', target: 10, mode: 'best', measure: (s) => s.kills },
  { id: 'centurion', name: 'Centurion', description: 'Kill 100 enemies in one run.', target: 100, mode: 'best', measure: (s) => s.kills },
  { id: 'exterminator', name: 'Exterminator', description: 'Kill 1000 enemies in total.', target: 1000, mode: 'sum', measure: (s) => s.kills },
  { id: 'survive-5', name: 'Five Minutes', description: 'Survive 5 minutes.', target: 300, mode: 'best', measure: (s) => s.seconds },
  { id: 'survive-10', name: 'Ten Minutes', description: 'Survive 10 minutes.', target: 600, mode: 'best', measure: (s) => s.seconds },
  { id: 'the-end', name: 'The Long Haul', description: 'Survive a full run.', target: 1, mode: 'best', measure: (s) => (s.outcome === 'survived' ? 1 : 0) },
  { id: 'boss-slayer', name: 'Boss Slayer', description: 'Kill a boss.', target: 1, mode: 'best', measure: (s) => s.bossKills },
  { id: 'boss-hunter', name: 'Boss Hunter', description: 'Kill 10 bosses in total.', target: 10, mode: 'sum', measure: (s) => s.bossKills },
  { id: 'level-10', name: 'Double Digits', description: 'Reach level 10.', target: 10, mode: 'best', measure: (s) => s.level },
  { id: 'level-20', name: 'Overachiever', description: 'Reach level 20.', target: 20, mode: 'best', measure: (s) => s.level },
  { id: 'rich', name: 'Loaded', description: 'Earn 1000 gold in one run.', target: 1000, mode: 'best', measure: (s) => s.goldEarned },
  { id: 'untouched', name: 'Untouchable', description: 'Survive 2 minutes without taking damage.', target: 1, mode: 'best', measure: (s) => (s.seconds >= 120 && s.damageTaken === 0 ? 1 : 0) },
]);

/**
 * AC-17.1/17.2: pure, and progress is monotonic — a bad run can never reduce it.
 * That monotonicity is why 'best' and 'sum' are distinguished rather than just
 * overwriting: a 'best' quest takes the max, never the latest.
 */
export function applyRun(profile: Profile, summary: RunSummary): Profile {
  const byId = new Map(profile.quests.map((q) => [q.id, q]));
  const quests: QuestProgress[] = [];

  for (const def of QUESTS) {
    const prior = byId.get(def.id);
    const contribution = Math.max(0, def.measure(summary));
    const raw = def.mode === 'sum'
      ? (prior?.progress ?? 0) + contribution
      : Math.max(prior?.progress ?? 0, contribution);
    const progress = Math.min(def.target, Math.max(prior?.progress ?? 0, raw));
    quests.push({ id: def.id, progress, completed: progress >= def.target });
  }

  return {
    ...profile,
    silver: profile.silver + summary.silverEarned,
    runsPlayed: profile.runsPlayed + 1,
    bestSeconds: Math.max(profile.bestSeconds, summary.seconds),
    bestKills: Math.max(profile.bestKills, summary.kills),
    quests,
  };
}

/**
 * AC-15.3/15.4: never crash on bad input, and never silently misread a profile
 * written by a different schema version.
 */
export function parseProfile(raw: string | null | undefined): { profile: Profile; warning?: string } {
  if (!raw) return { profile: EMPTY_PROFILE };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { profile: EMPTY_PROFILE, warning: 'save file is not valid JSON; starting fresh' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { profile: EMPTY_PROFILE, warning: 'save file is not an object; starting fresh' };
  }
  const p = parsed as Partial<Profile>;
  if (p.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    return {
      profile: EMPTY_PROFILE,
      warning: `save schema version ${String(p.schemaVersion)} is not ${PROFILE_SCHEMA_VERSION}; starting fresh`,
    };
  }
  return {
    profile: {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      silver: Number.isFinite(p.silver) ? Math.max(0, Math.floor(p.silver as number)) : 0,
      purchased: Array.isArray(p.purchased) ? p.purchased.filter((x): x is string => typeof x === 'string') : [],
      quests: Array.isArray(p.quests)
        ? p.quests.filter(
            (q): q is QuestProgress =>
              typeof q === 'object' && q !== null && typeof (q as QuestProgress).id === 'string',
          )
        : [],
      runsPlayed: Number.isFinite(p.runsPlayed) ? Math.max(0, p.runsPlayed as number) : 0,
      bestSeconds: Number.isFinite(p.bestSeconds) ? Math.max(0, p.bestSeconds as number) : 0,
      bestKills: Number.isFinite(p.bestKills) ? Math.max(0, p.bestKills as number) : 0,
    },
  };
}

export function serialiseProfile(profile: Profile): string {
  return JSON.stringify(profile, null, 2);
}
