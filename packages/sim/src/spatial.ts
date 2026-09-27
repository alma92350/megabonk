/**
 * Uniform spatial hash for neighbour queries.
 *
 * Exists for one reason: enemy separation is the only naturally O(n²) system in
 * the sim, and at the 2000-entity cap that is 4M pair checks per tick, which
 * blows the 8 ms budget on its own. Bucketing makes it O(n·k).
 *
 * Not part of GameState — it is rebuilt each tick from the entity list, so it
 * never needs to be serialised and can never drift out of sync with the truth.
 */

import type { Vec2 } from './types.js';

export class SpatialGrid<T extends { readonly pos: Vec2 }> {
  private readonly cells = new Map<number, T[]>();

  constructor(private readonly cellSize: number) {}

  private key(x: number, y: number): number {
    // Interleave into one integer key; 2^16 cells per axis is far beyond map size.
    const cx = Math.floor(x / this.cellSize) + 32768;
    const cy = Math.floor(y / this.cellSize) + 32768;
    return cx * 65536 + cy;
  }

  insert(item: T): void {
    const k = this.key(item.pos.x, item.pos.y);
    const bucket = this.cells.get(k);
    if (bucket) bucket.push(item);
    else this.cells.set(k, [item]);
  }

  /** Everything in the 3×3 cell block around a point. Callers still filter by distance. */
  near(pos: Vec2): T[] {
    const out: T[] = [];
    const cx = Math.floor(pos.x / this.cellSize);
    const cy = Math.floor(pos.y / this.cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = this.cells.get(
          (cx + dx + 32768) * 65536 + (cy + dy + 32768),
        );
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }

  static build<T extends { readonly pos: Vec2 }>(items: readonly T[], cellSize: number): SpatialGrid<T> {
    const g = new SpatialGrid<T>(cellSize);
    for (const it of items) g.insert(it);
    return g;
  }
}
