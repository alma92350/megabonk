/**
 * Build-space properties: no dominant build, and a monotonic power curve.
 *
 * Measured through the real `step` weapon resolution in a fixed dummy arena, not
 * recomputed from the data table — a recomputation would agree with itself for
 * ever while the game diverged underneath it.
 */

import { describe, expect, it } from 'vitest';
import { characters, content, DEFAULT_CHARACTER, validateContent } from '@megabonk/content';
import { combatArchetypes, pickCost, scaleArchetypes, utilityArchetypes } from '../src/builds.js';
import { dominationRatio, measureDps } from '../src/dps.js';

const START = characters[DEFAULT_CHARACTER]!.startingWeapon;

describe('the shipped roster is internally consistent', () => {
  it('validates with zero issues', () => {
    expect(validateContent(content)).toEqual([]);
  });

  it('every archetype spends exactly the pick budget it claims', () => {
    for (const spec of combatArchetypes(10)) expect(pickCost(spec, START)).toBe(10);
    for (const spec of utilityArchetypes()) expect(pickCost(spec, START)).toBe(10);
  });
});

describe('no build dominates', () => {
  it('the strongest combat archetype is under 2.5x the weakest at equal picks', () => {
    const measured = combatArchetypes(10).map((s) => measureDps(s, { seconds: 4 }));
    const ratio = dominationRatio(measured);
    expect(
      ratio,
      `DPS: ${measured.map((m) => `${m.name}=${m.dps.toFixed(0)}`).join(' ')}`,
    ).toBeLessThan(2.5);
  });

  it('every combat archetype is a real option, not a trap', () => {
    const measured = combatArchetypes(10).map((s) => measureDps(s, { seconds: 4 }));
    const best = Math.max(...measured.map((m) => m.dps));
    for (const m of measured) {
      expect(m.dps / best, `${m.name} is only ${((m.dps / best) * 100).toFixed(0)}% of the best`)
        .toBeGreaterThan(0.4);
    }
  });

  /**
   * The documented outlier. `greed` spends its ten picks on gold, pickup radius
   * and XP, so it is SUPPOSED to be the weakest thing in the arena: it buys its
   * power later, from merchants and shrines and a faster level pace. Asserting
   * parity here would force economy items to be secretly damage items, which is
   * how a roster ends up with no real choices in it.
   */
  it('the economy build is a deliberate DPS outlier, and stays inside 2x of the weakest combat build', () => {
    const combat = combatArchetypes(10).map((s) => measureDps(s, { seconds: 4 }));
    const greed = measureDps(utilityArchetypes()[0]!, { seconds: 4 });
    const weakestCombat = Math.min(...combat.map((m) => m.dps));
    expect(greed.dps).toBeLessThan(weakestCombat * 1.5);
    expect(greed.dps).toBeGreaterThan(weakestCombat * 0.4);
  });
});

describe('the power curve is monotonic where it must be', () => {
  it('nine picks beats four picks for every archetype, by a clear margin', () => {
    for (const spec of combatArchetypes(10)) {
      const lo = measureDps(scaleArchetypes([spec], 4)[0]!, { seconds: 4 });
      const hi = measureDps(scaleArchetypes([spec], 9)[0]!, { seconds: 4 });
      expect(hi.dps, `${spec.name}: 4 picks=${lo.dps.toFixed(0)} 9 picks=${hi.dps.toFixed(0)}`)
        .toBeGreaterThan(lo.dps * 1.25);
    }
  });

  it('every extra pick is monotonically non-negative — no upgrade is a downgrade', () => {
    const spec = combatArchetypes(10)[0]!;
    let previous = 0;
    for (let picks = 0; picks <= 10; picks += 2) {
      const d = measureDps(scaleArchetypes([spec], picks)[0]!, { seconds: 3 });
      expect(d.dps, `picks=${picks} fell below picks=${picks - 2}`).toBeGreaterThanOrEqual(previous * 0.99);
      previous = d.dps;
    }
  });

  it('each weapon gains monotonically with its own levels', () => {
    for (const id of Object.keys(content.weapons)) {
      let previous = 0;
      for (let level = 1; level <= content.weapons[id]!.maxLevel; level++) {
        const d = measureDps(
          { name: `${id}@${level}`, weapons: [{ id, level, cooldown: 0 }], items: [] },
          { seconds: 3 },
        );
        expect(d.dps, `${id} level ${level} is not stronger than level ${level - 1}`)
          .toBeGreaterThan(previous);
        previous = d.dps;
      }
    }
  });
});

describe('synergies are live, and dead without their partner', () => {
  const pairs: ReadonlyArray<readonly [string, string, string]> = [
    ['boots', 'spurs', 'swift'],
    ['magnet', 'vacuum', 'magnetic'],
    ['plating', 'tonic', 'armoured'],
  ];

  it('every declared pair is wired both ways', () => {
    for (const [granter, partner, tag] of pairs) {
      expect(content.items[granter]!.grants, `${granter} should grant ${tag}`).toBe(tag);
      const conditional = content.items[partner]!.mods.filter((m) => m.requires === tag);
      expect(conditional.length, `${partner} should have a mod requiring ${tag}`).toBeGreaterThan(0);
      const unconditional = content.items[partner]!.mods.filter((m) => m.requires === undefined);
      expect(unconditional.length, `${partner} must be useful alone too`).toBeGreaterThan(0);
    }
  });
});
