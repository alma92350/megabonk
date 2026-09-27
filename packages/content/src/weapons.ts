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
    id: 'bonker', name: 'The Bonker', kind: 'melee', maxLevel: 5,
    description: 'A short, heavy swing. Two targets now, six when mastered.',
    // range 2.4 against a 0.9-unit contact distance leaves a 1.5-unit moat that a
    // 2.3 u/s grunt crosses in 0.65 s — less than one swing cycle, so grunts land.
    damage: 10, range: 2.4, cooldownTicks: 30, targets: 2, knockbackTicks: 4,
    damagePerLevel: 7, cooldownReductionPerLevel: 3, targetsPerLevel: 1,
  },
  dart: {
    id: 'dart', name: 'Dartgun', kind: 'projectile', maxLevel: 5,
    description: 'One target at a time, from a long way off. The boss-killer.',
    // Single-target for its whole life, so its damage per hit has to be the
    // highest in the game or it is never worth a slot.
    damage: 20, range: 11, cooldownTicks: 26, targets: 1, knockbackTicks: 0,
    damagePerLevel: 11, cooldownReductionPerLevel: 4, targetsPerLevel: 0,
  },
  halo: {
    id: 'halo', name: 'Halo', kind: 'orbital', maxLevel: 5,
    description: 'Orbiting shards. Low per-hit, relentless, and scales with Area.',
    // The fastest cadence in the roster, which makes it the weapon that cares
    // most about attack speed and area — and the one that carries a swarm run.
    damage: 6, range: 5, cooldownTicks: 16, targets: 2, knockbackTicks: 1,
    damagePerLevel: 4, cooldownReductionPerLevel: 2, targetsPerLevel: 1,
  },
};
