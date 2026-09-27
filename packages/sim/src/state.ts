/** Run creation and state helpers. */

import { createRng } from './rng.js';
import { resolveBuild, type BuildInput } from './build.js';
import { NO_UNLOCKS, type ContentBundle, type RunConfig } from './content-types.js';
import { TICKS_PER_SECOND } from './rules.js';
import type { GameState, HeldItem, Interactable, Obstacle, RngStreams, Vec2 } from './types.js';
import { nextInt, nextRange } from './rng.js';

export const BASE_WEAPON_SLOTS = 3;

/**
 * Tomes and items both live in player.items — one list keeps serialisation and
 * the HUD simple. They are separated by looking them up in the content bundle,
 * so nothing has to remember which list a pickup belonged to.
 */
export function splitHeld(
  items: readonly HeldItem[],
  content: ContentBundle,
): { items: HeldItem[]; tomes: Record<string, number> } {
  const plain: HeldItem[] = [];
  const tomes: Record<string, number> = {};
  for (const h of items) {
    if (content.tomes[h.id]) tomes[h.id] = h.stacks;
    else plain.push(h);
  }
  return { items: plain, tomes };
}

export function buildInputFor(state: GameState, config: RunConfig): BuildInput {
  const { items, tomes } = splitHeld(state.player.items, config.content);
  return {
    characterId: config.characterId,
    items,
    tomes,
    bonusLuck: config.unlocks?.bonusLuck ?? 0,
    buffs: state.player.buffs,
  };
}

function makeStreams(seed: number): RngStreams {
  return {
    loot: createRng(seed, 'loot'),
    spawn: createRng(seed, 'spawn'),
    crit: createRng(seed, 'crit'),
    upgradeOffer: createRng(seed, 'upgradeOffer'),
    mapgen: createRng(seed, 'mapgen'),
  };
}

/** Scatter obstacles, keeping a clear spawn pocket around the origin. */
function generateObstacles(
  seedState: ReturnType<typeof createRng>,
  count: number,
  halfExtent: number,
): { obstacles: Obstacle[] } {
  let rng = seedState;
  const obstacles: Obstacle[] = [];
  let attempts = 0;
  while (obstacles.length < count && attempts < count * 20) {
    attempts++;
    const rx = nextRange(rng, -halfExtent + 4, halfExtent - 4);
    rng = rx.state;
    const ry = nextRange(rng, -halfExtent + 4, halfExtent - 4);
    rng = ry.state;
    const rr = nextRange(rng, 1.2, 3.2);
    rng = rr.state;
    const rh = nextRange(rng, 1, 3.5);
    rng = rh.state;
    const pos: Vec2 = { x: rx.value, y: ry.value };
    if (Math.hypot(pos.x, pos.y) < 8) continue; // keep the start clear
    const tooClose = obstacles.some(
      (o) => Math.hypot(o.pos.x - pos.x, o.pos.y - pos.y) < o.radius + rr.value + 3,
    );
    if (tooClose) continue;
    obstacles.push({ pos, radius: rr.value, height: rh.value });
  }
  return { obstacles };
}

/**
 * Scatter chests and shrines. Placed once at mapgen rather than spawned over
 * time, so exploring the map has a standing reward and the layout is knowable.
 */
function placeInteractables(
  rngIn: ReturnType<typeof createRng>,
  chestCount: number,
  shrineCount: number,
  shrineIds: readonly string[],
  halfExtent: number,
  obstacles: readonly Obstacle[],
  firstId: number,
): { interactables: Interactable[]; nextId: number } {
  let rng = rngIn;
  const out: Interactable[] = [];
  let nextId = firstId;
  const want = chestCount + (shrineIds.length > 0 ? shrineCount : 0);
  let attempts = 0;

  while (out.length < want && attempts < want * 40) {
    attempts++;
    const rx = nextRange(rng, -halfExtent + 3, halfExtent - 3);
    rng = rx.state;
    const ry = nextRange(rng, -halfExtent + 3, halfExtent - 3);
    rng = ry.state;
    const pos: Vec2 = { x: rx.value, y: ry.value };
    if (Math.hypot(pos.x, pos.y) < 10) continue; // make the player travel for it
    if (obstacles.some((o) => Math.hypot(o.pos.x - pos.x, o.pos.y - pos.y) < o.radius + 2)) continue;
    if (out.some((i) => Math.hypot(i.pos.x - pos.x, i.pos.y - pos.y) < 8)) continue;

    const isChest = out.filter((i) => i.kind === 'chest').length < chestCount;
    if (isChest) {
      out.push({ id: nextId++, kind: 'chest', pos, used: false });
    } else {
      const pick = nextInt(rng, shrineIds.length);
      rng = pick.state;
      out.push({ id: nextId++, kind: 'shrine', pos, used: false, shrineId: shrineIds[pick.value]! });
    }
  }
  return { interactables: out, nextId };
}

export function createRun(config: RunConfig): GameState {
  const { content, seed } = config;
  const biome = content.biomes[config.biomeId];
  if (!biome) throw new Error(`Unknown biome: ${config.biomeId}`);
  const character = content.characters[config.characterId];
  if (!character) throw new Error(`Unknown character: ${config.characterId}`);
  if (!content.weapons[character.startingWeapon]) {
    throw new Error(`Character ${character.id} starts with unknown weapon ${character.startingWeapon}`);
  }

  const unlocks = config.unlocks ?? NO_UNLOCKS;
  const rng = makeStreams(seed);
  const { obstacles } = generateObstacles(rng.mapgen, biome.obstacleCount, biome.halfExtent);

  const shrineIds = Object.keys(content.shrines ?? {}).sort();
  const placed = placeInteractables(
    rng.mapgen,
    biome.chestCount ?? 0,
    biome.shrineCount ?? 0,
    shrineIds,
    biome.halfExtent,
    obstacles,
    1,
  );

  const { stats, modifiers } = resolveBuild(
    { characterId: config.characterId, items: [], tomes: {}, bonusLuck: unlocks.bonusLuck },
    content,
  );

  return {
    tick: 0,
    seed,
    phase: 'playing',
    outcome: null,
    rng,
    player: {
      pos: { x: 0, y: 0 },
      hp: stats.maxHp,
      level: 1,
      xp: 0,
      gold: 0,
      weapons: [{ id: character.startingWeapon, level: 1, cooldown: 0 }],
      items: [],
      rerolls: unlocks.extraRerolls,
      invulnerable: 0,
      facing: { x: 1, y: 0 },
      stats,
      modifiers,
      buffs: [],
    },
    enemies: [],
    pickups: [],
    interactables: placed.interactables,
    map: { halfExtent: biome.halfExtent, obstacles },
    offer: null,
    queuedOffers: 0,
    queuedChestOffers: 0,
    nextId: placed.nextId,
    kills: 0,
    bossKills: 0,
    damageDealt: 0,
    damageTaken: 0,
    goldEarned: 0,
    events: [{ tick: 0, type: 'run_start', data: { seed, biome: biome.id, character: character.id } }],
    merchant: null,
  };
}

export function weaponSlotsFor(config: RunConfig): number {
  return BASE_WEAPON_SLOTS + (config.unlocks?.extraWeaponSlots ?? 0);
}

export function runSeconds(state: GameState): number {
  return state.tick / TICKS_PER_SECOND;
}
