import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createRng, nextFloat, nextInt, weightedPick, forkStream, type RngState } from '../src/rng.js';

// ARCH-2: seeded RNG carried inside state, with independent labelled streams.
describe('ARCH-2 seeded RNG', () => {
  it('is reproducible: same seed produces the same first 1000 outputs', () => {
    const drain = () => {
      let s: RngState = createRng(12345, 'loot');
      const out: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const r = nextFloat(s);
        out.push(r.value);
        s = r.state;
      }
      return out;
    };
    expect(drain()).toEqual(drain());
  });

  it('produces different sequences for different seeds', () => {
    const first = (seed: number) => nextFloat(createRng(seed, 'loot')).value;
    expect(first(1)).not.toBe(first(2));
  });

  it('produces different sequences for different stream labels on the same seed', () => {
    const first = (label: string) => nextFloat(createRng(7, label)).value;
    expect(first('loot')).not.toBe(first('spawn'));
  });

  it('AC-5.2-adjacent: streams are independent — draining crit does not move loot', () => {
    const seed = 99;
    const lootFresh = nextFloat(createRng(seed, 'loot')).value;
    let crit = createRng(seed, 'crit');
    for (let i = 0; i < 500; i++) crit = nextFloat(crit).state;
    const lootAfter = nextFloat(createRng(seed, 'loot')).value;
    expect(lootAfter).toBe(lootFresh);
  });

  it('is purely functional: advancing returns new state and never mutates the input', () => {
    const s = createRng(42, 'loot');
    const snapshot = JSON.stringify(s);
    nextFloat(s);
    nextFloat(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('is JSON-serialisable and survives a round-trip mid-sequence (ARCH-1)', () => {
    let s = createRng(5, 'mapgen');
    for (let i = 0; i < 10; i++) s = nextFloat(s).state;
    const revived: RngState = JSON.parse(JSON.stringify(s));
    expect(nextFloat(revived).value).toBe(nextFloat(s).value);
  });

  it('nextFloat stays in [0, 1)', () => {
    let s = createRng(3, 'loot');
    for (let i = 0; i < 5000; i++) {
      const r = nextFloat(s);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      s = r.state;
    }
  });

  it('nextInt(max) stays in [0, max)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 0, max: 2 ** 31 }), (max, seed) => {
        const { value } = nextInt(createRng(seed, 'loot'), max);
        return Number.isInteger(value) && value >= 0 && value < max;
      }),
      { numRuns: 300 },
    );
  });

  it('forkStream derives a child stream deterministically without consuming the parent', () => {
    const parent = createRng(11, 'spawn');
    const a = forkStream(parent, 'wave-3');
    const b = forkStream(parent, 'wave-3');
    expect(nextFloat(a).value).toBe(nextFloat(b).value);
    expect(nextFloat(forkStream(parent, 'wave-4')).value).not.toBe(nextFloat(a).value);
  });

  describe('weightedPick', () => {
    it('never picks a zero-weight entry', () => {
      let s = createRng(1, 'loot');
      for (let i = 0; i < 2000; i++) {
        const r = weightedPick(s, [['a', 0], ['b', 1]]);
        expect(r.value).toBe('b');
        s = r.state;
      }
    });

    it('respects declared weights within tolerance over a large sample', () => {
      let s = createRng(4242, 'loot');
      const counts: Record<string, number> = { a: 0, b: 0 };
      const N = 40000;
      for (let i = 0; i < N; i++) {
        const r = weightedPick(s, [['a', 3], ['b', 1]]);
        counts[r.value] = (counts[r.value] ?? 0) + 1;
        s = r.state;
      }
      expect(counts.a! / N).toBeCloseTo(0.75, 2);
    });

    it('throws on an empty or all-zero table rather than returning undefined', () => {
      expect(() => weightedPick(createRng(1, 'loot'), [])).toThrow();
      expect(() => weightedPick(createRng(1, 'loot'), [['a', 0]])).toThrow();
    });
  });
});
