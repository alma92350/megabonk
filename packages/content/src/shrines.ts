import type { ShrineDef } from '@megabonk/sim';

/**
 * FR-14 shrines: a gold sink that pays out as a TIMED buff.
 *
 * Design job: gold previously had exactly one sink (three merchant visits), so
 * every coin past ~200 was dead. Shrines turn gold into a second, positional
 * resource — you have to walk to them, which means leaving your kiting lane, and
 * the buff window is short enough that *when* you cash it in is a real decision.
 *
 * `stackable` is false everywhere except Avarice. Re-touching a non-stackable
 * shrine refreshes its duration, so a player cannot farm a 3x might window by
 * walking in circles; Avarice stacks on purpose, because stacking an economy buff
 * is a self-limiting greed play, not a damage exploit.
 */
export const shrines: Record<string, ShrineDef> = {
  forge: {
    id: 'forge', name: 'Ember Forge', description: '+50% might for 45 s.',
    // Priced at roughly the gold from 60 s of mid-run killing. A burst window you
    // spend on a boss, not on grunts.
    cost: 60, durationSeconds: 45,
    mods: [{ stat: 'might', kind: 'mult', value: 1.5 }],
  },
  fleetfoot: {
    id: 'fleetfoot', name: 'Fleetfoot Cairn', description: '+35% move speed and +50% pickup radius for 30 s.',
    // The escape hatch. Cheapest shrine because its value is situational: useless
    // when safe, run-saving when a Stalker pack has you cornered.
    cost: 35, durationSeconds: 30,
    mods: [
      { stat: 'moveSpeed', kind: 'mult', value: 1.35 },
      { stat: 'pickupRadius', kind: 'mult', value: 1.5 },
    ],
  },
  bulwark: {
    id: 'bulwark', name: 'Bulwark Stone', description: '+6 armour and +25% max HP for 40 s.',
    // The panic button. Armour 6 removes most of a Grunt or Runner hit outright,
    // which is what makes standing in a swarm briefly survivable.
    cost: 70, durationSeconds: 40,
    mods: [
      { stat: 'armour', kind: 'flat', value: 6 },
      { stat: 'maxHp', kind: 'mult', value: 1.25 },
    ],
  },
  avarice: {
    id: 'avarice', name: 'Avarice Idol', description: '+80% gold and +4 Luck for 90 s. Stacks.',
    // The only stackable one: two idols in one window is a legitimate economy
    // play. It buys better offers (Luck) and more shrine uses (gold), so it
    // compounds into build quality rather than into raw damage.
    cost: 30, durationSeconds: 90, stackable: true,
    mods: [
      { stat: 'goldGain', kind: 'mult', value: 1.8 },
      { stat: 'luck', kind: 'flat', value: 4 },
    ],
  },
};
