import type { TomeDef } from '@megabonk/sim';

/**
 * Five tomes: one per axis a build can grow along. Each is a 5-stack commitment,
 * so taking one to max costs a quarter of a run's picks — the choice has to matter.
 *
 * Deliberately no tome grants both offence and defence: a tome that is always
 * correct is a tome that removes a decision.
 */
export const tomes: Record<string, TomeDef> = {
  fury: {
    id: 'fury', name: 'Tome of Fury', description: 'Attack 11% faster per stack.',
    // 1.11^5 = 1.69x cadence at max. Multiplies every weapon, so it is the
    // strongest generic tome and priced at the highest stack count to reach.
    maxStacks: 5, mods: [{ stat: 'attackSpeed', kind: 'mult', value: 1.11 }],
  },
  wrath: {
    id: 'wrath', name: 'Tome of Wrath', description: '+2 might per stack.',
    // Flat on a base of 10, so 5 stacks is exactly +100% damage — the honest,
    // legible damage line, and the counterweight to Fury's cadence line.
    maxStacks: 5, mods: [{ stat: 'might', kind: 'flat', value: 2 }],
  },
  edge: {
    id: 'edge', name: 'Tome of the Edge', description: '+6% crit chance per stack.',
    // Worth little alone (35% crit at x2 is +35% damage) and a lot with Cracked
    // Lens — the intended tome/item pairing rather than a flat damage boost.
    maxStacks: 5, mods: [{ stat: 'critChance', kind: 'flat', value: 0.06 }],
  },
  hide: {
    id: 'hide', name: 'Tome of Hide', description: '+2 armour and +12% max HP per stack.',
    // Armour is FLAT reduction with a 1-damage floor, so 10 armour removes most
    // of a Grunt hit and only a third of a Hulk hit. It buys time, never immunity.
    maxStacks: 5,
    mods: [
      { stat: 'armour', kind: 'flat', value: 2 },
      { stat: 'maxHp', kind: 'mult', value: 1.12 },
    ],
  },
  fortune: {
    id: 'fortune', name: 'Tome of Fortune', description: '+2 Luck per stack. Better upgrades.',
    // 10 Luck moves legendary from 1.0% to 3.0% and halves common. Mitigates the
    // PRD's "RNG frustration" risk by letting a player buy out of bad luck.
    maxStacks: 5, mods: [{ stat: 'luck', kind: 'flat', value: 2 }],
  },
};
