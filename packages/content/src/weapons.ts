import type { WeaponDef } from '@megabonk/sim';

/**
 * Three weapons, three answers to "what is in front of me".
 *
 * The dominant balance lever here is NOT damage: it is `targets` × `range`
 * against the arc's cooldown, because `runWeapons` re-selects the nearest living
 * enemy for every hit in a swing. A melee arc with generous range and several
 * targets clears the perimeter faster than enemies can enter it, and a player who
 * never moves takes zero damage. The Bonker is therefore deliberately tuned so
 * its level-1 clear rate sits just BELOW the opening spawn rate (see DESIGN.md
 * for the arithmetic), and its power comes from levels, not from the base swing.
 */
export const weapons: Record<string, WeaponDef> = {
  bonker: {
    id: 'bonker', name: 'Rootclub', kind: 'melee', maxLevel: 5,
    description: 'A wide, heavy swing. Three targets now, seven when mastered.',
    // range 3.0 against a 0.9-unit contact distance. Wide enough that a moving
    // player is not swarmed from behind (at 2.4 the reference kiting policy died
    // at 149 s median — the arc could not hold a front), and 12 damage against a
    // 16 HP grunt means two hits per kill, so the arc's clear rate never runs far
    // ahead of the spawn rate. Standing still is punished by ranged enemies, not
    // by a knife-edge melee throughput — see enemies.ts `lobber`.
    damage: 12, range: 3, cooldownTicks: 28, targets: 3, knockbackTicks: 5,
    damagePerLevel: 8, cooldownReductionPerLevel: 3, targetsPerLevel: 1,
  },
  dart: {
    id: 'dart', name: 'Dartgun', kind: 'projectile', maxLevel: 5,
    description: 'One target at a time, from a long way off. The boss-killer.',
    // Single-target for its whole life, so its damage per hit has to be the
    // highest in the game or it is never worth a slot. +14/level (not +11) because
    // at +11 the Dartgun archetype measured 679 DPS against the Bonker crit
    // archetype's 1875 — a 2.76x spread, outside the 2.5x budget. 20 -> 76 damage
    // across five levels puts it at ~800 and makes it genuinely the boss answer.
    damage: 20, range: 11, cooldownTicks: 26, targets: 1, knockbackTicks: 0,
    damagePerLevel: 14, cooldownReductionPerLevel: 4, targetsPerLevel: 0,
  },
  halo: {
    id: 'halo', name: 'Wisp Ring', kind: 'orbital', maxLevel: 5,
    description: 'Orbiting shards. Low per-hit, relentless, and scales with Area.',
    // The fastest cadence in the roster, which makes it the weapon that cares
    // most about attack speed and area — and the one that carries a swarm run.
    damage: 6, range: 5, cooldownTicks: 16, targets: 2, knockbackTicks: 1,
    damagePerLevel: 5, cooldownReductionPerLevel: 2, targetsPerLevel: 1,
  },
};
