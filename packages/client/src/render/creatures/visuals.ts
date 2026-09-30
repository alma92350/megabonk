/**
 * The creature roster: one row per kind, the single source of truth for what
 * each enemy looks like. Data only — the painting lives in enemies.ts.
 *
 * Design rules encoded here (and defended by test/creatures.test.ts):
 *  - one character concept, one silhouette id and one colour family per role;
 *  - no hostile body colour in the ground's moss-green hue band, and every body
 *    keeps a minimum contrast against the ground plus a light rim;
 *  - ranged kinds (and only they) carry the ranged cue: hood, glowing pink eyes
 *    and a raised orb in the same pink as enemy projectiles;
 *  - footprint (radius * scale) ascends with threat.
 */

export type EnemyShape =
  | 'goblin' | 'fox' | 'bug' | 'ogre' | 'wolf' | 'imp' | 'seer' | 'golem' | 'warden'
  | 'generic' | 'genericRanged';

export interface EnemyVisual {
  /** Stable id; also the sprite-cache namespace. */
  readonly id: string;
  readonly body: string;
  readonly shade: string;
  readonly light: string;
  /** Light rim / outline-adjacent colour used for separation from the ground. */
  readonly rim: string;
  /** A secondary material colour (horns, trim, belt, crown). */
  readonly accent: string;
  /** Darkest interior tone (mouths, hood interiors, boots). */
  readonly dark: string;
  readonly shape: EnemyShape;
  /** Multiplier on the sim hit radius: 1 world unit of sprite = radius * scale. */
  readonly scale: number;
  /** Ranged cue: hood + glowing eyes + raised orb. */
  readonly ranged: boolean;
  /** Sprite height in sprite units, for health bars. */
  readonly height: number;
  /** Milliseconds per animation frame. */
  readonly frameMs: number;
}

/** Enemy shots, and the glowing eyes of the things that fire them. */
export const RANGED_GLOW = '#ff5cf0';

function v(
  id: string, shape: EnemyShape, body: string, shade: string, light: string, rim: string,
  accent: string, dark: string, scale: number, ranged: boolean, height: number, frameMs: number,
): EnemyVisual {
  return { id, shape, body, shade, light, rim, accent, dark, scale, ranged, height, frameMs };
}

export const ENEMY_VISUALS: Readonly<Record<string, EnemyVisual>> = Object.freeze({
  // fodder swarm: rose-pink goblin
  grunt: v('grunt', 'goblin', '#7d5a3c', '#513b29', '#caac91', '#e4d4c6', '#8a5a3a', '#3a1424', 1.35, false, 2.5, 95),
  // fast chaser: amber fox
  runner: v('runner', 'fox', '#d2b89c', '#a47a4e', '#e8dcce', '#f3ede5', '#fff2dc', '#3a1c0c', 1.5, false, 2.1, 90),
  // insect swarm: cyan beetle
  swarmling: v('swarmling', 'bug', '#e2dabb', '#b6a35b', '#f0ecdd', '#f7f5ed', '#fffbe8', '#0c3040', 1.55, false, 2.0, 70),
  // heavy bruiser: red tusked ogre
  brute: v('brute', 'ogre', '#8a3aa0', '#5a2868', '#c994d8', '#e3c7eb', '#f1e6c8', '#3a0c0c', 1.2, false, 3.0, 190),
  // fast tough flanker: indigo wolf
  stalker: v('stalker', 'wolf', '#6c6a74', '#47464c', '#b5b4ba', '#d9d8db', '#ece8f0', '#141a55', 1.6, false, 2.0, 100),
  // ranged harasser: orchid hooded imp with a raised orb
  lobber: v('lobber', 'imp', '#c48ae0', '#8e36b9', '#e2c4f0', '#f0e1f7', '#ffb4ff', '#2a0c48', 1.3, true, 2.7, 140),
  // ranged sniper: tall purple robed one-eyed seer
  seer: v('seer', 'seer', '#6a48b0', '#473172', '#b4a2d9', '#d8cfeb', '#ffb4ff', '#1e0c4a', 1.35, true, 3.6, 170),
  // armoured tank: grey stone golem with lava runes
  tank: v('tank', 'golem', '#a6a6b2', '#6a6a79', '#d3d3d8', '#e8e8eb', '#ff9a3c', '#2a2838', 1.2, false, 2.7, 220),
  // boss: plum armoured guardian with gold antlers
  warden: v('warden', 'warden', '#8c4a94', '#5b3260', '#ca9fcf', '#e3cde6', '#e8dcc0', '#2a0620', 1.0, false, 4.9, 240),
});

const FALLBACK_ENEMY: EnemyVisual = Object.freeze(
  v('generic', 'generic', '#a8806a', '#715444', '#d3bfb4', '#e8ded8', '#f0e2c0', '#30101e', 1.2, false, 2.4, 140),
);

const FALLBACK_RANGED: EnemyVisual = Object.freeze(
  v('genericRanged', 'genericRanged', '#b070d0', '#7a379c', '#d8b8e8', '#eadaf3', '#ffb4ff', '#22103e', 1.2, true, 2.6, 140),
);

/** True when `kind` has its own designed creature (not the generic fallback). */
export function hasEnemyVisual(kind: string): boolean {
  return Object.prototype.hasOwnProperty.call(ENEMY_VISUALS, kind);
}

/**
 * Lookup runs once per enemy per frame and allocates nothing: every result is a
 * pre-built frozen object. `isRanged` only matters for kinds we have no design
 * for, so a future ranged monster still gets a hood and an orb.
 */
export function enemyVisual(kind: string, isRanged = false): EnemyVisual {
  const known = ENEMY_VISUALS[kind];
  if (known !== undefined && hasEnemyVisual(kind)) return known;
  return isRanged ? FALLBACK_RANGED : FALLBACK_ENEMY;
}

export function isFallbackVisual(visual: EnemyVisual): boolean {
  return visual === FALLBACK_ENEMY || visual === FALLBACK_RANGED;
}

/** The ground's moss-green hue band (degrees); no hostile body may sit in it. */
export const MOSS_HUE_MIN = 60;
export const MOSS_HUE_MAX = 165;

/**
 * THE MEANING SCHEME. A colour means one thing:
 *  - blue / cyan (170-255 deg)  = friendly, yours: XP gems, rare, the fleetfoot shrine;
 *  - saturated gold / yellow (25-60 deg) = reward: coins, chests, avarice;
 *  - hot pink (the projectile hue +-40 deg) = incoming damage;
 *  - moss green (60-165 deg) = the ground.
 * Hostile bodies live in clay / mud browns, bruise purples, iron grey and bone, so a
 * body is only allowed inside those bands when it is desaturated
 * (saturation < SATURATED).
 */
export const BLUE_HUE_MIN = 170;
export const BLUE_HUE_MAX = 255;
export const GOLD_HUE_MIN = 25;
export const GOLD_HUE_MAX = 60;
export const SATURATED = 0.45;
