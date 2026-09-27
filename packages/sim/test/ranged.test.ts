import { describe, it, expect } from 'vitest';
import { createRun } from '../src/state.js';
import { step } from '../src/step.js';
import { TICK_MS, TICKS_PER_SECOND } from '../src/rules.js';
import { hasLineOfSight } from '../src/combat.js';
import type { GameState, InputFrame } from '../src/types.js';
import type { ContentBundle, RunConfig } from '../src/content-types.js';
import { fixture } from './fixture.js';

const ranged: ContentBundle = {
  ...fixture,
  enemies: {
    ...fixture.enemies,
    lobber: {
      id: 'lobber', name: 'Lobber', hp: 20, damage: 9, speed: 1.8, radius: 0.5, xp: 4, gold: 2,
      ranged: { range: 12, cooldownTicks: 90, projectileSpeed: 9, standoff: 8 },
    },
  },
  biomes: {
    testfield: {
      ...fixture.biomes.testfield!,
      waves: [{ fromSeconds: 0, spawnRate: 1, enemies: [['lobber', 1]] }],
      bosses: [],
    },
  },
};

const config = (over: Partial<RunConfig> = {}): RunConfig => ({
  seed: 31337, characterId: 'tester', biomeId: 'testfield', content: ranged, ...over,
});

const still: InputFrame = { move: { x: 0, y: 0 } };

/** Place one ranged enemy at a known spot with no other entities in play. */
function soloRanged(cfg: RunConfig, x: number, y: number, over: Record<string, unknown> = {}): GameState {
  const base = createRun(cfg);
  return {
    ...base,
    map: { ...base.map, obstacles: [] },
    player: { ...base.player, pos: { x: 0, y: 0 } },
    enemies: [{
      id: 1, kind: 'lobber', pos: { x, y }, hp: 20, maxHp: 20, speed: 1.8, damage: 9,
      radius: 0.5, xp: 4, gold: 2, isBoss: false, attackCooldown: 0, stagger: 0,
      ...over,
    }],
  };
}

describe('ranged enemies', () => {
  it('fires a projectile when in range with clear line of sight', () => {
    const cfg = config();
    const state = step(soloRanged(cfg, 0, 9), still, TICK_MS, cfg);
    expect(state.projectiles.length).toBe(1);
    expect(state.projectiles[0]!.damage).toBeGreaterThan(0);
  });

  it('does not fire when out of range', () => {
    const cfg = config();
    const state = step(soloRanged(cfg, 0, 30), still, TICK_MS, cfg);
    expect(state.projectiles).toHaveLength(0);
  });

  it('respects its cooldown rather than firing every tick', () => {
    const cfg = config();
    let state = soloRanged(cfg, 0, 9);
    let fired = 0;
    let lastCount = 0;
    for (let i = 0; i < 120; i++) {
      state = step(state, still, TICK_MS, cfg);
      if (state.projectiles.length > lastCount) fired++;
      lastCount = state.projectiles.length;
      // Keep ONLY the original enemy, parked, so this measures one enemy's cadence.
      // Without the filter, background spawning adds more lobbers and the reset
      // below parks them all at firing range — which is what made this test
      // report 5 shots instead of 2.
      state = {
        ...state,
        enemies: state.enemies.filter((e) => e.id === 1).map((e) => ({ ...e, pos: { x: 0, y: 9 } })),
      };
    }
    expect(fired).toBeGreaterThan(0);
    expect(fired).toBeLessThanOrEqual(3); // 120 ticks / 90-tick cooldown
  });

  it('AC-8.1 does not fire when a tall obstacle blocks the line of sight', () => {
    const cfg = config();
    const base = soloRanged(cfg, 0, 9);
    const blocked: GameState = {
      ...base,
      map: { ...base.map, obstacles: [{ pos: { x: 0, y: 4.5 }, radius: 2, height: 3 }] },
    };
    expect(step(blocked, still, TICK_MS, cfg).projectiles).toHaveLength(0);

    // A SHORT obstacle in the same place must not block — height is the point.
    const short: GameState = {
      ...base,
      map: { ...base.map, obstacles: [{ pos: { x: 0, y: 4.5 }, radius: 2, height: 0.5 }] },
    };
    expect(step(short, still, TICK_MS, cfg).projectiles).toHaveLength(1);
  });

  it('hasLineOfSight agrees with the firing decision', () => {
    const map = { halfExtent: 40, obstacles: [{ pos: { x: 0, y: 4.5 }, radius: 2, height: 3 }] };
    expect(hasLineOfSight({ x: 0, y: 9 }, { x: 0, y: 0 }, map)).toBe(false);
    expect(hasLineOfSight({ x: 20, y: 0 }, { x: 0, y: 0 }, map)).toBe(true);
  });

  it('keeps its standoff distance instead of closing to melee', () => {
    const cfg = config();
    let state = soloRanged(cfg, 0, 20);
    for (let i = 0; i < TICKS_PER_SECOND * 20; i++) {
      state = step(state, still, TICK_MS, cfg);
      if (state.enemies.length === 0) break;
    }
    const e = state.enemies[0];
    if (e) {
      expect(Math.hypot(e.pos.x, e.pos.y)).toBeGreaterThan(4);
    }
  });

  it('a projectile damages the player on contact and is consumed', () => {
    const cfg = config();
    let state = soloRanged(cfg, 0, 9);
    const hpBefore = state.player.hp;
    for (let i = 0; i < TICKS_PER_SECOND * 5; i++) {
      state = step(state, still, TICK_MS, cfg);
      if (state.player.hp < hpBefore) break;
    }
    expect(state.player.hp).toBeLessThan(hpBefore);
  });

  it('a projectile is stopped by a tall obstacle rather than passing through', () => {
    const cfg = config();
    const base = soloRanged(cfg, 0, 9);
    let state: GameState = {
      ...base,
      projectiles: [{ id: 500, pos: { x: 0, y: 6 }, vel: { x: 0, y: -9 }, damage: 9, radius: 0.25, ttl: 300 }],
      map: { ...base.map, obstacles: [{ pos: { x: 0, y: 3 }, radius: 1.5, height: 3 }] },
      enemies: [],
    };
    const hpBefore = state.player.hp;
    for (let i = 0; i < 60; i++) state = step(state, still, TICK_MS, cfg);
    expect(state.player.hp).toBe(hpBefore);
    expect(state.projectiles).toHaveLength(0);
  });

  it('projectiles expire rather than accumulating forever', () => {
    const cfg = config();
    const base = soloRanged(cfg, 0, 9);
    let state: GameState = {
      ...base,
      enemies: [],
      projectiles: [{ id: 501, pos: { x: 0, y: 30 }, vel: { x: 0, y: 1 }, damage: 9, radius: 0.25, ttl: 5 }],
    };
    for (let i = 0; i < 10; i++) state = step(state, still, TICK_MS, cfg);
    expect(state.projectiles).toHaveLength(0);
  });

  it('a melee enemy never fires', () => {
    const cfg = config();
    const base = soloRanged(cfg, 0, 9);
    const melee: GameState = {
      ...base,
      enemies: base.enemies.map((e) => ({ ...e, kind: 'grunt' })),
    };
    expect(step(melee, still, TICK_MS, cfg).projectiles).toHaveLength(0);
  });

  it('projectiles survive a JSON round-trip and step identically', () => {
    const cfg = config();
    let state = createRun(cfg);
    for (let i = 0; i < 900; i++) {
      state = step(state, state.phase === 'offer' ? { ...still, chooseIndex: 0 } : { move: { x: 1, y: 0 } }, TICK_MS, cfg);
    }
    const revived: GameState = JSON.parse(JSON.stringify(state));
    expect(revived).toEqual(state);
    expect(JSON.stringify(step(revived, still, TICK_MS, cfg)))
      .toBe(JSON.stringify(step(state, still, TICK_MS, cfg)));
  });

  it('standing still against ranged enemies is NOT safe — positioning must matter', () => {
    const cfg = config({ seed: 4 });
    let state = createRun(cfg);
    for (let i = 0; i < TICKS_PER_SECOND * 90 && state.phase !== 'ended'; i++) {
      state = step(state, state.phase === 'offer' ? { ...still, chooseIndex: 0 } : still, TICK_MS, cfg);
    }
    expect(state.damageTaken).toBeGreaterThan(0);
  });
});
