/**
 * Build power measurement.
 *
 * "No build dominates" needs a number, and the number has to be measured through
 * the real weapon resolution in `step`, not recomputed from the data table —
 * a recomputation would agree with itself forever while the game diverged.
 *
 * Method: take a live GameState, replace the enemy list with immovable,
 * un-killable dummies at fixed radii, and run a fixed number of ticks with the
 * player standing still. `damageDealt` over that window is the build's DPS.
 *
 * The dummies are injected as data into a JSON-serialisable state, which is
 * legal precisely because ARCH-1 guarantees GameState is plain data.
 */

import { BASE_STATS, TICK_MS, TICKS_PER_SECOND, createRun, resolveStats, step } from '@megabonk/sim';
import type { Enemy, GameState, HeldItem, RunConfig, WeaponInstance } from '@megabonk/sim';
import { activeConditions, collectModifiers } from '@megabonk/sim';
import { makeRunConfig } from '@megabonk/content';

const DUMMY_HP = 1e9;

export interface ArenaOptions {
  /** Inner and outer radius of the dummy ring. */
  readonly innerRadius?: number;
  readonly outerRadius?: number;
  readonly count?: number;
}

/**
 * A pressed crowd: 36 dummies from 1.0 to 3.0 units out. This is what the late
 * game actually looks like, and it is the arena the domination ratio is asserted
 * on. A spread arena (outerRadius 10) additionally rewards range, and is
 * reported rather than asserted.
 */
export function dummyArena(state: GameState, opts: ArenaOptions = {}): GameState {
  const inner = opts.innerRadius ?? 1.0;
  const outer = opts.outerRadius ?? 3.0;
  const count = opts.count ?? 36;
  const enemies: Enemy[] = [];
  for (let i = 0; i < count; i++) {
    // Golden-angle spiral: even angular coverage and even radial coverage with
    // no RNG, so the arena is identical for every build under test.
    const a = i * 2.399963229728653;
    const r = inner + ((outer - inner) * i) / Math.max(1, count - 1);
    enemies.push({
      id: 100000 + i,
      kind: 'dummy',
      pos: { x: state.player.pos.x + Math.cos(a) * r, y: state.player.pos.y + Math.sin(a) * r },
      hp: DUMMY_HP,
      maxHp: DUMMY_HP,
      speed: 0,
      damage: 0,
      radius: 0.3,
      xp: 0,
      gold: 0,
      isBoss: false,
      attackCooldown: 1e6,
      stagger: 0,
    });
  }
  return { ...state, enemies, pickups: [], projectiles: [] };
}

export interface BuildSpec {
  readonly name: string;
  readonly weapons: readonly WeaponInstance[];
  readonly items: readonly HeldItem[];
  readonly characterId?: string;
}

/** Install a build into a state, resolving stats through the real stat pipeline. */
export function withBuild(state: GameState, cfg: RunConfig, spec: BuildSpec): GameState {
  const content = cfg.content;
  const tomes: Record<string, number> = {};
  const plain: HeldItem[] = [];
  for (const h of spec.items) {
    if (content.tomes[h.id]) tomes[h.id] = h.stacks;
    else plain.push(h);
  }
  const modifiers = collectModifiers(
    { characterId: spec.characterId ?? cfg.characterId, items: plain, tomes, bonusLuck: 0 },
    content,
  );
  const stats = resolveStats(BASE_STATS, modifiers, activeConditions(plain, content));
  return {
    ...state,
    player: {
      ...state.player,
      weapons: spec.weapons.map((w) => ({ ...w, cooldown: 0 })),
      items: [...spec.items],
      stats,
      modifiers,
      hp: stats.maxHp,
      invulnerable: 1e6,
      buffs: [],
    },
  };
}

export interface DpsResult {
  readonly name: string;
  readonly dps: number;
  readonly hitsPerSecond: number;
}

/**
 * Measure a build's sustained DPS over `seconds` of game time in the dummy arena.
 * The dummies are re-pinned every tick so the build cannot push them out of range
 * with knockback and then measure a lower number than it would achieve in play.
 */
export function measureDps(
  spec: BuildSpec,
  opts: { readonly seed?: number; readonly seconds?: number; readonly arena?: ArenaOptions } = {},
): DpsResult {
  const seconds = opts.seconds ?? 6;
  const cfg = makeRunConfig(opts.seed ?? 12345, {
    ...(spec.characterId !== undefined ? { characterId: spec.characterId } : {}),
  });
  let state = withBuild(createRun(cfg), cfg, spec);
  const pinned = dummyArena(state, opts.arena);
  state = pinned;

  const ticks = Math.round(seconds * TICKS_PER_SECOND);
  let hits = 0;
  const start = state.damageDealt;
  for (let t = 0; t < ticks; t++) {
    state = step(state, { move: { x: 0, y: 0 } }, TICK_MS, cfg);
    for (const e of state.events) if (e.type === 'weapon_hit') hits += Number(e.data?.hits ?? 0);
    // Re-pin: restore the dummies exactly, keeping only the player's evolution.
    state = { ...state, enemies: pinned.enemies, pickups: [], projectiles: [] };
  }
  return {
    name: spec.name,
    dps: (state.damageDealt - start) / seconds,
    hitsPerSecond: hits / seconds,
  };
}

/** Peak-to-trough ratio across a set of measured builds. */
export function dominationRatio(results: readonly DpsResult[]): number {
  const vals = results.map((r) => r.dps).filter((v) => v > 0);
  if (vals.length < 2) return 1;
  return Math.max(...vals) / Math.min(...vals);
}
