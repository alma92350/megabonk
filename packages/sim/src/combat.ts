/** Geometry, targeting (FR-1) and movement (FR-7). All pure. */

import type { Enemy, MapState, Vec2 } from './types.js';

export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function normalise(v: Vec2): Vec2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

/**
 * FR-1: nearest living enemy within range.
 *
 * Ties break by ascending entity id (AC-1.1) — NOT by array order. Array order
 * depends on spawn and removal history, which would make targeting depend on
 * things the player cannot see and quietly break determinism guarantees.
 *
 * Comparison uses squared distance to avoid 3000 sqrt calls per tick, with an
 * epsilon so that "exactly at max range" counts as in range (AC-1.2).
 */
const RANGE_EPSILON = 1e-9;

export function selectTarget(
  from: Vec2,
  range: number,
  enemies: readonly Enemy[],
): Enemy | null {
  const maxSq = range * range + RANGE_EPSILON;
  let best: Enemy | null = null;
  let bestSq = Infinity;
  for (const e of enemies) {
    if (e.hp <= 0) continue; // AC-1.3
    const dSq = distanceSq(from, e.pos);
    if (dSq > maxSq) continue;
    if (dSq < bestSq || (dSq === bestSq && best !== null && e.id < best.id)) {
      best = e;
      bestSq = dSq;
    }
  }
  return best;
}

/** AC-28.3: collapse a heading onto the 8 directions a keyboard can express. */
export function snapTo8(v: Vec2): Vec2 {
  if (v.x === 0 && v.y === 0) return { x: 0, y: 0 };
  const octant = Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4));
  const table: readonly Vec2[] = [
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
    { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  ];
  return table[((octant % 8) + 8) % 8]!;
}

function clampToBounds(p: Vec2, halfExtent: number): Vec2 {
  return {
    x: Math.max(-halfExtent, Math.min(halfExtent, p.x)),
    y: Math.max(-halfExtent, Math.min(halfExtent, p.y)),
  };
}

/**
 * Push a point out of any obstacle it overlaps.
 *
 * Applied to the *destination* rather than used as a movement veto, which is
 * what produces sliding (AC-7.2) and makes tunnelling impossible regardless of
 * speed (a 1000 u/s dash still resolves to outside the circle) without needing
 * swept-volume collision.
 */
function resolveObstacles(p: Vec2, map: MapState, bodyRadius: number): Vec2 {
  let out = p;
  // Two passes so that being wedged between two obstacles settles instead of
  // oscillating; more than two is not worth the cost at v1 obstacle densities.
  for (let pass = 0; pass < 2; pass++) {
    for (const o of map.obstacles) {
      const minDist = o.radius + bodyRadius;
      const dx = out.x - o.pos.x;
      const dy = out.y - o.pos.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= minDist) continue;
      if (d === 0) {
        // Exactly centred: pick a fixed direction rather than dividing by zero.
        out = { x: o.pos.x + minDist, y: o.pos.y };
      } else {
        out = { x: o.pos.x + (dx / d) * minDist, y: o.pos.y + (dy / d) * minDist };
      }
    }
  }
  return out;
}

/**
 * FR-7 movement. The direction is normalised, so diagonal speed equals cardinal
 * speed (AC-7.1) — the classic bug this prevents is moving √2 times faster on
 * the diagonal.
 */
export function applyMovement(
  pos: Vec2,
  dir: Vec2,
  speed: number,
  dtSeconds: number,
  map: MapState,
  bodyRadius = 0,
): Vec2 {
  const n = normalise(dir);
  if (n.x === 0 && n.y === 0) return pos;
  const moved: Vec2 = {
    x: pos.x + n.x * speed * dtSeconds,
    y: pos.y + n.y * speed * dtSeconds,
  };
  return clampToBounds(resolveObstacles(moved, map, bodyRadius), map.halfExtent);
}

/** FR-8: elevation blocks ranged line of sight. Data-only in v1. */
export function hasLineOfSight(from: Vec2, to: Vec2, map: MapState, minBlockingHeight = 2): boolean {
  for (const o of map.obstacles) {
    if (o.height < minBlockingHeight) continue;
    // Distance from the obstacle centre to the segment from→to.
    const vx = to.x - from.x;
    const vy = to.y - from.y;
    const wx = o.pos.x - from.x;
    const wy = o.pos.y - from.y;
    const lenSq = vx * vx + vy * vy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
    const cx = from.x + t * vx - o.pos.x;
    const cy = from.y + t * vy - o.pos.y;
    if (Math.sqrt(cx * cx + cy * cy) < o.radius) return false;
  }
  return true;
}
