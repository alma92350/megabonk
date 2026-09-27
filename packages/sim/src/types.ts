/** Shared data types. Everything here must be JSON-serialisable (ARCH-1). */

import type { Modifier, Stats } from './stats.js';
import type { Rarity } from './progression.js';
import type { RngState } from './rng.js';

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export type EntityId = number;

export interface Enemy {
  readonly id: EntityId;
  readonly kind: string;
  readonly pos: Vec2;
  readonly hp: number;
  readonly maxHp: number;
  readonly speed: number;
  readonly damage: number;
  readonly radius: number;
  readonly xp: number;
  readonly gold: number;
  readonly isBoss: boolean;
  /** Ticks until this enemy can damage the player again. */
  readonly attackCooldown: number;
  /** Ticks of knockback/stagger remaining; the enemy does not advance while > 0. */
  readonly stagger: number;
  /** Set on the tick it died, so the renderer can play a death effect. */
  readonly dyingFor?: number;
}

export type PickupKind = 'xp' | 'gold' | 'heal';

export interface Pickup {
  readonly id: EntityId;
  readonly kind: PickupKind;
  readonly pos: Vec2;
  readonly value: number;
  /** Ticks since spawn; used for the magnet ramp and for expiry. */
  readonly age: number;
}

export interface WeaponInstance {
  readonly id: string;
  readonly level: number;
  /** Ticks until the next swing. */
  readonly cooldown: number;
}

export interface HeldItem {
  readonly id: string;
  readonly rarity: Rarity;
  readonly stacks: number;
}

export interface PlayerState {
  readonly pos: Vec2;
  readonly hp: number;
  readonly level: number;
  readonly xp: number;
  readonly gold: number;
  readonly weapons: readonly WeaponInstance[];
  readonly items: readonly HeldItem[];
  readonly rerolls: number;
  /** Ticks of damage immunity remaining after being hit. */
  readonly invulnerable: number;
  /** Last non-zero movement direction, for facing and attack arcs. */
  readonly facing: Vec2;
  /** Resolved stats, recomputed whenever the modifier set changes. */
  readonly stats: Stats;
  readonly modifiers: readonly Modifier[];
}

export interface OfferOption {
  readonly kind: 'weapon' | 'tome' | 'item' | 'gold';
  readonly id: string;
  readonly rarity: Rarity;
  readonly name: string;
  readonly description: string;
  /** Present for gold padding options (AC-3.3). */
  readonly goldAmount?: number;
}

export interface Offer {
  readonly options: readonly OfferOption[];
  /** Tick the offer opened — the agent decision floor is measured from this (AC-28.4). */
  readonly openedTick: number;
  readonly rerollsUsed: number;
}

export type RunPhase = 'playing' | 'offer' | 'ended';
export type RunOutcome = 'survived' | 'died' | null;

export interface SimEvent {
  readonly tick: number;
  readonly type: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

/** Named RNG streams (ARCH-2). Each is advanced independently. */
export interface RngStreams {
  readonly loot: RngState;
  readonly spawn: RngState;
  readonly crit: RngState;
  readonly upgradeOffer: RngState;
  readonly mapgen: RngState;
}

export interface Obstacle {
  readonly pos: Vec2;
  readonly radius: number;
  /** FR-8: elevation, data only in v1 — blocks ranged line of sight. */
  readonly height: number;
}

export interface MapState {
  readonly halfExtent: number;
  readonly obstacles: readonly Obstacle[];
}

export interface GameState {
  readonly tick: number;
  readonly seed: number;
  readonly phase: RunPhase;
  readonly outcome: RunOutcome;
  readonly rng: RngStreams;
  readonly player: PlayerState;
  readonly enemies: readonly Enemy[];
  readonly pickups: readonly Pickup[];
  readonly map: MapState;
  readonly offer: Offer | null;
  /** Level-ups awaiting an offer screen (AC-2.2). */
  readonly queuedOffers: number;
  readonly nextId: EntityId;
  readonly kills: number;
  readonly bossKills: number;
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly goldEarned: number;
  /** Events emitted on the most recent tick only; the harness accumulates. */
  readonly events: readonly SimEvent[];
  /** Merchant, if one is currently on the map. */
  readonly merchant: MerchantState | null;
}

export interface MerchantState {
  readonly pos: Vec2;
  readonly stock: readonly MerchantStockEntry[];
}

export interface MerchantStockEntry {
  readonly option: OfferOption;
  readonly price: number;
  readonly sold: boolean;
}

/** The only channel into the sim. Human input and agent actions both become this. */
export interface InputFrame {
  /** Desired movement direction; normalised internally (AC-7.1). */
  readonly move: Vec2;
  /** Resolve the open offer by index (FR-3). */
  readonly chooseIndex?: number;
  readonly reroll?: boolean;
  /** Buy merchant stock by index. */
  readonly buyIndex?: number;
}

export const NO_INPUT: InputFrame = Object.freeze({ move: Object.freeze({ x: 0, y: 0 }) });
