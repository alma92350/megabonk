/**
 * ARCH-1: the simulation step.
 *
 *     step(state, inputs, dtMs) -> GameState
 *
 * Pure, deterministic, fixed-timestep, JSON-serialisable in and out, and with no
 * dependency on any renderer. Everything else in this repo is downstream of these
 * four properties, so they are defended by tests rather than by convention.
 *
 * Systems run in a FIXED order every tick. The order is part of the contract:
 * change it and the golden-run corpus changes, which is exactly the signal we
 * want a reviewer to see.
 */

import { nextFloat, nextInt, nextRange, weightedPick, type RngState } from './rng.js';
import { grantXp } from './progression.js';
import { applyMovement, distance, normalise, selectTarget } from './combat.js';
import { resolveStats, BASE_STATS } from './stats.js';
import { activeConditions, collectModifiers } from './build.js';
import { buildOffer } from './offers.js';
import { SpatialGrid } from './spatial.js';
import { buildInputFor, runSeconds, splitHeld, weaponSlotsFor } from './state.js';
import {
  MAX_ENTITIES,
  TICKS_PER_SECOND,
  TICK_MS,
  damageScale,
  hpScale,
  speedScale,
} from './rules.js';
import type { ContentBundle, RunConfig, WavePhase } from './content-types.js';
import type {
  Enemy,
  GameState,
  HeldItem,
  InputFrame,
  MerchantStockEntry,
  OfferOption,
  Pickup,
  PlayerState,
  SimEvent,
  Vec2,
} from './types.js';

const INVULNERABLE_TICKS = 30;
const PICKUP_LIFETIME_TICKS = TICKS_PER_SECOND * 60;
const PLAYER_RADIUS = 0.45;
const ENEMY_ATTACK_COOLDOWN = 36;
const SEPARATION_CELL = 1.5;
const DEATH_FADE_TICKS = 8;

/** A mutable scratch buffer so one tick does not allocate a new array per system. */
interface Mut {
  events: SimEvent[];
  enemies: Enemy[];
  pickups: Pickup[];
  nextId: number;
  kills: number;
  bossKills: number;
  damageDealt: number;
  damageTaken: number;
  goldEarned: number;
  rng: { loot: RngState; spawn: RngState; crit: RngState; upgradeOffer: RngState; mapgen: RngState };
}

function emit(m: Mut, tick: number, type: string, data?: Record<string, unknown>): void {
  m.events.push(data === undefined ? { tick, type } : { tick, type, data });
}

function currentPhase(waves: readonly WavePhase[], seconds: number): WavePhase {
  let chosen = waves[0]!;
  for (const w of waves) if (seconds >= w.fromSeconds) chosen = w;
  return chosen;
}

/** AC-5.1: spawn rate is monotonically non-decreasing over the whole run. */
export function spawnRateAt(waves: readonly WavePhase[], seconds: number): number {
  const phase = currentPhase(waves, seconds);
  // Ramp within the phase as well as between phases, so escalation feels smooth
  // rather than stepping every 90 seconds.
  const ramp = 1 + 0.35 * Math.max(0, seconds - phase.fromSeconds) / 60;
  return phase.spawnRate * ramp;
}

function spawnEnemy(
  m: Mut,
  state: GameState,
  content: ContentBundle,
  enemyId: string,
  seconds: number,
  difficulty: number,
  atDistance: number,
): void {
  if (m.enemies.length >= MAX_ENTITIES) return; // AC-5.3: dropped, not queued.
  const def = content.enemies[enemyId];
  if (!def) throw new Error(`Unknown enemy: ${enemyId}`);

  const angle = nextRange(m.rng.spawn, 0, Math.PI * 2);
  m.rng.spawn = angle.state;
  const jitter = nextRange(m.rng.spawn, 0.85, 1.2);
  m.rng.spawn = jitter.state;

  const r = atDistance * jitter.value;
  const half = state.map.halfExtent;
  const pos: Vec2 = {
    x: Math.max(-half, Math.min(half, state.player.pos.x + Math.cos(angle.value) * r)),
    y: Math.max(-half, Math.min(half, state.player.pos.y + Math.sin(angle.value) * r)),
  };

  const hp = def.hp * hpScale(seconds) * difficulty;
  m.enemies.push({
    id: m.nextId++,
    kind: def.id,
    pos,
    hp,
    maxHp: hp,
    speed: def.speed * speedScale(seconds),
    damage: def.damage * damageScale(seconds) * difficulty,
    radius: def.radius,
    xp: def.xp,
    gold: def.gold,
    isBoss: def.isBoss === true,
    attackCooldown: 0,
    stagger: 0,
  });
}

function runSpawns(m: Mut, state: GameState, config: RunConfig, seconds: number): void {
  const biome = config.content.biomes[config.biomeId]!;
  const difficulty = config.difficulty ?? 1;

  // Bosses: spawn exactly once, on the tick their threshold is crossed.
  for (const boss of biome.bosses) {
    const bossTick = Math.round(boss.atSeconds * TICKS_PER_SECOND);
    if (state.tick + 1 === bossTick) {
      spawnEnemy(m, state, config.content, boss.enemyId, seconds, difficulty, 14);
      emit(m, state.tick + 1, 'boss_spawned', { enemyId: boss.enemyId });
    }
  }

  const phase = currentPhase(biome.waves, seconds);
  const rate = spawnRateAt(biome.waves, seconds);
  // Expected spawns this tick, resolved stochastically so fractional rates work.
  const expected = rate / TICKS_PER_SECOND;
  let count = Math.floor(expected);
  const frac = expected - count;
  const roll = nextFloat(m.rng.spawn);
  m.rng.spawn = roll.state;
  if (roll.value < frac) count++;

  for (let i = 0; i < count; i++) {
    const pick = weightedPick(m.rng.spawn, phase.enemies);
    m.rng.spawn = pick.state;
    spawnEnemy(m, state, config.content, pick.value, seconds, difficulty, 22);
  }
}

function moveEnemies(m: Mut, state: GameState, dtSeconds: number): void {
  const target = state.player.pos;
  const grid = SpatialGrid.build(m.enemies, SEPARATION_CELL);

  for (let i = 0; i < m.enemies.length; i++) {
    const e = m.enemies[i]!;
    if (e.hp <= 0) continue;
    if (e.stagger > 0) {
      m.enemies[i] = { ...e, stagger: e.stagger - 1 };
      continue;
    }

    const toward = normalise({ x: target.x - e.pos.x, y: target.y - e.pos.y });

    // Separation: push apart from crowded neighbours so swarms form a ring
    // rather than a single stacked point. Grid-limited, so it stays O(n·k).
    let sx = 0;
    let sy = 0;
    const neighbours = grid.near(e.pos);
    for (const other of neighbours) {
      if (other.id === e.id || other.hp <= 0) continue;
      const dx = e.pos.x - other.pos.x;
      const dy = e.pos.y - other.pos.y;
      const d = Math.hypot(dx, dy);
      const minD = e.radius + other.radius;
      if (d > 0 && d < minD) {
        const push = (minD - d) / minD;
        sx += (dx / d) * push;
        sy += (dy / d) * push;
      }
    }

    const dir: Vec2 = { x: toward.x + sx * 1.6, y: toward.y + sy * 1.6 };
    const pos = applyMovement(e.pos, dir, e.speed, dtSeconds, state.map, e.radius * 0.5);
    m.enemies[i] = { ...e, pos, attackCooldown: Math.max(0, e.attackCooldown - 1) };
  }
}

function runWeapons(
  m: Mut,
  state: GameState,
  content: ContentBundle,
  player: PlayerState,
): PlayerState {
  const weapons = player.weapons.map((w) => ({ ...w }));
  const might = player.stats.might / BASE_STATS.might;

  for (const w of weapons) {
    const def = content.weapons[w.id];
    if (!def) throw new Error(`Unknown weapon: ${w.id}`);
    if (w.cooldown > 0) {
      w.cooldown -= 1;
      continue;
    }

    const level = w.level - 1;
    const range = def.range * player.stats.area;
    const targets = def.targets + def.targetsPerLevel * level;
    const damage = (def.damage + def.damagePerLevel * level) * might;

    let hits = 0;
    // Re-select per hit so a swing that kills its target rolls onto the next.
    for (let t = 0; t < targets; t++) {
      const victim = selectTarget(player.pos, range, m.enemies);
      if (!victim) break;
      const idx = m.enemies.findIndex((e) => e.id === victim.id);
      if (idx < 0) break;

      const critRoll = nextFloat(m.rng.crit);
      m.rng.crit = critRoll.state;
      const crit = critRoll.value < player.stats.critChance;
      const dealt = crit ? damage * player.stats.critMultiplier : damage;

      const e = m.enemies[idx]!;
      m.enemies[idx] = {
        ...e,
        hp: e.hp - dealt,
        stagger: Math.max(e.stagger, def.knockbackTicks),
      };
      m.damageDealt += dealt;
      hits++;
      if (crit) emit(m, state.tick + 1, 'crit', { weapon: w.id, damage: dealt });
    }

    if (hits > 0) {
      emit(m, state.tick + 1, 'weapon_hit', { weapon: w.id, hits });
    }
    const cooldown = Math.max(
      4,
      Math.round((def.cooldownTicks - def.cooldownReductionPerLevel * level) / player.stats.attackSpeed),
    );
    w.cooldown = cooldown;
  }

  return { ...player, weapons };
}

function reapDead(m: Mut, state: GameState, seconds: number): void {
  const survivors: Enemy[] = [];
  for (const e of m.enemies) {
    if (e.hp > 0) {
      survivors.push(e);
      continue;
    }
    if (e.dyingFor === undefined) {
      m.kills++;
      if (e.isBoss) {
        m.bossKills++;
        emit(m, state.tick + 1, 'boss_killed', { kind: e.kind });
      }
      emit(m, state.tick + 1, 'enemy_killed', { kind: e.kind });

      m.pickups.push({ id: m.nextId++, kind: 'xp', pos: e.pos, value: e.xp, age: 0 });
      const goldRoll = nextFloat(m.rng.loot);
      m.rng.loot = goldRoll.state;
      if (goldRoll.value < (e.isBoss ? 1 : 0.35)) {
        m.pickups.push({
          id: m.nextId++,
          kind: 'gold',
          pos: { x: e.pos.x + 0.3, y: e.pos.y },
          value: Math.max(1, Math.round(e.gold * (1 + seconds / 300))),
          age: 0,
        });
      }
      // Keep the corpse for a few ticks purely so the renderer can fade it out.
      survivors.push({ ...e, dyingFor: DEATH_FADE_TICKS });
    } else if (e.dyingFor > 1) {
      survivors.push({ ...e, dyingFor: e.dyingFor - 1 });
    }
  }
  m.enemies = survivors;
}

interface PickupResult {
  player: PlayerState;
  levelsGained: number;
}

function collectPickups(m: Mut, state: GameState, player: PlayerState): PickupResult {
  const radius = player.stats.pickupRadius;
  const remaining: Pickup[] = [];
  let xpGained = 0;
  let goldGained = 0;
  let healed = 0;

  for (const p of m.pickups) {
    if (p.age > PICKUP_LIFETIME_TICKS) continue;
    const d = distance(p.pos, player.pos);
    if (d <= radius) {
      if (p.kind === 'xp') xpGained += p.value;
      else if (p.kind === 'gold') goldGained += p.value;
      else healed += p.value;
      continue;
    }
    // Magnetise once inside twice the pickup radius, so collection feels generous.
    if (d < radius * 2.5) {
      const dir = normalise({ x: player.pos.x - p.pos.x, y: player.pos.y - p.pos.y });
      remaining.push({
        ...p,
        pos: { x: p.pos.x + dir.x * 0.25, y: p.pos.y + dir.y * 0.25 },
        age: p.age + 1,
      });
    } else {
      remaining.push({ ...p, age: p.age + 1 });
    }
  }
  m.pickups = remaining;

  let next = player;
  if (goldGained > 0) {
    const scaled = Math.round(goldGained * player.stats.goldGain);
    next = { ...next, gold: next.gold + scaled };
    m.goldEarned += scaled;
    emit(m, state.tick + 1, 'gold_gained', { amount: scaled });
  }
  if (healed > 0) {
    next = { ...next, hp: Math.min(next.stats.maxHp, next.hp + healed) };
  }

  let levelsGained = 0;
  if (xpGained > 0) {
    const grant = grantXp(
      { level: next.level, xp: next.xp },
      Math.round(xpGained * player.stats.xpGain),
    );
    levelsGained = grant.levelsGained;
    next = { ...next, level: grant.level, xp: grant.xp };
    if (levelsGained > 0) emit(m, state.tick + 1, 'level_up', { level: grant.level });
  }

  return { player: next, levelsGained };
}

function applyEnemyContact(m: Mut, state: GameState, player: PlayerState): PlayerState {
  if (player.invulnerable > 0) {
    return { ...player, invulnerable: player.invulnerable - 1 };
  }
  let worst = 0;
  for (let i = 0; i < m.enemies.length; i++) {
    const e = m.enemies[i]!;
    if (e.hp <= 0 || e.attackCooldown > 0) continue;
    if (distance(e.pos, player.pos) <= e.radius + PLAYER_RADIUS) {
      worst = Math.max(worst, e.damage);
      m.enemies[i] = { ...e, attackCooldown: ENEMY_ATTACK_COOLDOWN };
    }
  }
  if (worst <= 0) return player;

  // Armour is flat reduction with a floor, so stacking armour never grants immunity.
  const taken = Math.max(1, worst - player.stats.armour);
  m.damageTaken += taken;
  emit(m, state.tick + 1, 'damage_taken', { amount: taken });
  return { ...player, hp: player.hp - taken, invulnerable: INVULNERABLE_TICKS };
}

function refreshStats(player: PlayerState, config: RunConfig, state: GameState): PlayerState {
  const input = buildInputFor({ ...state, player }, config);
  const modifiers = collectModifiers(input, config.content);
  const { items } = splitHeld(player.items, config.content);
  const stats = resolveStats(BASE_STATS, modifiers, activeConditions(items, config.content));
  // Preserve the HP fraction across a maxHp change, so a +maxHp pickup heals
  // proportionally instead of leaving the player at a smaller share of a bigger bar.
  const ratio = player.stats.maxHp > 0 ? player.hp / player.stats.maxHp : 1;
  const hp = Math.min(stats.maxHp, Math.max(1, ratio * stats.maxHp));
  return { ...player, stats, modifiers, hp };
}

function applyOption(
  player: PlayerState,
  option: OfferOption,
  content: ContentBundle,
): PlayerState {
  if (option.kind === 'gold') {
    return { ...player, gold: player.gold + (option.goldAmount ?? 0) };
  }
  if (option.kind === 'weapon') {
    const existing = player.weapons.find((w) => w.id === option.id);
    if (existing) {
      return {
        ...player,
        weapons: player.weapons.map((w) =>
          w.id === option.id ? { ...w, level: w.level + 1 } : w,
        ),
      };
    }
    return { ...player, weapons: [...player.weapons, { id: option.id, level: 1, cooldown: 0 }] };
  }

  // Tomes and items share the held list; stacking merges, keeping the better rarity.
  const order = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const existing = player.items.find((i) => i.id === option.id);
  if (existing) {
    const better =
      order.indexOf(option.rarity) > order.indexOf(existing.rarity) ? option.rarity : existing.rarity;
    return {
      ...player,
      items: player.items.map((i) =>
        i.id === option.id ? { ...i, stacks: i.stacks + 1, rarity: better } : i,
      ),
    };
  }
  const held: HeldItem = { id: option.id, rarity: option.rarity, stacks: 1 };
  void content;
  return { ...player, items: [...player.items, held] };
}

function openOfferIfQueued(
  m: Mut,
  state: GameState,
  config: RunConfig,
  player: PlayerState,
  queued: number,
): { phase: 'playing' | 'offer'; offer: GameState['offer']; queuedOffers: number } {
  if (queued <= 0) return { phase: 'playing', offer: null, queuedOffers: 0 };
  const probe: GameState = { ...state, player };
  const built = buildOffer(probe, config.content, weaponSlotsFor(config), m.rng.upgradeOffer);
  m.rng.upgradeOffer = built.rng;
  emit(m, state.tick + 1, 'offer_presented', { options: built.options.map((o) => o.id) });
  return {
    phase: 'offer',
    offer: { options: built.options, openedTick: state.tick + 1, rerollsUsed: 0 },
    queuedOffers: queued,
  };
}

function maybeSpawnMerchant(state: GameState, config: RunConfig, m: Mut, seconds: number): GameState['merchant'] {
  const biome = config.content.biomes[config.biomeId]!;
  const due = biome.merchantAtSeconds.some(
    (s) => Math.round(s * TICKS_PER_SECOND) === state.tick + 1,
  );
  if (!due) return state.merchant;

  const probe: GameState = state;
  const built = buildOffer(probe, config.content, weaponSlotsFor(config), m.rng.loot);
  m.rng.loot = built.rng;
  const angle = nextFloat(m.rng.loot);
  m.rng.loot = angle.state;
  const a = angle.value * Math.PI * 2;
  const stock: MerchantStockEntry[] = built.options
    .filter((o) => o.kind !== 'gold')
    .map((option, i) => ({ option, price: 40 + 30 * i + 10 * state.player.level, sold: false }));

  emit(m, state.tick + 1, 'merchant_arrived', { items: stock.length });
  return {
    pos: {
      x: Math.max(-state.map.halfExtent + 2, Math.min(state.map.halfExtent - 2, state.player.pos.x + Math.cos(a) * 12)),
      y: Math.max(-state.map.halfExtent + 2, Math.min(state.map.halfExtent - 2, state.player.pos.y + Math.sin(a) * 12)),
    },
    stock,
  };
}

/**
 * Advance the simulation by exactly one fixed tick.
 *
 * While an offer is open the sim is PAUSED (AC-19.2): the tick does not advance
 * and no system runs. Only choose/reroll input is processed. This is what makes
 * the upgrade screen identical for a human and for an agent.
 */
export function step(
  state: GameState,
  input: InputFrame,
  dtMs: number,
  config: RunConfig,
): GameState {
  if (Math.abs(dtMs - TICK_MS) > 1e-6) {
    throw new Error(
      `step: fixed timestep violated — expected ${TICK_MS} ms, got ${dtMs}. ` +
        'Variable dt would destroy determinism (ARCH-1).',
    );
  }
  if (state.phase === 'ended') return { ...state, events: [] };

  const m: Mut = {
    events: [],
    enemies: state.enemies.slice(),
    pickups: state.pickups.slice(),
    nextId: state.nextId,
    kills: state.kills,
    bossKills: state.bossKills,
    damageDealt: state.damageDealt,
    damageTaken: state.damageTaken,
    goldEarned: state.goldEarned,
    rng: { ...state.rng },
  };

  // ---- Offer phase: no time passes. ------------------------------------------
  if (state.phase === 'offer' && state.offer) {
    let player = state.player;
    let offer = state.offer;
    let queued = state.queuedOffers;

    if (input.reroll === true && player.rerolls > 0) {
      const built = buildOffer(state, config.content, weaponSlotsFor(config), m.rng.upgradeOffer);
      m.rng.upgradeOffer = built.rng;
      emit(m, state.tick, 'offer_rerolled', {});
      return {
        ...state,
        rng: m.rng,
        events: m.events,
        player: { ...player, rerolls: player.rerolls - 1 },
        offer: { ...offer, options: built.options, rerollsUsed: offer.rerollsUsed + 1 },
      };
    }

    if (input.chooseIndex === undefined) return { ...state, events: [] };
    const chosen = offer.options[input.chooseIndex];
    if (!chosen) {
      throw new Error(
        `step: chooseIndex ${input.chooseIndex} is out of range for an offer of ${offer.options.length}`,
      );
    }

    player = refreshStats(applyOption(player, chosen, config.content), config, state);
    queued -= 1;
    emit(m, state.tick, 'offer_resolved', { id: chosen.id, kind: chosen.kind, rarity: chosen.rarity });

    const opened = openOfferIfQueued(m, { ...state, tick: state.tick - 1 }, config, player, queued);
    return {
      ...state,
      rng: m.rng,
      events: m.events,
      player,
      phase: opened.phase,
      offer: opened.offer,
      queuedOffers: opened.queuedOffers,
      nextId: m.nextId,
    };
  }

  // ---- Playing phase: fixed system order. -----------------------------------
  const dtSeconds = dtMs / 1000;
  const seconds = runSeconds(state) + dtSeconds;
  const biome = config.content.biomes[config.biomeId]!;

  let player = state.player;

  // 1. Movement (player, then enemies).
  const moveDir = input.move;
  const facing =
    moveDir.x !== 0 || moveDir.y !== 0 ? normalise(moveDir) : player.facing;
  player = {
    ...player,
    pos: applyMovement(player.pos, moveDir, player.stats.moveSpeed, dtSeconds, state.map, PLAYER_RADIUS),
    facing,
  };
  moveEnemies(m, { ...state, player }, dtSeconds);

  // 2. Spawning.
  runSpawns(m, { ...state, player }, config, seconds);

  // 3. Weapons.
  player = runWeapons(m, state, config.content, player);

  // 4. Deaths and drops.
  reapDead(m, state, seconds);

  // 5. Pickups and levelling.
  const collected = collectPickups(m, { ...state, player }, player);
  player = collected.player;

  // 6. Enemy contact damage.
  player = applyEnemyContact(m, { ...state, player }, player);

  // 7. Merchant.
  const merchant = maybeSpawnMerchant({ ...state, player }, config, m, seconds);

  // 8. Purchases.
  let purchasedMerchant = merchant;
  if (input.buyIndex !== undefined && merchant) {
    const entry = merchant.stock[input.buyIndex];
    if (entry && !entry.sold && player.gold >= entry.price) {
      player = refreshStats(applyOption(player, entry.option, config.content), config, state);
      player = { ...player, gold: player.gold - entry.price };
      purchasedMerchant = {
        ...merchant,
        stock: merchant.stock.map((s, i) => (i === input.buyIndex ? { ...s, sold: true } : s)),
      };
      emit(m, state.tick + 1, 'gold_spent', { amount: entry.price, id: entry.option.id });
      emit(m, state.tick + 1, 'item_acquired', { id: entry.option.id, source: 'merchant' });
    }
  }

  // 9. Termination, then offers — a lethal tick ends the run rather than opening
  //    an upgrade screen the player will never see.
  const tick = state.tick + 1;
  if (player.hp <= 0) {
    emit(m, tick, 'run_end', { outcome: 'died', seconds });
    return {
      ...state, tick, phase: 'ended', outcome: 'died', player: { ...player, hp: 0 },
      enemies: m.enemies, pickups: m.pickups, merchant: purchasedMerchant, rng: m.rng,
      nextId: m.nextId, kills: m.kills, bossKills: m.bossKills,
      damageDealt: m.damageDealt, damageTaken: m.damageTaken, goldEarned: m.goldEarned,
      events: m.events, offer: null, queuedOffers: 0,
    };
  }
  if (seconds >= biome.durationSeconds) {
    emit(m, tick, 'run_end', { outcome: 'survived', seconds });
    return {
      ...state, tick, phase: 'ended', outcome: 'survived', player,
      enemies: m.enemies, pickups: m.pickups, merchant: purchasedMerchant, rng: m.rng,
      nextId: m.nextId, kills: m.kills, bossKills: m.bossKills,
      damageDealt: m.damageDealt, damageTaken: m.damageTaken, goldEarned: m.goldEarned,
      events: m.events, offer: null, queuedOffers: 0,
    };
  }

  let phase: GameState['phase'] = 'playing';
  let offer = state.offer;
  let queuedOffers = state.queuedOffers + collected.levelsGained;
  if (collected.levelsGained > 0) {
    player = refreshStats(player, config, state);
    const opened = openOfferIfQueued(m, state, config, player, queuedOffers);
    phase = opened.phase;
    offer = opened.offer;
    queuedOffers = opened.queuedOffers;
  }

  return {
    ...state,
    tick,
    phase,
    offer,
    queuedOffers,
    player,
    enemies: m.enemies,
    pickups: m.pickups,
    merchant: purchasedMerchant,
    rng: m.rng,
    nextId: m.nextId,
    kills: m.kills,
    bossKills: m.bossKills,
    damageDealt: m.damageDealt,
    damageTaken: m.damageTaken,
    goldEarned: m.goldEarned,
    events: m.events,
  };
}

export { nextInt };
