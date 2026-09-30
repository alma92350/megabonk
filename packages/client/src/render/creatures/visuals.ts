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
  grunt: v('grunt', 'goblin', '#3b46e3', '#252c93', '#949bf9', '#bdc1ff', '#8a5a3a', '#3a1424', 1.35, false, 2.5, 130),
  // fast chaser: amber fox
  runner: v('runner', 'fox', '#e3843b', '#935425', '#f9c094', '#ffd9bd', '#fff2dc', '#3a1c0c', 1.5, false, 2.1, 90),
  // insect swarm: cyan beetle
  swarmling: v('swarmling', 'bug', '#3bc1e3', '#257d93', '#94e5f9', '#bdf2ff', '#e8fdff', '#0c3040', 1.55, false, 2.0, 70),
  // heavy bruiser: red tusked ogre
  brute: v('brute', 'ogre', '#e3c13b', '#937d25', '#f9e594', '#fff2bd', '#f1e6c8', '#3a0c0c', 1.2, false, 3.0, 190),
  // fast tough flanker: indigo wolf
  stalker: v('stalker', 'wolf', '#3be3d5', '#25938a', '#94f9f1', '#bdfff9', '#e9edff', '#141a55', 1.6, false, 2.0, 100),
  // ranged harasser: orchid hooded imp with a raised orb
  lobber: v('lobber', 'imp', '#bc44e4', '#772593', '#e094f9', '#eebdff', '#ffb4ff', '#2a0c48', 1.3, true, 2.7, 140),
  // ranged sniper: tall purple robed one-eyed seer
  seer: v('seer', 'seer', '#6f40dd', '#462593', '#b394f9', '#d1bdff', '#ffb4ff', '#1e0c4a', 1.35, true, 3.6, 170),
  // armoured tank: grey stone golem with lava runes
  tank: v('tank', 'golem', '#a6a6b2', '#646470', '#dedee8', '#f0f0f8', '#ff9a3c', '#2a2838', 1.2, false, 2.7, 220),
  // boss: plum armoured guardian with gold antlers
  warden: v('warden', 'warden', '#ae32a8', '#93258d', '#f994f4', '#ffbdfc', '#ffc94a', '#2a0620', 1.0, false, 4.9, 240),
});

const FALLBACK_ENEMY: EnemyVisual = Object.freeze(
  v('generic', 'generic', '#4b9ad2', '#256593', '#94cff9', '#bde3ff', '#f0e2c0', '#30101e', 1.2, false, 2.4, 140),
);

const FALLBACK_RANGED: EnemyVisual = Object.freeze(
  v('genericRanged', 'genericRanged', '#b070f0', '#7a3fb8', '#dcb4ff', '#eed6ff', '#ffb4ff', '#22103e', 1.2, true, 2.6, 140),
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
