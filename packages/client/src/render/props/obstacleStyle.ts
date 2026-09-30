/**
 * Which picture an obstacle gets, chosen from its data.
 *
 * The sim gives every obstacle a radius (1.2-3.2) and a height (1-3.5); height
 * >= 2 blocks shots and line of sight (sim/step.ts), so that rule has to be
 * VISIBLE: below the line an obstacle is a low, squat, jumpable-looking rock or
 * stump; at or above it, a tall tree or crag that reads as a wall.
 *
 * The result is a pure function of (radius, height, seed) with the numeric
 * inputs bucketed, so the same obstacle looks the same every frame and the set
 * of baked sprites is small and bounded.
 */

import { Y_SQUASH, Z_LIFT } from '../projection.js';

/** Sprite-space pixels per world unit. Sprites are baked at this scale and blitted at zoom / U. */
export const U = 32;

/** Mirrors the sim's blocking rule (sim/step.ts `o.height < 2`). */
export const BLOCKING_HEIGHT = 2;

export type ObstacleKind = 'boulder' | 'stump' | 'tree' | 'crag';

export interface ObstacleStyle {
  readonly kind: ObstacleKind;
  readonly tall: boolean;
  readonly variant: 0 | 1;
  /** Bucketed radius / height the sprite is baked at. */
  readonly rB: number;
  readonly hB: number;
  readonly key: string;
  /** Sprite box, px. */
  readonly width: number;
  readonly height: number;
  /** Anchor (the base centre) as fractions of the box. */
  readonly ay: number;
  /** Visible height over visible width: the "wall-ness" of the silhouette. */
  readonly aspect: number;
}

const styles = new Map<number, ObstacleStyle>();

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Cheap stable integer from a float pair, for the variant choice. */
export function seedOf(x: number, y: number): number {
  const a = Math.floor(x * 7.31) | 0;
  const b = Math.floor(y * 5.17) | 0;
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

export function obstacleStyle(radius: number, height: number, seed: number): ObstacleStyle {
  const rB = clamp(Math.round((Number.isFinite(radius) ? radius : 1) * 2) / 2, 1, 3.5);
  const hB = clamp(Math.round(Number.isFinite(height) ? height : 1), 1, 4);
  const tall = hB >= BLOCKING_HEIGHT;
  const variant = ((seed >>> 3) & 1) as 0 | 1;
  const pick = (seed >>> 5) & 1;
  const kind: ObstacleKind = tall
    ? (pick === 0 ? 'tree' : 'crag')
    : (rB <= 1.5 && pick === 0 ? 'stump' : 'boulder');

  const id = (tall ? 1 : 0) * 1000 + (kind === 'tree' || kind === 'stump' ? 500 : 0) + variant * 250 + rB * 20 + hB;
  const hit = styles.get(id);
  if (hit !== undefined) return hit;

  const rPx = rB * U;
  const lift = hB * U * Z_LIFT;
  let width: number;
  let above: number; // px above the base centre
  if (kind === 'tree') {
    const crown = rPx * 1.12;
    width = crown * 2 + 16;
    above = lift * 1.15 + crown * 1.05 + 10;
  } else if (kind === 'crag') {
    width = rPx * 2.1 + 16;
    above = lift * 1.5 + rPx * 0.6 + 10;
  } else if (kind === 'stump') {
    width = rPx * 2 + 16;
    above = lift + rPx * Y_SQUASH + 10;
  } else {
    width = rPx * 2.2 + 16;
    above = lift * 0.95 + rPx * 0.5 + 10;
  }
  const below = rPx * Y_SQUASH + 8;
  const height2 = above + below;
  const style: ObstacleStyle = {
    kind, tall, variant, rB, hB,
    key: `ob:${kind}:${variant}:${rB}:${hB}`,
    width: Math.ceil(width), height: Math.ceil(height2),
    ay: (above) / height2,
    aspect: above / width,
  };
  styles.set(id, style);
  return style;
}
