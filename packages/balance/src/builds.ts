/**
 * Canonical archetype builds, expressed as an exact number of upgrade picks.
 *
 * "Equal level" has to mean "equal spend", or a DPS comparison is just a
 * comparison of how many upgrades each build was handed. A player at level L has
 * taken exactly L-1 picks; the starting weapon at level 1 is free.
 */

import type { HeldItem, WeaponInstance } from '@megabonk/sim';
import type { BuildSpec } from './dps.js';

const C = 'common' as const;

function w(id: string, level: number): WeaponInstance {
  return { id, level, cooldown: 0 };
}
function it(id: string, stacks: number): HeldItem {
  return { id, rarity: C, stacks };
}

/** Picks spent by a build, given the character's free starting weapon. */
export function pickCost(spec: BuildSpec, startingWeapon: string): number {
  let cost = 0;
  for (const weapon of spec.weapons) {
    cost += weapon.id === startingWeapon ? weapon.level - 1 : weapon.level;
  }
  for (const item of spec.items) cost += item.stacks;
  return cost;
}

/**
 * Six archetypes, each spending exactly 10 picks (a level-11 player).
 *
 * The first five are combat builds and are held to the domination ratio. `greed`
 * is a deliberate outlier: it spends its picks on economy and XP, so its DPS is
 * *supposed* to be low — it buys its power later, through the merchant and a
 * faster level pace. Asserting parity on it would force economy items to be
 * secretly damage items.
 */
export function combatArchetypes(picks = 10): BuildSpec[] {
  if (picks !== 10) return scaleArchetypes(combatArchetypes(10), picks);
  return [
    { name: 'bruiser', weapons: [w('bonker', 5)], items: [it('hide', 3), it('gauntlet', 3)] },
    { name: 'crit', weapons: [w('bonker', 5)], items: [it('edge', 3), it('lens', 3)] },
    { name: 'sniper', weapons: [w('bonker', 1), w('dart', 5)], items: [it('fury', 5)] },
    { name: 'orbital', weapons: [w('bonker', 1), w('halo', 5)], items: [it('bell', 3), it('gauntlet', 2)] },
    { name: 'generalist', weapons: [w('bonker', 3), w('dart', 3), w('halo', 3)], items: [it('fury', 2)] },
  ];
}

export function utilityArchetypes(): BuildSpec[] {
  return [
    { name: 'greed', weapons: [w('bonker', 5)], items: [it('magnet', 2), it('vacuum', 2), it('wallet', 2)] },
  ];
}

/**
 * Trim or extend a build to a different pick budget, used by the monotonicity
 * test (a level-5 build must be strictly weaker than the same build at level 10).
 * Weapon levels are spent first, then items, so a smaller budget is a genuine
 * prefix of the larger one rather than a different build.
 */
export function scaleArchetypes(specs: readonly BuildSpec[], picks: number): BuildSpec[] {
  return specs.map((spec) => {
    let budget = picks;
    const weapons: WeaponInstance[] = [];
    for (let i = 0; i < spec.weapons.length; i++) {
      const src = spec.weapons[i]!;
      const free = i === 0 ? 1 : 0;
      const want = src.level - free;
      const take = Math.max(0, Math.min(want, budget));
      budget -= take;
      const level = take + free;
      if (level > 0) weapons.push(w(src.id, level));
    }
    const items: HeldItem[] = [];
    for (const src of spec.items) {
      const take = Math.max(0, Math.min(src.stacks, budget));
      budget -= take;
      if (take > 0) items.push(it(src.id, take));
    }
    return { name: `${spec.name}@${picks}`, weapons, items };
  });
}
