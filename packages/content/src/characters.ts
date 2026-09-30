import type { CharacterDef } from '@megabonk/sim';

/**
 * Four characters. Each one changes which *mistake* kills you, not just the
 * numbers on the HUD — that is the test for whether a character has an identity.
 *
 * Base stats for reference: might 10, maxHp 100, moveSpeed 5, attackSpeed 1,
 * armour 0, critChance 0.05, critMultiplier 2, pickupRadius 2.5, area 1.
 */
export const characters: Record<string, CharacterDef> = {
  bonker: {
    id: 'bonker', name: 'The Kindler',
    description: 'Balanced. 145 HP, a big stick, and no excuses.',
    // The reference character every balance target in DESIGN.md is measured on.
    // +20 HP (not a multiplier) because the forgiveness is wanted in minute one,
    // where a flat bonus is proportionally largest.
    mods: [{ stat: 'maxHp', kind: 'flat', value: 45 }],
    startingWeapon: 'bonker',
  },

  sliver: {
    id: 'sliver', name: 'Sliver',
    description: 'Glass cannon. Huge damage, 70 HP, dies to three late hits.',
    // +45% might is the largest damage mod in the game, paid for with 30% of the
    // health bar. Measured at x0.6 (60 HP) Sliver's median run was 268 s against
    // Bonker's 490 s — a trap, not a trade — so the tax is 30%, not 40%. The
    // Dartgun start is deliberate: long range is the only defence on offer.
    mods: [
      { stat: 'might', kind: 'mult', value: 1.45 },
      { stat: 'maxHp', kind: 'mult', value: 0.7 },
      { stat: 'moveSpeed', kind: 'flat', value: 0.4 },
      { stat: 'critChance', kind: 'flat', value: 0.05 },
    ],
    startingWeapon: 'dart',
  },

  bastion: {
    id: 'bastion', name: 'Barkguard',
    description: 'Tank. 208 HP and 3 armour, but slow and hits soft.',
    // (100 + 30) * 1.6 = 208 HP, and 3 flat armour halves an early Grunt hit.
    // Pays 18% move speed and 15% might: Bastion CAN stand in a swarm, and its
    // failure mode is being unable to escape one it cannot out-damage.
    mods: [
      { stat: 'maxHp', kind: 'flat', value: 30 },
      { stat: 'maxHp', kind: 'mult', value: 1.6 },
      { stat: 'armour', kind: 'flat', value: 3 },
      { stat: 'moveSpeed', kind: 'mult', value: 0.82 },
      { stat: 'might', kind: 'mult', value: 0.85 },
      { stat: 'area', kind: 'mult', value: 1.1 },
    ],
    startingWeapon: 'bonker',
  },

  zip: {
    id: 'zip', name: 'Zip',
    description: 'Speedster. 7.2 move speed, wide pickups, 80 HP.',
    // 7.2 base speed outruns every non-boss enemy even at the 1.5x late-game
    // speed cap (fastest is Runner at 3.7 -> 5.55), so Zip can always disengage.
    // In exchange: 80 HP, 10% less might, and the Halo start means Zip's damage
    // only lands on what is already close — the tension the character is built on.
    mods: [
      { stat: 'moveSpeed', kind: 'flat', value: 2.2 },
      { stat: 'pickupRadius', kind: 'mult', value: 1.5 },
      { stat: 'attackSpeed', kind: 'mult', value: 1.2 },
      { stat: 'maxHp', kind: 'mult', value: 0.8 },
      { stat: 'might', kind: 'mult', value: 0.9 },
    ],
    startingWeapon: 'halo',
  },
};
