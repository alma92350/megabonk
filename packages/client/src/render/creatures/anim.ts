/**
 * Animation and facing. Pure, allocation-free functions: they run once per
 * visible entity per frame, so they take numbers and return numbers.
 */

export const FRAMES = 4;

/** A cheap per-entity phase in [0, 1024): entities never step in lockstep. */
export function phaseOf(id: number): number {
  return ((Math.imul(id | 0, 2654435761) >>> 22) & 1023);
}

/**
 * Which of the FRAMES walk-cycle frames to show. Deterministic in
 * (time, id, frameMs). Reduced motion pins the pose to frame 0.
 */
export function animFrame(timeMs: number, id: number, frameMs: number, reduceMotion: boolean): number {
  if (reduceMotion) return 0;
  const offset = phaseOf(id) * (frameMs * FRAMES / 1024);
  const step = Math.floor((timeMs + offset) / frameMs);
  return ((step % FRAMES) + FRAMES) % FRAMES;
}

/** Movement (world units per tick) below which an entity counts as standing still. */
export const FACING_DEADZONE = 0.004;

/**
 * +1 = facing right, -1 = facing left. Movement decides; standing still (or
 * moving vertically) keeps whatever it last faced.
 */
export function resolveFacing(dx: number, last: number): number {
  if (dx > FACING_DEADZONE) return 1;
  if (dx < -FACING_DEADZONE) return -1;
  return last;
}

/** Last facing per enemy id. Bounded: cleared wholesale if it ever balloons. */
const lastFacing = new Map<number, number>();
const MAX_TRACKED = 8192;

/**
 * Facing for enemy `id`. `dx` is its movement this tick, `towardPlayer` the sign of
 * (player.x - x) used only for an entity never seen moving.
 */
export function facingFor(id: number, dx: number, towardPlayer: number): number {
  const known = lastFacing.get(id);
  const next = resolveFacing(dx, known ?? towardPlayer);
  if (known !== next) {
    if (known === undefined && lastFacing.size >= MAX_TRACKED) lastFacing.clear();
    lastFacing.set(id, next);
  }
  return next;
}
