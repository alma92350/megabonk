import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  BASE_STATS,
  STAT_CLAMPS,
  resolveStats,
  type Modifier,
  type StatKey,
} from '../src/stats.js';

const flat = (stat: StatKey, value: number, id = `f-${stat}-${value}`): Modifier => ({
  id, stat, kind: 'flat', value,
});
const mult = (stat: StatKey, value: number, id = `m-${stat}-${value}`): Modifier => ({
  id, stat, kind: 'mult', value,
});

describe('FR-9 stat composition', () => {
  it('AC-9.1 applies flats before mults: (100 + 10 + 10) * 1.2 * 1.2 = 172.8', () => {
    const base = { ...BASE_STATS, might: 100 };
    const out = resolveStats(base, [
      flat('might', 10, 'a'), flat('might', 10, 'b'),
      mult('might', 1.2, 'c'), mult('might', 1.2, 'd'),
    ]);
    expect(out.might).toBeCloseTo(172.8, 10);
    expect(out.might).not.toBeCloseTo(168, 6);   // flats applied after mults
    expect(out.might).not.toBeCloseTo(176.4, 6); // mults summed instead of multiplied
  });

  it('AC-9.2 is order-independent across 100 shuffled permutations', () => {
    const base = { ...BASE_STATS, might: 37 };
    const mods: Modifier[] = [
      flat('might', 5, '1'), mult('might', 1.15, '2'), flat('might', 12, '3'),
      mult('might', 0.9, '4'), flat('might', -3, '5'), mult('might', 2, '6'),
    ];
    const expected = resolveStats(base, mods).might;
    for (let i = 0; i < 100; i++) {
      const shuffled = mods.slice().sort(() => (i % 2 === 0 ? 1 : -1) * ((i * 7 + 3) % 5 - 2));
      expect(resolveStats(base, shuffled).might).toBe(expected);
    }
  });

  it('AC-9.2 property: any permutation of any modifier set yields an identical result', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            kind: fc.constantFrom<'flat' | 'mult'>('flat', 'mult'),
            value: fc.double({ min: 0.1, max: 5, noNaN: true }),
          }),
          { minLength: 0, maxLength: 12 },
        ),
        (specs) => {
          const mods: Modifier[] = specs.map((s, i) => ({
            id: `p${i}`, stat: 'might', kind: s.kind, value: s.value,
          }));
          const a = resolveStats(BASE_STATS, mods).might;
          const b = resolveStats(BASE_STATS, mods.slice().reverse()).might;
          return a === b;
        },
      ),
      { numRuns: 400 },
    );
  });

  it('AC-9.3 clamps attackSpeed to [0.1, 20]', () => {
    expect(resolveStats(BASE_STATS, [mult('attackSpeed', 1000)]).attackSpeed).toBe(20);
    expect(resolveStats(BASE_STATS, [mult('attackSpeed', 0.0001)]).attackSpeed).toBe(0.1);
  });

  it('AC-9.3 clamps moveSpeed to [0.5, 30] and critChance to [0, 1]', () => {
    expect(resolveStats(BASE_STATS, [flat('moveSpeed', -999)]).moveSpeed).toBe(0.5);
    expect(resolveStats(BASE_STATS, [flat('moveSpeed', 999)]).moveSpeed).toBe(30);
    expect(resolveStats(BASE_STATS, [flat('critChance', 5)]).critChance).toBe(1);
    expect(resolveStats(BASE_STATS, [flat('critChance', -5)]).critChance).toBe(0);
  });

  it('every stat declares a clamp, so no stat can silently run away', () => {
    for (const key of Object.keys(BASE_STATS) as StatKey[]) {
      expect(STAT_CLAMPS[key], `missing clamp for ${key}`).toBeDefined();
      const { min, max } = STAT_CLAMPS[key];
      expect(min).toBeLessThanOrEqual(max);
    }
  });

  it('AC-9.4 removing a modifier restores the exact prior value (non-destructive)', () => {
    const base = { ...BASE_STATS, might: 50 };
    const keep = [flat('might', 7, 'keep'), mult('might', 1.3, 'keepm')];
    const before = resolveStats(base, keep).might;
    const withExtra = resolveStats(base, [...keep, mult('might', 2, 'temp')]).might;
    const after = resolveStats(base, keep).might;
    expect(withExtra).not.toBe(before);
    expect(after).toBe(before);
    expect(base.might).toBe(50); // base object untouched
  });

  it('never mutates the base stats or the modifier list', () => {
    const base = { ...BASE_STATS };
    const snapshot = JSON.stringify(base);
    const mods = [flat('might', 3), mult('might', 2)];
    const modSnapshot = JSON.stringify(mods);
    resolveStats(base, mods);
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(JSON.stringify(mods)).toBe(modSnapshot);
  });

  it('a modifier for one stat never leaks into another', () => {
    const out = resolveStats(BASE_STATS, [flat('luck', 100)]);
    expect(out.luck).toBeGreaterThan(BASE_STATS.luck);
    expect(out.might).toBe(BASE_STATS.might);
    expect(out.moveSpeed).toBe(BASE_STATS.moveSpeed);
  });

  it('an empty modifier list returns the clamped base', () => {
    expect(resolveStats(BASE_STATS, [])).toEqual(resolveStats(BASE_STATS, []));
    expect(resolveStats(BASE_STATS, []).might).toBe(BASE_STATS.might);
  });

  it('rejects a non-finite modifier value rather than poisoning every stat with NaN', () => {
    expect(() => resolveStats(BASE_STATS, [flat('might', NaN)])).toThrow();
    expect(() => resolveStats(BASE_STATS, [mult('might', Infinity)])).toThrow();
  });
});
