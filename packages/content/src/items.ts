import type { ItemDef } from '@megabonk/sim';

/**
 * FR-12: at least two items form an explicit pairwise synergy. `grants` publishes
 * a condition tag; a partner's `requires` mod only applies while it is active.
 */
export const items: Record<string, ItemDef> = {
  boots: {
    id: 'boots', name: 'Stompers', description: '+0.6 move speed.',
    mods: [{ stat: 'moveSpeed', kind: 'flat', value: 0.6 }], grants: 'swift',
  },
  spurs: {
    id: 'spurs', name: 'Spurs', description: '+10% move speed — and +25% more while wearing Stompers.',
    mods: [
      { stat: 'moveSpeed', kind: 'mult', value: 1.1 },
      { stat: 'moveSpeed', kind: 'mult', value: 1.25, requires: 'swift' },
    ],
  },
  magnet: {
    id: 'magnet', name: 'Lodestone', description: '+70% pickup radius.',
    mods: [{ stat: 'pickupRadius', kind: 'mult', value: 1.7 }], grants: 'magnetic',
  },
  vacuum: {
    id: 'vacuum', name: 'Vacuum Tube', description: '+20% XP — and +40% more while carrying a Lodestone.',
    mods: [
      { stat: 'xpGain', kind: 'mult', value: 1.2 },
      { stat: 'xpGain', kind: 'mult', value: 1.4, requires: 'magnetic' },
    ],
  },
  gauntlet: {
    id: 'gauntlet', name: 'Gauntlet', description: '+4 might.',
    mods: [{ stat: 'might', kind: 'flat', value: 4 }],
  },
  lens: {
    id: 'lens', name: 'Cracked Lens', description: '+25% crit damage.',
    mods: [{ stat: 'critMultiplier', kind: 'mult', value: 1.25 }],
  },
  wallet: {
    id: 'wallet', name: 'Fat Wallet', description: '+35% gold.',
    mods: [{ stat: 'goldGain', kind: 'mult', value: 1.35 }],
  },
  bell: {
    id: 'bell', name: 'Brass Bell', description: '+20% attack area.',
    mods: [{ stat: 'area', kind: 'mult', value: 1.2 }],
  },
};
