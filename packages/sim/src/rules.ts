/** FR-5 scaling curves and the tick constants. Data-driven, pure, and separately testable. */

/** 60 Hz fixed timestep. The PRD quotes 16.667 ms; this is that value unrounded. */
export const TICK_MS = 1000 / 60;
export const TICKS_PER_SECOND = 60;

/** AC-5.3: hard entity cap. Spawns beyond it are dropped, never queued. */
export const MAX_ENTITIES = 2000;

/** Handicap latencies are declared in ms for readability, converted once at run start. */
export function ticksForMs(ms: number): number {
  return Math.round(ms / TICK_MS);
}

export function ticksToSeconds(ticks: number): number {
  return ticks / TICKS_PER_SECOND;
}

/**
 * AC-5.2: enemyHp(t) = baseHp * (1 + 0.08 * minutes)^1.6, exactly 1.0 at t = 0.
 * Monotonically increasing, superlinear, so late waves need real build power.
 */
export function hpScale(seconds: number): number {
  const minutes = Math.max(0, seconds) / 60;
  return Math.pow(1 + 0.08 * minutes, 1.6);
}

/** Damage scales more gently than HP, so late game is a DPS check, not a one-shot check. */
export function damageScale(seconds: number): number {
  const minutes = Math.max(0, seconds) / 60;
  return Math.pow(1 + 0.08 * minutes, 0.9);
}

/** Enemies get slightly faster, capped so kiting never becomes impossible. */
export function speedScale(seconds: number): number {
  const minutes = Math.max(0, seconds) / 60;
  return Math.min(1.5, 1 + 0.02 * minutes);
}

/** Silver award (AC-15.1): pure function of the run summary's counters. */
export function silverFor(kills: number, level: number, survived: boolean): number {
  return Math.floor(kills / 10) + level * 2 + (survived ? 50 : 0);
}
