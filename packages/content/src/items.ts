import type { ItemDef } from '@megabonk/sim';

/**
 * Eleven items in three families: mobility, survivability, and economy —
 * plus three small damage multipliers that let any build finish its curve.
 *
 * THREE explicit pairwise synergies (FR-12). Each is one item that publishes a
 * tag via `grants` and one partner whose `requires` mod is dead without it:
 *   swift     Stompers  -> Spurs        (mobility)
 *   magnetic  Lodestone -> Vacuum Tube  (XP economy)
 *   armoured  Plating   -> Field Tonic  (survivability)
 * The pairs are deliberately one per family, so a synergy is a reward for
 * committing to a plan rather than a reward for picking two specific cards.
 */
export const items: Record<string, ItemDef> = {
  // --- Mobility ------------------------------------------------------------
  boots: {
    id: 'boots', name: 'Stompers', description: '+0.6 move speed.',
    // Flat, so it is worth most early — the fix for a first-minute death.
    mods: [{ stat: 'moveSpeed', kind: 'flat', value: 0.6 }], grants: 'swift',
  },
  spurs: {
    id: 'spurs', name: 'Spurs', description: '+10% move speed — and +22% more while wearing Stompers.',
    // Multiplicative, so it is worth most late and only after Stompers has
    // raised the base. Together they beat a Stalker's 3.1 speed; alone neither does.
    mods: [
      { stat: 'moveSpeed', kind: 'mult', value: 1.1 },
      { stat: 'moveSpeed', kind: 'mult', value: 1.22, requires: 'swift' },
    ],
  },

  // --- Survivability -------------------------------------------------------
  plating: {
    id: 'plating', name: 'Scrap Plating', description: '+3 armour.',
    // Flat damage reduction. Three stacks removes a Grunt hit almost entirely
    // and is the cheapest answer to a swarm you cannot outrun.
    mods: [{ stat: 'armour', kind: 'flat', value: 3 }], grants: 'armoured',
  },
  tonic: {
    id: 'tonic', name: 'Field Tonic', description: '+20 max HP — and +15% more while plated.',
    mods: [
      { stat: 'maxHp', kind: 'flat', value: 20 },
      { stat: 'maxHp', kind: 'mult', value: 1.15, requires: 'armoured' },
    ],
  },

  // --- Economy and XP ------------------------------------------------------
  magnet: {
    id: 'magnet', name: 'Lodestone', description: '+60% pickup radius.',
    // Pickup radius is secretly a survivability stat: it lets a kiting player
    // bank XP without walking back into the train.
    mods: [{ stat: 'pickupRadius', kind: 'mult', value: 1.6 }], grants: 'magnetic',
  },
  vacuum: {
    id: 'vacuum', name: 'Vacuum Tube', description: '+15% XP — and +30% more while carrying a Lodestone.',
    mods: [
      { stat: 'xpGain', kind: 'mult', value: 1.15 },
      { stat: 'xpGain', kind: 'mult', value: 1.3, requires: 'magnetic' },
    ],
  },
  wallet: {
    id: 'wallet', name: 'Fat Wallet', description: '+35% gold.',
    // Gold now has three sinks (merchant, five shrines), so this is a real pick.
    mods: [{ stat: 'goldGain', kind: 'mult', value: 1.35 }],
  },

  // --- Damage finishers ----------------------------------------------------
  gauntlet: {
    id: 'gauntlet', name: 'Gauntlet', description: '+2 might.',
    // Halved from the first draft: at +4 it was a 3x damage multiplier for three
    // picks and every measured build collapsed into "take Gauntlet".
    mods: [{ stat: 'might', kind: 'flat', value: 2 }],
  },
  lens: {
    id: 'lens', name: 'Cracked Lens', description: '+25% crit damage.',
    // Multiplies the Edge tome. Worthless at 5% crit, build-defining at 35%.
    mods: [{ stat: 'critMultiplier', kind: 'mult', value: 1.25 }],
  },
  bell: {
    id: 'bell', name: 'Brass Bell', description: '+15% attack area.',
    // Area scales weapon RANGE, which for a melee arc widens the moat and for the
    // Halo turns a 5-unit ring into a 10-unit one. Trimmed from 20% for that reason.
    mods: [{ stat: 'area', kind: 'mult', value: 1.15 }],
  },
  whetstone: {
    id: 'whetstone', name: 'Whetstone', description: '+4% crit chance and +6% might.',
    // The deliberately boring card: always slightly useful, never a plan. It
    // exists so a bad offer is never a wasted level.
    mods: [
      { stat: 'critChance', kind: 'flat', value: 0.04 },
      { stat: 'might', kind: 'mult', value: 1.06 },
    ],
  },
};
