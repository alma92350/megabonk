/**
 * Content validation (AC-12.2).
 *
 * Content is data, so the only thing standing between a typo and a broken run is
 * this. It runs in CI and is cheap enough to also run at client startup.
 */

import type { ContentBundle } from '@megabonk/sim';

export interface ValidationIssue {
  readonly where: string;
  readonly problem: string;
}

function checkNumber(
  issues: ValidationIssue[],
  where: string,
  field: string,
  value: number,
  { min = -Infinity, max = Infinity }: { min?: number; max?: number } = {},
): void {
  if (!Number.isFinite(value)) issues.push({ where, problem: `${field} is not finite (${value})` });
  else if (value < min || value > max) {
    issues.push({ where, problem: `${field} = ${value} outside [${min}, ${max}]` });
  }
}

export function validateContent(bundle: ContentBundle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [id, w] of Object.entries(bundle.weapons)) {
    const where = `weapon:${id}`;
    if (w.id !== id) issues.push({ where, problem: `id field "${w.id}" does not match key` });
    checkNumber(issues, where, 'damage', w.damage, { min: 0.1 });
    checkNumber(issues, where, 'range', w.range, { min: 0.1 });
    checkNumber(issues, where, 'cooldownTicks', w.cooldownTicks, { min: 1 });
    checkNumber(issues, where, 'targets', w.targets, { min: 1 });
    checkNumber(issues, where, 'maxLevel', w.maxLevel, { min: 1, max: 20 });
    // A cooldown that reaches zero across levels would divide by nothing and
    // fire every tick — cheap to check, expensive to debug.
    const finalCd = w.cooldownTicks - w.cooldownReductionPerLevel * (w.maxLevel - 1);
    if (finalCd < 4) {
      issues.push({ where, problem: `cooldown falls to ${finalCd} at max level (min 4)` });
    }
  }

  for (const [id, t] of Object.entries(bundle.tomes)) {
    const where = `tome:${id}`;
    if (t.id !== id) issues.push({ where, problem: `id field "${t.id}" does not match key` });
    checkNumber(issues, where, 'maxStacks', t.maxStacks, { min: 1, max: 20 });
    if (t.mods.length === 0) issues.push({ where, problem: 'has no modifiers' });
  }

  const grants = new Set<string>();
  for (const it of Object.values(bundle.items)) if (it.grants) grants.add(it.grants);

  for (const [id, it] of Object.entries(bundle.items)) {
    const where = `item:${id}`;
    if (it.id !== id) issues.push({ where, problem: `id field "${it.id}" does not match key` });
    if (it.mods.length === 0) issues.push({ where, problem: 'has no modifiers' });
    for (const m of it.mods) {
      checkNumber(issues, where, `mod ${m.stat}`, m.value);
      if (m.kind === 'mult' && m.value <= 0) {
        issues.push({ where, problem: `multiplicative mod on ${m.stat} must be > 0` });
      }
      // A `requires` nobody grants is a permanently dead modifier — the single
      // easiest synergy bug to ship unnoticed.
      if (m.requires !== undefined && !grants.has(m.requires)) {
        issues.push({ where, problem: `requires "${m.requires}" which no item grants` });
      }
    }
  }

  for (const [id, e] of Object.entries(bundle.enemies)) {
    const where = `enemy:${id}`;
    if (e.id !== id) issues.push({ where, problem: `id field "${e.id}" does not match key` });
    checkNumber(issues, where, 'hp', e.hp, { min: 1 });
    checkNumber(issues, where, 'damage', e.damage, { min: 0 });
    checkNumber(issues, where, 'speed', e.speed, { min: 0 });
    checkNumber(issues, where, 'radius', e.radius, { min: 0.05 });
    checkNumber(issues, where, 'xp', e.xp, { min: 0 });
  }

  for (const [id, b] of Object.entries(bundle.biomes)) {
    const where = `biome:${id}`;
    if (b.id !== id) issues.push({ where, problem: `id field "${b.id}" does not match key` });
    checkNumber(issues, where, 'halfExtent', b.halfExtent, { min: 10 });
    checkNumber(issues, where, 'durationSeconds', b.durationSeconds, { min: 10 });
    if (b.waves.length === 0) issues.push({ where, problem: 'has no wave phases' });
    if (b.waves[0]?.fromSeconds !== 0) {
      issues.push({ where, problem: 'first wave phase must start at 0 seconds' });
    }
    let prev = -1;
    let prevRate = -1;
    for (const w of b.waves) {
      if (w.fromSeconds <= prev) {
        issues.push({ where, problem: `wave phases must be strictly ordered (saw ${w.fromSeconds} after ${prev})` });
      }
      // AC-5.1 is a sim-level guarantee; a decreasing authored rate would break it.
      if (w.spawnRate < prevRate) {
        issues.push({ where, problem: `spawnRate decreases at ${w.fromSeconds}s (${w.spawnRate} < ${prevRate})` });
      }
      prev = w.fromSeconds;
      prevRate = w.spawnRate;
      if (w.enemies.length === 0) issues.push({ where, problem: `wave at ${w.fromSeconds}s has no enemies` });
      for (const [enemyId, weight] of w.enemies) {
        if (!bundle.enemies[enemyId]) {
          issues.push({ where, problem: `wave at ${w.fromSeconds}s references unknown enemy "${enemyId}"` });
        }
        if (weight <= 0) {
          issues.push({ where, problem: `wave at ${w.fromSeconds}s gives "${enemyId}" weight ${weight}` });
        }
      }
    }
    for (const boss of b.bosses) {
      if (!bundle.enemies[boss.enemyId]) {
        issues.push({ where, problem: `boss references unknown enemy "${boss.enemyId}"` });
      }
      if (boss.atSeconds > b.durationSeconds) {
        issues.push({ where, problem: `boss at ${boss.atSeconds}s never spawns (run ends at ${b.durationSeconds}s)` });
      }
    }
    for (const at of b.merchantAtSeconds) {
      if (at > b.durationSeconds) {
        issues.push({ where, problem: `merchant at ${at}s never arrives` });
      }
    }
  }

  for (const [id, c] of Object.entries(bundle.characters)) {
    const where = `character:${id}`;
    if (c.id !== id) issues.push({ where, problem: `id field "${c.id}" does not match key` });
    if (!bundle.weapons[c.startingWeapon]) {
      issues.push({ where, problem: `startingWeapon "${c.startingWeapon}" is not a known weapon` });
    }
  }

  return issues;
}

/** Throwing form, for startup. */
export function assertValidContent(bundle: ContentBundle): void {
  const issues = validateContent(bundle);
  if (issues.length > 0) {
    throw new Error(
      `Invalid content bundle:\n${issues.map((i) => `  ${i.where}: ${i.problem}`).join('\n')}`,
    );
  }
}
