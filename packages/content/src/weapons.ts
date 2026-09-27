import type { WeaponDef } from '@megabonk/sim';

/** Baseline roster. Numbers here are the game designer's to own and tune. */
export const weapons: Record<string, WeaponDef> = {
  bonker: {
    id: 'bonker', name: 'The Bonker', kind: 'melee', maxLevel: 5,
    description: 'A wide swing that clonks everything nearby.',
    damage: 14, range: 3.2, cooldownTicks: 26, targets: 3, knockbackTicks: 6,
    damagePerLevel: 7, cooldownReductionPerLevel: 2, targetsPerLevel: 1,
  },
  dart: {
    id: 'dart', name: 'Dartgun', kind: 'projectile', maxLevel: 5,
    description: 'Long-range needle. Hits one target, hard.',
    damage: 11, range: 10, cooldownTicks: 20, targets: 1, knockbackTicks: 0,
    damagePerLevel: 6, cooldownReductionPerLevel: 2, targetsPerLevel: 0,
  },
  halo: {
    id: 'halo', name: 'Halo', kind: 'orbital', maxLevel: 5,
    description: 'Orbiting shards grind down anything that closes in.',
    damage: 8, range: 4.5, cooldownTicks: 14, targets: 2, knockbackTicks: 2,
    damagePerLevel: 4, cooldownReductionPerLevel: 1, targetsPerLevel: 1,
  },
};
