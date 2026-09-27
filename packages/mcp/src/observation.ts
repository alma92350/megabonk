/**
 * FR-27: the perception filter.
 *
 * A pure function from `GameState` to the agent's observation, plus a bounded
 * ring buffer of past observations so `get_state` can serve a stale frame.
 *
 * The filter lives HERE and not in `packages/sim` (ARCH-1): the simulation has no
 * concept of an agent. That is what lets one simulation serve a human, a
 * handicapped agent and an unhandicapped debug agent identically.
 *
 * Note that the snapshot is computed at RECORD time, from the state of that tick.
 * Filtering on the way out of the buffer instead would use today's camera position
 * to decide what was visible yesterday.
 */

import { distance, normalise, snapTo8, xpForLevel } from '@megabonk/sim';
import type {
  ActiveBuff,
  ContentBundle,
  Enemy,
  GameState,
  Offer,
  Projectile,
  Vec2,
} from '@megabonk/sim';
import type { ResolvedHandicap } from './handicap.js';

export type HpBucket = 'full' | 'high' | 'mid' | 'low' | 'critical';

/** The human sees a bar, not an integer (FR-27). Five levels, as the HUD draws. */
export function hpBucketFor(hp: number, maxHp: number): HpBucket {
  const ratio = maxHp > 0 ? hp / maxHp : 0;
  if (ratio > 0.8) return 'full';
  if (ratio > 0.6) return 'high';
  if (ratio > 0.35) return 'mid';
  if (ratio > 0.15) return 'low';
  return 'critical';
}

export type Sector = 'E' | 'NE' | 'N' | 'NW' | 'W' | 'SW' | 'S' | 'SE';

const SECTORS: readonly { readonly v: Vec2; readonly name: Sector }[] = [
  { v: { x: 1, y: 0 }, name: 'E' },
  { v: { x: 1, y: 1 }, name: 'NE' },
  { v: { x: 0, y: 1 }, name: 'N' },
  { v: { x: -1, y: 1 }, name: 'NW' },
  { v: { x: -1, y: 0 }, name: 'W' },
  { v: { x: -1, y: -1 }, name: 'SW' },
  { v: { x: 0, y: -1 }, name: 'S' },
  { v: { x: 1, y: -1 }, name: 'SE' },
];

/** The 8 compass sectors the SFX layer can convey — direction only, no distance. */
export function sectorName(v: Vec2): Sector {
  const s = snapTo8(v);
  for (const entry of SECTORS) {
    if (entry.v.x === s.x && entry.v.y === s.y) return entry.name;
  }
  return 'E';
}

export interface ObservedEnemy {
  readonly id: number;
  readonly kind: string;
  readonly pos: Vec2;
  readonly dist: number;
  readonly radius: number;
  readonly isBoss: boolean;
  /**
   * Visible from the silhouette and behaviour, so it is fair game. The enemy's
   * shot cooldown deliberately is NOT exposed — that is `nextAttackTick` by
   * another name, and the human does not get it either (FR-27).
   */
  readonly ranged: boolean;
  readonly hpBucket: HpBucket;
  readonly staggered: boolean;
  /** AC-27.5: present for bosses only. Absent entirely otherwise (AC-27.4). */
  readonly hp?: number;
  readonly maxHp?: number;
}

/**
 * FR-27 and projectiles: a bullet's direction of travel is something a human reads
 * straight off the screen, so hiding it would make shots undodgeable for the agent
 * in a way they are not for a human — a handicap harsher than human is as wrong as
 * one that is too lenient. `Projectile.vel` is therefore never passed through;
 * `heading` (an 8-sector compass reading) and `speed` are DERIVED from it, which
 * keeps the AC-27.7 key scan honest. `dir` (the exact unit vector) appears only
 * under a profile with `exactHeadings`, i.e. `unrestricted`.
 */
export interface ObservedProjectile {
  readonly id: number;
  readonly pos: Vec2;
  readonly dist: number;
  readonly radius: number;
  readonly heading: Sector;
  readonly speed: number;
  /** Ticks before it despawns. */
  readonly ticksToLive: number;
  readonly dir?: Vec2;
}

export interface ObservedPickup {
  readonly id: number;
  readonly kind: string;
  readonly pos: Vec2;
  readonly dist: number;
  readonly value: number;
}

/**
 * FR-14 chests and shrines. Deliberately subject to the same viewport filter as
 * enemies (AC-27.3): an agent that knows where every chest on the map is has
 * global map knowledge the human does not, which is exactly the superhuman
 * advantage FR-27 exists to remove. `shrineId` is kept because the human reads
 * the same word off the shrine's on-screen label.
 */
export interface ObservedInteractable {
  readonly id: number;
  readonly kind: string;
  readonly pos: Vec2;
  readonly dist: number;
  readonly used: boolean;
  readonly shrineId?: string;
}

/**
 * FR-14 timed buffs. The HUD shows these, so the agent gets them — with the
 * remaining duration expressed in TICKS (and seconds derived from ticks), never
 * a wall-clock duration. `mods` is exposed because the shrine label states it.
 */
export interface ObservedBuff {
  readonly id: string;
  readonly expiresAtTick: number;
  readonly ticksRemaining: number;
  readonly secondsRemaining: number;
  readonly mods: readonly { readonly stat: string; readonly kind: string; readonly value: number }[];
}

export interface ObservedObstacle {
  readonly pos: Vec2;
  readonly radius: number;
  readonly height: number;
}

export interface ObservedOption {
  readonly index: number;
  readonly kind: string;
  readonly id: string;
  readonly name: string;
  readonly rarity: string;
  readonly description: string;
  readonly goldAmount?: number;
}

export interface ObservedOffer {
  /** FR-14: a chest offer looks different on screen, so the agent sees it too. */
  readonly source: string;
  readonly openedTick: number;
  readonly ticksOpen: number;
  readonly rerollsUsed: number;
  readonly rerollsAvailable: number;
  readonly decisionAllowedInTicks: number;
  readonly options: readonly ObservedOption[];
}

export interface ObservedMerchantEntry {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly rarity: string;
  readonly price: number;
  readonly sold: boolean;
}

export interface ObservedPlayer {
  readonly pos: Vec2;
  readonly hp: number;
  readonly maxHp: number;
  readonly level: number;
  readonly xp: number;
  readonly xpToNext: number;
  readonly gold: number;
  readonly rerolls: number;
  readonly invulnerableTicks: number;
  /** A compass sector, not a vector: a heading read off an animation (FR-27). */
  readonly facing: Sector;
  readonly weapons: readonly { readonly id: string; readonly level: number }[];
  readonly items: readonly { readonly id: string; readonly rarity: string; readonly stacks: number }[];
  readonly buffs: readonly ObservedBuff[];
  readonly stats: Readonly<Record<string, number>>;
}

export interface Observation {
  /** The SIM TICK this snapshot was taken at — not the live tick (AC-27.1). */
  readonly tick: number;
  /** The observation frame index. Advances on paused offer screens too. */
  readonly frame: number;
  readonly seconds: number;
  readonly phase: string;
  readonly outcome: string | null;
  readonly profile: string;
  readonly delayTicks: number;
  readonly player: ObservedPlayer;
  readonly enemies: readonly ObservedEnemy[];
  /** How many enemies are on screen in total, before the list cap. */
  readonly visibleEnemies: number;
  readonly pickups: readonly ObservedPickup[];
  readonly projectiles: readonly ObservedProjectile[];
  readonly obstacles: readonly ObservedObstacle[];
  readonly interactables: readonly ObservedInteractable[];
  readonly merchant: { readonly pos: Vec2; readonly stock: readonly ObservedMerchantEntry[] } | null;
  readonly offer: ObservedOffer | null;
  /** AC-27.3 rationale: off-screen enemies become a coarse sector hint only. */
  readonly audio: readonly { readonly sector: Sector; readonly count: number }[];
  readonly map: { readonly halfExtent: number };
}

export interface ObserveContext {
  readonly frame: number;
  /** Used only to report whether an enemy KIND is ranged. Optional for unit tests. */
  readonly content?: ContentBundle;
  /** Frames the current offer screen has been open (the sim clock is paused). */
  readonly offerTicks?: number;
}

function quantise(value: number, q: number): number {
  if (q <= 0) return value;
  return Math.round(value / q) * q;
}

function qPos(p: Vec2, q: number): Vec2 {
  return { x: quantise(p.x, q), y: quantise(p.y, q) };
}

function onScreen(h: ResolvedHandicap, camera: Vec2, p: Vec2): boolean {
  if (!h.onScreenOnly) return true;
  return (
    Math.abs(p.x - camera.x) <= h.viewHalfWidth && Math.abs(p.y - camera.y) <= h.viewHalfHeight
  );
}

function observeProjectile(p: Projectile, camera: Vec2, h: ResolvedHandicap): ObservedProjectile {
  const speed = Math.hypot(p.vel.x, p.vel.y);
  const base = {
    id: p.id,
    pos: qPos(p.pos, h.positionQuantum),
    dist: quantise(distance(p.pos, camera), h.positionQuantum),
    radius: p.radius,
    heading: sectorName(p.vel),
    speed: quantise(speed, h.positionQuantum),
    ticksToLive: p.ttl,
  };
  return h.exactHeadings ? { ...base, dir: normalise(p.vel) } : base;
}

function observeEnemy(
  e: Enemy,
  camera: Vec2,
  h: ResolvedHandicap,
  ranged: boolean,
): ObservedEnemy {
  const pos = qPos(e.pos, h.positionQuantum);
  const base = {
    id: e.id,
    kind: e.kind,
    pos,
    dist: quantise(distance(e.pos, camera), h.positionQuantum),
    radius: e.radius,
    isBoss: e.isBoss,
    ranged,
    hpBucket: hpBucketFor(e.hp, e.maxHp),
    staggered: e.stagger > 0,
  };
  // AC-27.4/27.5: the numeric fields are added only where the HUD shows a number.
  if (!h.bucketEnemyHp || e.isBoss) return { ...base, hp: e.hp, maxHp: e.maxHp };
  return base;
}

function observeBuff(b: ActiveBuff, tick: number): ObservedBuff {
  const ticksRemaining = Math.max(0, b.expiresAtTick - tick);
  return {
    id: b.id,
    expiresAtTick: b.expiresAtTick,
    ticksRemaining,
    secondsRemaining: ticksRemaining / 60,
    mods: b.mods.map((m) => ({ stat: m.stat, kind: m.kind, value: m.value })),
  };
}

function observeOffer(
  offer: Offer,
  h: ResolvedHandicap,
  rerolls: number,
  offerTicks: number,
): ObservedOffer {
  return {
    source: offer.source,
    openedTick: offer.openedTick,
    ticksOpen: offerTicks,
    rerollsUsed: offer.rerollsUsed,
    rerollsAvailable: rerolls,
    decisionAllowedInTicks: Math.max(0, h.offerDecisionFloorTicks - offerTicks),
    options: offer.options.map((o, index) => ({
      index,
      kind: o.kind,
      id: o.id,
      name: o.name,
      rarity: o.rarity,
      description: o.description,
      ...(o.goldAmount !== undefined ? { goldAmount: o.goldAmount } : {}),
    })),
  };
}

/**
 * The whole FR-27 filter, as one pure function.
 *
 * Everything the human cannot see is dropped rather than transformed: future
 * waves never appear because only live entities are read, and the RNG streams,
 * the seed and `nextId` are simply never copied (AC-24.5, AC-27.7).
 */
export function observeState(
  state: GameState,
  h: ResolvedHandicap,
  ctx: ObserveContext,
): Observation {
  const camera = state.player.pos;
  const q = h.positionQuantum;

  const visible: ObservedEnemy[] = [];
  const audioCounts = new Map<Sector, number>();
  for (const e of state.enemies) {
    if (e.hp <= 0) continue; // corpses are a renderer concern
    if (onScreen(h, camera, e.pos)) {
      const def = ctx.content?.enemies[e.kind];
      visible.push(observeEnemy(e, camera, h, def?.ranged !== undefined));
    } else if (h.audioHints) {
      const sector = sectorName({ x: e.pos.x - camera.x, y: e.pos.y - camera.y });
      audioCounts.set(sector, (audioCounts.get(sector) ?? 0) + 1);
    }
  }
  visible.sort((a, b) => a.dist - b.dist || a.id - b.id);
  const visibleEnemies = visible.length;
  const enemies = visible.slice(0, h.maxNearbyEnemies);

  const pickups: ObservedPickup[] = [];
  for (const p of state.pickups) {
    if (!onScreen(h, camera, p.pos)) continue;
    pickups.push({
      id: p.id,
      kind: p.kind,
      pos: qPos(p.pos, q),
      dist: quantise(distance(p.pos, camera), q),
      value: p.value,
    });
  }
  pickups.sort((a, b) => a.dist - b.dist || a.id - b.id);

  const obstacles: ObservedObstacle[] = state.map.obstacles
    .filter((o) => onScreen(h, camera, o.pos))
    .map((o) => ({ pos: qPos(o.pos, q), radius: o.radius, height: o.height }))
    .sort((a, b) => distance(a.pos, camera) - distance(b.pos, camera))
    .slice(0, h.maxNearbyObstacles);

  const projectiles: ObservedProjectile[] = [];
  for (const proj of state.projectiles) {
    if (!onScreen(h, camera, proj.pos)) continue;
    projectiles.push(observeProjectile(proj, camera, h));
  }
  projectiles.sort((a, b) => a.dist - b.dist || a.id - b.id);

  const interactables: ObservedInteractable[] = [];
  for (const i of state.interactables) {
    if (!onScreen(h, camera, i.pos)) continue;
    interactables.push({
      id: i.id,
      kind: i.kind,
      pos: qPos(i.pos, q),
      dist: quantise(distance(i.pos, camera), q),
      used: i.used,
      ...(i.shrineId !== undefined ? { shrineId: i.shrineId } : {}),
    });
  }
  interactables.sort((a, b) => a.dist - b.dist || a.id - b.id);

  const merchantVisible = state.merchant && onScreen(h, camera, state.merchant.pos);
  const merchant = merchantVisible && state.merchant
    ? {
        pos: qPos(state.merchant.pos, q),
        stock: state.merchant.stock.map((entry, index) => ({
          index,
          id: entry.option.id,
          name: entry.option.name,
          kind: entry.option.kind,
          rarity: entry.option.rarity,
          price: entry.price,
          sold: entry.sold,
        })),
      }
    : null;

  const audio = [...audioCounts.entries()]
    .map(([sector, count]) => ({ sector, count }))
    .sort((a, b) => SECTORS.findIndex((s) => s.name === a.sector) - SECTORS.findIndex((s) => s.name === b.sector));

  const p = state.player;
  return {
    tick: state.tick,
    frame: ctx.frame,
    seconds: state.tick / 60,
    phase: state.phase,
    outcome: state.outcome,
    profile: h.profile,
    delayTicks: h.observationDelayTicks,
    player: {
      pos: qPos(p.pos, q),
      hp: p.hp,
      maxHp: p.stats.maxHp,
      level: p.level,
      xp: p.xp,
      xpToNext: xpForLevel(p.level),
      gold: p.gold,
      rerolls: p.rerolls,
      invulnerableTicks: p.invulnerable,
      facing: sectorName(p.facing),
      weapons: p.weapons.map((w) => ({ id: w.id, level: w.level })),
      items: p.items.map((i) => ({ id: i.id, rarity: i.rarity, stacks: i.stacks })),
      buffs: p.buffs.map((b) => observeBuff(b, state.tick)),
      stats: { ...p.stats },
    },
    enemies,
    visibleEnemies,
    pickups: pickups.slice(0, h.maxNearbyPickups),
    projectiles: projectiles.slice(0, h.maxNearbyProjectiles),
    obstacles,
    interactables: interactables.slice(0, h.maxNearbyObstacles),
    merchant,
    offer: state.offer ? observeOffer(state.offer, h, p.rerolls, ctx.offerTicks ?? 0) : null,
    audio,
    map: { halfExtent: state.map.halfExtent },
  };
}

/**
 * FR-27 delay + sampling rate.
 *
 * The buffer is keyed by OBSERVATION FRAME, not by sim tick: an open offer freezes
 * the sim clock (AC-19.2), so a tick-keyed buffer would never let the agent see the
 * offer screen at all. Frames advance once per engine tick, paused or not.
 *
 * AC-27.8: the ring holds exactly `delayTicks + 1` frames, so memory is O(delay)
 * and independent of run length.
 */
export class PerceptionGate {
  private readonly ring: (Observation | undefined)[];
  private frame = -1;
  private cachedFrame = -1;
  private cached: Observation | undefined;

  constructor(
    private readonly h: ResolvedHandicap,
    private readonly content?: ContentBundle,
  ) {
    this.ring = new Array<Observation | undefined>(h.observationDelayTicks + 1);
  }

  /** Number of frames currently retained. */
  get size(): number {
    return this.ring.filter((s) => s !== undefined).length;
  }

  /** Rough retained-bytes estimate, for the AC-27.8 budget test. */
  byteSize(): number {
    let bytes = 0;
    for (const snap of this.ring) {
      if (snap) bytes += Buffer.byteLength(JSON.stringify(snap), 'utf8');
    }
    return bytes;
  }

  /** Called once per engine tick, including ticks spent paused on an offer. */
  record(state: GameState, offerTicks = 0): void {
    this.frame += 1;
    const snap = observeState(state, this.h, {
      frame: this.frame,
      offerTicks,
      ...(this.content ? { content: this.content } : {}),
    });
    this.ring[this.frame % this.ring.length] = snap;
  }

  /**
   * AC-27.1: serve the frame from `frame - delayTicks`.
   * AC-27.2: quantised to the sampling window, so repeat calls inside one window
   * return the byte-identical cached object and nothing is advanced.
   */
  observe(_live: GameState): Observation {
    if (this.frame < 0) throw new Error('PerceptionGate.observe: nothing recorded yet');
    const delayed = Math.max(0, this.frame - this.h.observationDelayTicks);
    const interval = this.h.observationIntervalTicks;
    const window = Math.floor(delayed / interval) * interval;
    const oldest = Math.max(0, this.frame - (this.ring.length - 1));
    const served = Math.max(oldest, window);
    if (served === this.cachedFrame && this.cached) return this.cached;
    const snap = this.ring[served % this.ring.length];
    if (!snap) throw new Error(`PerceptionGate.observe: frame ${served} is no longer retained`);
    this.cachedFrame = served;
    this.cached = snap;
    return snap;
  }
}
