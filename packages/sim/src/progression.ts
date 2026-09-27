/** FR-2 levelling and FR-4 rarity/Luck. Pure functions — the easiest layer to test, so it is tested hardest. */

import { nextFloat, type RngState } from './rng.js';

/** AC-2.1: xpForLevel(n) = ceil(10 * n^1.5). 10 / 80 / 317 at levels 1 / 4 / 10. */
export function xpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new Error(`xpForLevel: level must be an integer >= 1, got ${level}`);
  }
  return Math.ceil(10 * Math.pow(level, 1.5));
}

export interface Progress {
  readonly level: number;
  readonly xp: number;
}

export interface XpGrant extends Progress {
  /** How many level-up offers to queue. May exceed 1 from a single grant (AC-2.2). */
  readonly levelsGained: number;
}

/**
 * Apply an XP grant. Crossing several thresholds at once queues one offer per
 * level and carries the remainder — no XP is ever lost to rounding (AC-2.2/2.3).
 */
export function grantXp(progress: Progress, amount: number): XpGrant {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`grantXp: amount must be a non-negative finite number, got ${amount}`);
  }
  let { level, xp } = progress;
  xp += amount;
  let levelsGained = 0;
  // Guard against a pathological grant spinning forever on a huge amount.
  while (xp >= xpForLevel(level) && levelsGained < 10000) {
    xp -= xpForLevel(level);
    level += 1;
    levelsGained += 1;
  }
  return { level, xp, levelsGained };
}

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

/** AC-4.5: how much a rarity scales an upgrade's magnitude. */
export const RARITY_MULTIPLIER: Readonly<Record<Rarity, number>> = Object.freeze({
  common: 1.0,
  uncommon: 1.3,
  rare: 1.7,
  epic: 2.2,
  legendary: 3.0,
});

/**
 * FR-4 rarity weights as a pure function of Luck, normalised to sum 1.
 *
 * Raw weights (before normalisation):
 *   common    60 - 3.0*luck   (floored at 0 — AC-4.3)
 *   uncommon  25 + 0.5*luck
 *   rare      10 + 1.5*luck
 *   epic       4 + 0.8*luck
 *   legendary  1 + 0.2*luck
 */
export function rarityWeights(luck: number): Record<Rarity, number> {
  const l = Math.max(0, Number.isFinite(luck) ? luck : 0);
  const raw: Record<Rarity, number> = {
    common: Math.max(0, 60 - 3.0 * l),
    uncommon: 25 + 0.5 * l,
    rare: 10 + 1.5 * l,
    epic: 4 + 0.8 * l,
    legendary: 1 + 0.2 * l,
  };
  const total = RARITIES.reduce((acc, r) => acc + raw[r], 0);
  const out = {} as Record<Rarity, number>;
  for (const r of RARITIES) out[r] = raw[r] / total;
  return out;
}

/**
 * Draw a rarity. Walks the cumulative distribution in the fixed RARITIES order
 * so the mapping from RNG value to rarity is stable across versions.
 */
export function rollRarity(
  state: RngState,
  luck: number,
): { value: Rarity; state: RngState } {
  const weights = rarityWeights(luck);
  const { value, state: next } = nextFloat(state);
  let acc = 0;
  for (const r of RARITIES) {
    acc += weights[r];
    if (value < acc) return { value: r, state: next };
  }
  return { value: 'legendary', state: next };
}
