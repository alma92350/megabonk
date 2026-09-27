/**
 * The content contract.
 *
 * packages/sim deliberately does NOT import packages/content: content is passed
 * in as data at run creation. That keeps the sim pure and content-agnostic, lets
 * tests build tiny fixture bundles instead of loading the real roster, and makes
 * "scale from 8 items to 70" an authoring job rather than an engineering one
 * (PRD §4.3).
 */

import type { ModifierKind, StatKey } from './stats.js';

export interface ModSpec {
  readonly stat: StatKey;
  readonly kind: ModifierKind;
  readonly value: number;
  /** Only applies while this condition tag is active (FR-12 synergies). */
  readonly requires?: string;
}

export type WeaponKind = 'melee' | 'projectile' | 'orbital';

export interface WeaponDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: WeaponKind;
  readonly maxLevel: number;
  readonly damage: number;
  readonly range: number;
  readonly cooldownTicks: number;
  /** Targets hit per swing. Melee arcs and orbitals hit several. */
  readonly targets: number;
  readonly knockbackTicks: number;
  /** Added per level beyond 1. */
  readonly damagePerLevel: number;
  readonly cooldownReductionPerLevel: number;
  readonly targetsPerLevel: number;
}

export interface TomeDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly maxStacks: number;
  readonly mods: readonly ModSpec[];
}

export interface ItemDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly mods: readonly ModSpec[];
  /** Condition tag this item makes active, enabling partners' conditional mods. */
  readonly grants?: string;
}

export interface EnemyDef {
  readonly id: string;
  readonly name: string;
  readonly hp: number;
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  readonly xp: number;
  readonly gold: number;
  readonly isBoss?: boolean;
}

export interface WavePhase {
  readonly fromSeconds: number;
  /** Spawns per second at the start of this phase. */
  readonly spawnRate: number;
  readonly enemies: ReadonlyArray<readonly [string, number]>;
}

export interface BossSpawn {
  readonly atSeconds: number;
  readonly enemyId: string;
}

export interface BiomeDef {
  readonly id: string;
  readonly name: string;
  readonly halfExtent: number;
  readonly obstacleCount: number;
  readonly durationSeconds: number;
  readonly waves: readonly WavePhase[];
  readonly bosses: readonly BossSpawn[];
  readonly merchantAtSeconds: readonly number[];
  readonly palette: BiomePalette;
}

/** Owned by the art director; consumed only by the renderer. */
export interface BiomePalette {
  readonly ground: string;
  readonly groundAlt: string;
  readonly fog: string;
  readonly obstacle: string;
  readonly accent: string;
}

export interface CharacterDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly mods: readonly ModSpec[];
  readonly startingWeapon: string;
}

export interface ContentBundle {
  readonly weapons: Readonly<Record<string, WeaponDef>>;
  readonly tomes: Readonly<Record<string, TomeDef>>;
  readonly items: Readonly<Record<string, ItemDef>>;
  readonly enemies: Readonly<Record<string, EnemyDef>>;
  readonly biomes: Readonly<Record<string, BiomeDef>>;
  readonly characters: Readonly<Record<string, CharacterDef>>;
}

/** Permanent meta-unlocks (FR-16) applied at run start. */
export interface MetaUnlocks {
  readonly extraRerolls: number;
  readonly extraWeaponSlots: number;
  readonly bonusLuck: number;
}

export const NO_UNLOCKS: MetaUnlocks = Object.freeze({
  extraRerolls: 0,
  extraWeaponSlots: 0,
  bonusLuck: 0,
});

export interface RunConfig {
  readonly seed: number;
  readonly characterId: string;
  readonly biomeId: string;
  readonly content: ContentBundle;
  readonly unlocks?: MetaUnlocks;
  /** Difficulty tier multiplier on enemy HP/damage. 1 = tier 1. */
  readonly difficulty?: number;
}
