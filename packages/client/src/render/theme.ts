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

/**
 * The creature roster lives in ./creatures/visuals.ts (one designed character per
 * kind, with its palette, scale and ranged cue). Re-exported here so existing
 * call sites keep working.
 */
export { enemyVisual, hasEnemyVisual, ENEMY_VISUALS } from './creatures/visuals.js';
export type { EnemyVisual, EnemyShape } from './creatures/visuals.js';

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
