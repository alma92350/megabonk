import type { TomeDef } from '@megabonk/sim';

export const tomes: Record<string, TomeDef> = {
  fury: {
    id: 'fury', name: 'Tome of Fury', description: 'Attack 12% faster per stack.',
    maxStacks: 5, mods: [{ stat: 'attackSpeed', kind: 'mult', value: 1.12 }],
  },
  edge: {
    id: 'edge', name: 'Tome of the Edge', description: '+6% crit chance per stack.',
    maxStacks: 5, mods: [{ stat: 'critChance', kind: 'flat', value: 0.06 }],
  },
  hide: {
    id: 'hide', name: 'Tome of Hide', description: '+2 armour and +12% max HP per stack.',
    maxStacks: 5,
    mods: [
      { stat: 'armour', kind: 'flat', value: 2 },
      { stat: 'maxHp', kind: 'mult', value: 1.12 },
    ],
  },
  fortune: {
    id: 'fortune', name: 'Tome of Fortune', description: '+2 Luck per stack. Better upgrades.',
    maxStacks: 5, mods: [{ stat: 'luck', kind: 'flat', value: 2 }],
  },
};
