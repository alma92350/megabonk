/**
 * Boss presence: pure helpers. The sim announces a boss with a `boss_spawned`
 * event and appends the boss enemy in the same tick; the renderer keys its
 * entrance off the enemy id so a boss can never fire twice.
 */
import type { Enemy, GameState } from '@megabonk/sim';

export const ENTRANCE_MS = 800;
/** The sim's player collision radius: contact damage lands at boss radius + this. */
export const CONTACT_PLAYER_RADIUS = 0.45;

export function entranceProgress(ageMs: number): number {
  if (!(ageMs > 0)) return 0;
  return ageMs >= ENTRANCE_MS ? 1 : ageMs / ENTRANCE_MS;
}

/** Scale-in from a small crouch with a slight overshoot; exactly 1 when done. */
export function entranceScale(p: number): number {
  if (p >= 1) return 1;
  if (p <= 0) return 0.25;
  const c1 = 1.2, c3 = c1 + 1;
  const t = p - 1;
  const back = 1 + c3 * t * t * t + c1 * t * t;
  return 0.25 + 0.75 * back;
}

/** 0 at or above half health, rising to 1 as the boss nears death. */
export function phaseTell(hp: number, maxHp: number): number {
  if (!(maxHp > 0)) return 0;
  const f = hp / maxHp;
  if (f >= 0.5) return 0;
  return Math.min(1, (0.5 - Math.max(0, f)) / 0.5) * 0.7 + 0.3;
}

/** World radius of the contact-damage reach, straight from the sim's rule. */
export function telegraphRadius(radius: number): number {
  return radius + CONTACT_PLAYER_RADIUS;
}

const found: Enemy[] = [];

/**
 * Bosses that appeared this tick. `seen` holds ids already announced. Requires
 * the `boss_spawned` event so a staged scene or a resumed run does not replay it.
 */
export function detectBossSpawns(before: GameState, after: GameState, seen: Set<number>): readonly Enemy[] {
  found.length = 0;
  const events = after.events;
  let announced = false;
  for (let i = 0; i < events.length; i++) if (events[i]!.type === 'boss_spawned') { announced = true; break; }
  if (!announced) return found;
  const enemies = after.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!;
    if (!e.isBoss || seen.has(e.id)) continue;
    seen.add(e.id);
    found.push(e);
  }
  void before;
  return found;
}
