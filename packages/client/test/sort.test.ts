import { describe, expect, it } from 'vitest';
import { LAYER, SpriteBuffer, compareSprites } from '../src/render/sort.js';

describe('y-sorted sprite buffer', () => {
  it('orders standing sprites back to front by world y', () => {
    const buf = new SpriteBuffer();
    buf.push('enemy', 0, 0, 5, 0);
    buf.push('enemy', 1, 0, -3, 0);
    buf.push('player', 2, 0, 1, 0);
    buf.sort();
    expect(buf.items().map((s) => s.index)).toEqual([1, 2, 0]);
  });

  it('draws flat sprites (pickups, corpses) beneath standing ones regardless of y', () => {
    const buf = new SpriteBuffer();
    buf.push('enemy', 0, 0, -99, 0);
    buf.push('pickup', 1, 0, 99, 0);
    buf.sort();
    const items = buf.items();
    expect(items[0]!.kind).toBe('pickup');
    expect(items[1]!.kind).toBe('enemy');
    expect(LAYER.pickup).toBeLessThan(LAYER.enemy);
  });

  it('is a total order: equal depth falls back to index', () => {
    expect(compareSprites(
      { kind: 'enemy', layer: LAYER.enemy, index: 2, wx: 0, wy: 0, wz: 0, depth: 0 },
      { kind: 'enemy', layer: LAYER.enemy, index: 7, wx: 0, wy: 0, wz: 0, depth: 0 },
    )).toBeLessThan(0);
  });

  it('is stable across shuffles of the same input', () => {
    const rows: Array<[number, number]> = [[0, 3], [1, 3], [2, 1], [3, 9], [4, -2], [5, 3]];
    const build = (order: Array<[number, number]>) => {
      const b = new SpriteBuffer();
      for (const [i, y] of order) b.push('enemy', i, 0, y, 0);
      b.sort();
      return b.items().map((s) => s.index);
    };
    const forwards = build(rows);
    const backwards = build(rows.slice().reverse());
    expect(backwards).toEqual(forwards);
  });

  it('reuses pooled sprite objects so the draw loop allocates nothing', () => {
    const buf = new SpriteBuffer();
    buf.push('enemy', 0, 1, 2, 0);
    const first = buf.items()[0];
    buf.reset();
    expect(buf.length).toBe(0);
    buf.push('enemy', 5, 3, 4, 1);
    const second = buf.items()[0];
    expect(second).toBe(first);
    expect(second!.index).toBe(5);
    expect(second!.wz).toBe(1);
  });

  it('handles 2000 sprites', () => {
    const buf = new SpriteBuffer();
    for (let i = 0; i < 2000; i++) buf.push('enemy', i, 0, (i * 7919) % 101, 0);
    buf.sort();
    expect(buf.length).toBe(2000);
    const items = buf.items();
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.depth).toBeGreaterThanOrEqual(items[i - 1]!.depth);
    }
  });
});
