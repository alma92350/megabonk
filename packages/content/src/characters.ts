import type { CharacterDef } from '@megabonk/sim';

export const characters: Record<string, CharacterDef> = {
  bonker: {
    id: 'bonker', name: 'Bonker', description: 'Balanced. Swings a big stick.',
    mods: [], startingWeapon: 'bonker',
  },
};
