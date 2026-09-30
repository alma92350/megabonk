/**
 * Static ground dressing: grass tufts, pebbles, tiny flowers.
 *
 * Pure function of the integer cell coordinates, so it is identical every frame
 * (no shimmer), independent of camera and of RNG state, and trivially bounded:
 * at most one item per cell, at most `MAX_DECOR` per viewport.
 */

export const DECOR_CELL = 3.5;
export const MAX_DECOR = 260;

export const DECOR_NONE = 0;
export const DECOR_TUFT = 1;
export const DECOR_PEBBLE = 2;
export const DECOR_FLOWER = 3;
export const DECOR_CLOVER = 4;
export type DecorKind = 0 | 1 | 2 | 3 | 4;

export function cellHash(cx: number, cy: number): number {
  let h = Math.imul(cx | 0, 0x27d4eb2d) ^ Math.imul(cy | 0, 0x165667b1) ^ 0x9e3779b9;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** ~40% of cells are empty so the ground breathes; the rest split by kind. */
export function decorKind(h: number): DecorKind {
  const r = h & 1023;
  if (r < 410) return DECOR_NONE;
  if (r < 700) return DECOR_TUFT;
  if (r < 850) return DECOR_PEBBLE;
  if (r < 950) return DECOR_CLOVER;
  return DECOR_FLOWER;
}

export function decorX(h: number, cx: number): number {
  return (cx + 0.12 + (((h >>> 10) & 255) / 255) * 0.76) * DECOR_CELL;
}
export function decorY(h: number, cy: number): number {
  return (cy + 0.12 + (((h >>> 18) & 255) / 255) * 0.76) * DECOR_CELL;
}

export interface CellRange { readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number }

/** Inclusive cell range covering a world rectangle. */
export function cellRange(
  minX: number, maxX: number, minY: number, maxY: number, out: { x0: number; x1: number; y0: number; y1: number },
): void {
  out.x0 = Math.floor(minX / DECOR_CELL);
  out.x1 = Math.floor(maxX / DECOR_CELL);
  out.y0 = Math.floor(minY / DECOR_CELL);
  out.y1 = Math.floor(maxY / DECOR_CELL);
}

/** Number of decor items whose cell falls in the range (capped, like drawing is). */
export function countDecor(r: CellRange): number {
  let n = 0;
  for (let cy = r.y0; cy <= r.y1; cy++) {
    for (let cx = r.x0; cx <= r.x1; cx++) {
      if (decorKind(cellHash(cx, cy)) !== DECOR_NONE && ++n >= MAX_DECOR) return MAX_DECOR;
    }
  }
  return n;
}

// ---- large scatter: fallen logs and mushroom rings ---------------------------
// A second, sparser lattice so these read as rare landmarks, not carpet.

export const LARGE_CELL = 13;
export const MAX_LARGE = 24;
export const LARGE_NONE = 0;
export const LARGE_LOG = 1;
export const LARGE_RING = 2;
export type LargeKind = 0 | 1 | 2;

export function largeHash(cx: number, cy: number): number {
  return cellHash(cx + 7919, cy - 104729);
}

/** ~22% of cells hold something: about one log and one ring per 5 cells. */
export function largeKind(h: number): LargeKind {
  const r = h & 1023;
  if (r < 800) return LARGE_NONE;
  return r < 915 ? LARGE_LOG : LARGE_RING;
}

export function largeX(h: number, cx: number): number {
  return (cx + 0.2 + (((h >>> 10) & 255) / 255) * 0.6) * LARGE_CELL;
}
export function largeY(h: number, cy: number): number {
  return (cy + 0.2 + (((h >>> 18) & 255) / 255) * 0.6) * LARGE_CELL;
}

export function largeCellRange(
  minX: number, maxX: number, minY: number, maxY: number, out: { x0: number; x1: number; y0: number; y1: number },
): void {
  out.x0 = Math.floor(minX / LARGE_CELL);
  out.x1 = Math.floor(maxX / LARGE_CELL);
  out.y0 = Math.floor(minY / LARGE_CELL);
  out.y1 = Math.floor(maxY / LARGE_CELL);
}

export function countLarge(r: CellRange): number {
  let n = 0;
  for (let cy = r.y0; cy <= r.y1; cy++) {
    for (let cx = r.x0; cx <= r.x1; cx++) {
      if (largeKind(largeHash(cx, cy)) !== LARGE_NONE && ++n >= MAX_LARGE) return MAX_LARGE;
    }
  }
  return n;
}

/** True when (x, y) is within `dist` of any interactable: scatter keeps clear of them. */
export function nearInteractable(
  x: number, y: number, list: ReadonlyArray<{ readonly pos: { readonly x: number; readonly y: number } }>, dist: number,
): boolean {
  const d2 = dist * dist;
  for (let i = 0; i < list.length; i++) {
    const p = list[i]!.pos;
    const dx = p.x - x, dy = p.y - y;
    if (dx * dx + dy * dy < d2) return true;
  }
  return false;
}
