import type { EnemyDef } from '@megabonk/sim';

/**
 * Eight archetypes, each defined by the pressure it applies rather than by its
 * numbers in isolation.
 *
 * Two sim facts drive every value here:
 *  - Contact damage takes the MAXIMUM damage among touching enemies, once per
 *    30 ticks of invulnerability. Incoming DPS is therefore capped at
 *    `2 * worstDamage - armour`, never the sum of a swarm. So `damage` sets how
 *    expensive a single mistake is, and `speed`/`hp` set how often you make one.
 *  - `hp` is only meaningful relative to the starting weapon's per-hit damage.
 *    Grunt HP is 16 against a 10-damage Bonker swing precisely so a grunt
 *    survives its first hit: that halves the arc's clear rate and is what stops
 *    a stationary player from holding the perimeter for free.
 */
export const enemies: Record<string, EnemyDef> = {
  // The baseline unit. Survives one level-1 swing. Cheap to be hit by (3 damage
  // = 2.5% of a starting health bar) so the opening minute forgives mistakes.
  grunt: { id: 'grunt', name: 'Grunt', hp: 16, damage: 3, speed: 2.3, radius: 0.45, xp: 2, gold: 1 },
  // Dies to one swing but arrives before you are ready. The first-minute teacher:
  // it reaches a standing player, which is the whole lesson.
  runner: { id: 'runner', name: 'Runner', hp: 9, damage: 3, speed: 3.7, radius: 0.33, xp: 2, gold: 1 },
  // Volume. Trivial individually, and the reason Area and multi-target matter.
  swarmling: { id: 'swarmling', name: 'Swarmling', hp: 6, damage: 2, speed: 3.0, radius: 0.28, xp: 1, gold: 1 },
  // RANGED harasser, and the single most important enemy in the roster: it holds
  // a 6.5-unit standoff, which is outside a level-1 Bonker's 2.4-unit arc. A
  // player who stands still cannot reach it and cannot dodge it, so standing
  // still now costs health by construction rather than by swarm arithmetic.
  //
  // projectileSpeed 11 against a 5.0 base move speed: a 6.5-unit shot is in the
  // air for 0.59 s, in which a moving player travels 2.95 units against a
  // 0.7-unit combined hitbox. Comfortably dodgeable if you are moving at all,
  // and a guaranteed hit if you are not. That ratio is the whole design.
  lobber: {
    id: 'lobber', name: 'Lobber', hp: 26, damage: 6, speed: 1.9, radius: 0.5, xp: 5, gold: 2,
    ranged: { range: 9, cooldownTicks: 105, projectileSpeed: 11, standoff: 6.5 },
  },
  // Faster than an unbooted player, tough enough to survive a swing. This is the
  // enemy that makes move-speed items a real pick rather than a comfort pick.
  stalker: { id: 'stalker', name: 'Stalker', hp: 30, damage: 7, speed: 3.1, radius: 0.4, xp: 6, gold: 3 },
  // A wall that also hurts. Arrives at 150 s, when the first weapon level-ups land.
  brute: { id: 'brute', name: 'Brute', hp: 58, damage: 9, speed: 1.8, radius: 0.75, xp: 8, gold: 4 },
  // RANGED sniper, from 420 s. Reads completely differently from the Lobber: one
  // telegraphed shot every 3.2 s, from 14 units away, that hurts. Its 10-unit
  // standoff is deliberately just inside the Dartgun's 11-unit range and outside
  // everything else's, so the Seer is the enemy that makes a long-range weapon or
  // stacked Area an answer instead of a luxury.
  //
  // projectileSpeed 24 is fast enough that a reaction-time dodge fails (0.42 s of
  // flight) and slow enough that a player already moving laterally is never hit.
  // It rewards continuous repositioning, not twitch — which is the skill this
  // game actually has a vocabulary for.
  seer: {
    id: 'seer', name: 'Seer', hp: 40, damage: 14, speed: 1.5, radius: 0.55, xp: 9, gold: 5,
    ranged: { range: 14, cooldownTicks: 190, projectileSpeed: 24, standoff: 10 },
  },
  // The DPS check. If you cannot kill a Hulk you cannot hold a position.
  tank: { id: 'tank', name: 'Hulk', hp: 150, damage: 12, speed: 1.35, radius: 1.0, xp: 16, gold: 9 },
  // Boss. Damage 20 at t=900 resolves to ~41 per hit after damageScale: touching
  // it is never survivable for long, at any build.
  warden: {
    id: 'warden', name: 'The Warden', hp: 1100, damage: 20, speed: 1.7, radius: 1.7,
    xp: 120, gold: 80, isBoss: true,
  },
};
