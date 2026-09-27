/**
 * ART DIRECTION — "Inked Moss".
 *
 * A dark, high-contrast storybook-woodcut look, chosen because it is achievable
 * with nothing but Canvas 2D primitives and still reads as authored rather than
 * as a debug view:
 *
 *  - GROUND is a near-black moss green with a faint diamond lattice. The lattice
 *    is the only thing conveying speed in a top-down game with no background, so
 *    it is drawn in two parallaxing scales rather than one flat grid.
 *  - EVERY ACTOR is a chunky flat silhouette with a hard ink outline and a single
 *    rim-light in the biome accent along its top edge. One light direction, no
 *    gradients per entity: cheap, and it keeps 1500 entities legible.
 *  - HEIGHT is sold by a flat elliptical contact shadow plus a darker extruded
 *    side face on obstacles. No blur anywhere in the entity loop — a shadowBlur
 *    per entity is the single most reliable way to drop below 60 FPS.
 *  - UI is "stamped brass on slate": slab panels, thin bright rules, all-caps
 *    labels, and heraldic sigils for rarity.
 *
 * Contrast targets: body text on panel is well past 7:1, and every semantic
 * colour is paired with a shape or a label so colour is never load-bearing
 * (NFR-3 / AC-19.1).
 */

import { RARITIES, type Rarity } from '@megabonk/sim';

export const THEME = {
  /** Beyond the map edge. */
  void: '#04070a',
  ink: '#05090b',
  panel: '#0d1417',
  panelAlt: '#121b1f',
  panelEdge: '#2e4039',
  text: '#eaf2ea',
  textDim: '#8fa598',
  hp: '#e4574c',
  hpLow: '#ff9166',
  hpBack: '#3a1d1c',
  xp: '#66cdf5',
  xpBack: '#152a33',
  gold: '#ffc44d',
  silver: '#cbd8e4',
  accent: '#8fe08a',
  danger: '#ff4f70',
  boss: '#ff3d63',
  crit: '#fff3b0',
  merchant: '#ffd98a',
  advisor: '#a892ff',
  shadow: 'rgba(0,0,0,0.42)',
  outline: '#03060700',
} as const;

export type RarityShape = 'disc' | 'diamond' | 'shield' | 'star' | 'crown';

export interface RarityVisual {
  readonly rarity: Rarity;
  /** Cue 1: hue. */
  readonly color: string;
  readonly dim: string;
  /** Cue 2: silhouette. */
  readonly shape: RarityShape;
  /** Cue 3: text. */
  readonly label: string;
  /** Cue 4 (belt and braces): a countable pip row. */
  readonly pips: number;
}

/**
 * AC-19.1: colour AND shape AND text, all five distinct on each axis. A
 * colour-blind player reads the sigil; a low-vision player reads the label; a
 * player on a washed-out laptop panel counts the pips.
 */
export const RARITY_VISUALS: Readonly<Record<Rarity, RarityVisual>> = Object.freeze({
  common: { rarity: 'common', color: '#9fb3a8', dim: '#39443f', shape: 'disc', label: 'COMMON', pips: 1 },
  uncommon: { rarity: 'uncommon', color: '#6ed98f', dim: '#1f3f2c', shape: 'diamond', label: 'UNCOMMON', pips: 2 },
  rare: { rarity: 'rare', color: '#57a8ff', dim: '#1b3350', shape: 'shield', label: 'RARE', pips: 3 },
  epic: { rarity: 'epic', color: '#c477ff', dim: '#37204f', shape: 'star', label: 'EPIC', pips: 4 },
  legendary: { rarity: 'legendary', color: '#ffb23f', dim: '#4a3213', shape: 'crown', label: 'LEGENDARY', pips: 5 },
});

export function rarityVisual(rarity: Rarity): RarityVisual {
  return RARITY_VISUALS[rarity] ?? RARITY_VISUALS.common;
}

export type EnemyShape = 'blob' | 'dart' | 'hulk' | 'lob' | 'bug' | 'slab' | 'crown' | 'caster';

export interface EnemyVisual {
  readonly body: string;
  readonly rim: string;
  readonly shape: EnemyShape;
  /** Multiplier on the enemy's own radius when drawing the silhouette. */
  readonly scale: number;
}

/**
 * Each shipped archetype gets its own silhouette as well as its own hue, so an
 * enemy is identifiable in a crowd of 1500 at a glance and in greyscale.
 */
const ENEMY_VISUALS: Readonly<Record<string, EnemyVisual>> = Object.freeze({
  grunt: { body: '#7a8f6d', rim: '#c3dcae', shape: 'blob', scale: 1.0 },
  runner: { body: '#d0a65e', rim: '#ffd9a0', shape: 'dart', scale: 0.92 },
  brute: { body: '#a8544a', rim: '#ffb0a0', shape: 'hulk', scale: 1.35 },
  lobber: { body: '#5f7fa8', rim: '#bcd8ff', shape: 'lob', scale: 1.08 },
  swarmling: { body: '#b8a24b', rim: '#ffeea8', shape: 'bug', scale: 0.72 },
  tank: { body: '#6a5a86', rim: '#cbbcf0', shape: 'slab', scale: 1.7 },
  warden: { body: '#8d2a4a', rim: '#ff87ad', shape: 'crown', scale: 2.6 },
});

const FALLBACK_ENEMY: EnemyVisual = Object.freeze({
  body: '#6b7c74', rim: '#aac4b8', shape: 'blob', scale: 1.0,
});

/**
 * `isRanged` swaps in the `caster` silhouette — a hooded stance with a raised
 * orb. Ranged enemies behave differently (they hold a standoff instead of
 * swarming), and a player who cannot see why an enemy stopped approaching reads
 * it as a bug. Behaviour that differs must look different.
 */
const rangedVariants = new Map<string, EnemyVisual>();

export function enemyVisual(kind: string, isRanged = false): EnemyVisual {
  const base = ENEMY_VISUALS[kind] ?? FALLBACK_ENEMY;
  if (!isRanged) return base;
  // Cached, not spread per call: this runs once per enemy per frame, and at 1500
  // entities a fresh object here is 90k allocations a second.
  let variant = rangedVariants.get(kind);
  if (variant === undefined) {
    variant = { ...base, shape: 'caster' };
    rangedVariants.set(kind, variant);
  }
  return variant;
}

/** Enemy shots. Deliberately NOT the biome accent — hostile reads as hot pink. */
export const PROJECTILE_CORE = '#ff3f6d';
export const PROJECTILE_HEAD = '#fff0f4';
export const PROJECTILE_TRAIL = 'rgba(255,63,109,0.32)';

export const PICKUP_COLORS = {
  xp: THEME.xp,
  gold: THEME.gold,
  heal: '#78e39a',
} as const;

/** One family, three weights. System stacks only — no webfont, no asset files. */
export const FONT_STACK = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

export function font(px: number, weight: 'regular' | 'bold' = 'regular'): string {
  return `${weight === 'bold' ? '700 ' : ''}${Math.max(6, Math.round(px))}px ${FONT_STACK}`;
}

export const ALL_RARITIES = RARITIES;
