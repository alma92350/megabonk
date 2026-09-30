/**
 * Tests for the structural hash that the golden-run corpus is built on.
 *
 * The hash is the instrument every other layer-3 test reads, so it gets its own
 * unit tests first: an instrument that silently ignores a field would make the
 * whole golden corpus a no-op.
 */
import { describe, it, expect } from 'vitest';
import { createRun, step, TICK_MS } from '@megabonk/sim';
import { content, makeRunConfig } from '@megabonk/content';
import type { GameState } from '@megabonk/sim';
import {
  canonicalise,
  contentFingerprint,
  hashState,
  hashString,
  HASH_PRECISION,
} from '../src/hash.js';

const cfg = makeRunConfig(4242);

function advance(ticks: number): GameState {
  let s = createRun(cfg);
  for (let i = 0; i < ticks && s.phase !== 'ended'; i++) {
    s = step(s, s.phase === 'offer' ? { move: { x: 0, y: 0 }, chooseIndex: 0 } : { move: { x: -1, y: 0 } }, TICK_MS, cfg);
  }
  return s;
}

describe('hashString', () => {
  it('is stable, hex, and fixed-width', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
    expect(hashString('hello')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('separates inputs that differ only in one character', () => {
    expect(hashString('hello')).not.toBe(hashString('hellp'));
    expect(hashString('')).not.toBe(hashString('\u0000'));
  });
});

describe('canonicalise', () => {
  it('sorts object keys recursively so key order cannot change a hash', () => {
    const a = { b: 1, a: { d: 2, c: 3 } };
    const b = { a: { c: 3, d: 2 }, b: 1 };
    expect(canonicalise(a)).toBe(canonicalise(b));
  });

  it('is order-insensitive for id-keyed collections the sim does not order', () => {
    const a = { enemies: [{ id: 2, hp: 1 }, { id: 1, hp: 5 }] };
    const b = { enemies: [{ id: 1, hp: 5 }, { id: 2, hp: 1 }] };
    expect(canonicalise(a)).toBe(canonicalise(b));
  });

  it('is order-SENSITIVE for the event log, which is append-ordered by contract', () => {
    const a = { events: [{ tick: 1, type: 'a' }, { tick: 1, type: 'b' }] };
    const b = { events: [{ tick: 1, type: 'b' }, { tick: 1, type: 'a' }] };
    expect(canonicalise(a)).not.toBe(canonicalise(b));
  });

  it('normalises -0 and quantises floats to HASH_PRECISION decimals', () => {
    expect(canonicalise({ x: -0 })).toBe(canonicalise({ x: 0 }));
    const eps = Math.pow(10, -(HASH_PRECISION + 3));
    expect(canonicalise({ x: 1 })).toBe(canonicalise({ x: 1 + eps }));
    expect(canonicalise({ x: 1 })).not.toBe(canonicalise({ x: 1.01 }));
  });

  it('distinguishes undefined-valued keys from absent keys never being confused with 0', () => {
    expect(canonicalise({ a: 1, b: undefined })).toBe(canonicalise({ a: 1 }));
    expect(canonicalise({ a: 1, b: 0 })).not.toBe(canonicalise({ a: 1 }));
  });
});

describe('hashState excludes nothing that matters', () => {
  const base = advance(900);

  const mutations: ReadonlyArray<readonly [string, (s: GameState) => GameState]> = [
    ['tick', (s) => ({ ...s, tick: s.tick + 1 })],
    ['seed', (s) => ({ ...s, seed: s.seed + 1 })],
    ['phase', (s) => ({ ...s, phase: 'ended' })],
    ['outcome', (s) => ({ ...s, outcome: 'died' })],
    ['kills', (s) => ({ ...s, kills: s.kills + 1 })],
    ['bossKills', (s) => ({ ...s, bossKills: s.bossKills + 1 })],
    ['damageDealt', (s) => ({ ...s, damageDealt: s.damageDealt + 1 })],
    ['damageTaken', (s) => ({ ...s, damageTaken: s.damageTaken + 1 })],
    ['goldEarned', (s) => ({ ...s, goldEarned: s.goldEarned + 1 })],
    ['nextId', (s) => ({ ...s, nextId: s.nextId + 1 })],
    ['queuedOffers', (s) => ({ ...s, queuedOffers: s.queuedOffers + 1 })],
    ['rng.loot', (s) => ({ ...s, rng: { ...s.rng, loot: { s: s.rng.loot.s.map((w, i) => (i === 0 ? w ^ 1 : w)) } } })],
    ['rng.crit', (s) => ({ ...s, rng: { ...s.rng, crit: { s: s.rng.crit.s.map((w, i) => (i === 3 ? w ^ 1 : w)) } } })],
    ['player.hp', (s) => ({ ...s, player: { ...s.player, hp: s.player.hp - 1 } })],
    ['player.pos', (s) => ({ ...s, player: { ...s.player, pos: { x: s.player.pos.x + 1, y: s.player.pos.y } } })],
    ['player.gold', (s) => ({ ...s, player: { ...s.player, gold: s.player.gold + 1 } })],
    ['player.level', (s) => ({ ...s, player: { ...s.player, level: s.player.level + 1 } })],
    ['player.xp', (s) => ({ ...s, player: { ...s.player, xp: s.player.xp + 1 } })],
    ['player.stats', (s) => ({ ...s, player: { ...s.player, stats: { ...s.player.stats, might: s.player.stats.might + 1 } } })],
    ['player.weapons', (s) => ({ ...s, player: { ...s.player, weapons: s.player.weapons.map((w) => ({ ...w, level: w.level + 1 })) } })],
    ['player.modifiers', (s) => ({
      ...s,
      player: {
        ...s.player,
        modifiers: [...s.player.modifiers, { id: 'probe', stat: 'might' as const, kind: 'flat' as const, value: 1 }],
      },
    })],
    ['player.facing', (s) => ({ ...s, player: { ...s.player, facing: { x: -s.player.facing.x, y: s.player.facing.y } } })],
    ['player.invulnerable', (s) => ({ ...s, player: { ...s.player, invulnerable: s.player.invulnerable + 1 } })],
    ['player.rerolls', (s) => ({ ...s, player: { ...s.player, rerolls: s.player.rerolls + 1 } })],
    ['enemy hp', (s) => ({ ...s, enemies: s.enemies.map((e, i) => (i === 0 ? { ...e, hp: e.hp - 1 } : e)) })],
    ['enemy pos', (s) => ({ ...s, enemies: s.enemies.map((e, i) => (i === 0 ? { ...e, pos: { x: e.pos.x + 1, y: e.pos.y } } : e)) })],
    ['enemy count', (s) => ({ ...s, enemies: s.enemies.slice(1) })],
    ['pickup list', (s) => ({
      ...s,
      pickups: [...s.pickups, { id: 999999, kind: 'gold' as const, pos: { x: 3, y: 4 }, value: 7, age: 0 }],
    })],
    ['map obstacles', (s) => ({ ...s, map: { ...s.map, obstacles: s.map.obstacles.slice(1) } })],
    ['map halfExtent', (s) => ({ ...s, map: { ...s.map, halfExtent: s.map.halfExtent + 1 } })],
  ];

  it('has a non-trivial state to mutate', () => {
    expect(base.enemies.length).toBeGreaterThan(0);
    expect(base.map.obstacles.length).toBeGreaterThan(0);
  });

  for (const [name, mutate] of mutations) {
    it(`detects a change to ${name}`, () => {
      expect(hashState(mutate(base))).not.toBe(hashState(base));
    });
  }

  it('is invariant under a JSON round-trip (ARCH-1 serialisability)', () => {
    const revived: GameState = JSON.parse(JSON.stringify(base));
    expect(hashState(revived)).toBe(hashState(base));
  });

  it('is invariant under reordering the enemy and pickup arrays', () => {
    const shuffled: GameState = {
      ...base,
      enemies: base.enemies.slice().reverse(),
      pickups: base.pickups.slice().reverse(),
    };
    expect(hashState(shuffled)).toBe(hashState(base));
  });
});

describe('contentFingerprint', () => {
  it('is stable for the same bundle', () => {
    expect(contentFingerprint(content)).toBe(contentFingerprint(content));
    expect(contentFingerprint(content)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes when a balance number changes — this is what makes goldens self-invalidating', () => {
    const grunt = content.enemies.grunt!;
    const retuned = { ...content, enemies: { ...content.enemies, grunt: { ...grunt, hp: grunt.hp + 1 } } };
    expect(contentFingerprint(retuned)).not.toBe(contentFingerprint(content));
  });

  it('ignores the renderer-only biome palette, so an art change does not stale the corpus', () => {
    const verdant = content.biomes.verdant!;
    const repainted = {
      ...content,
      biomes: {
        ...content.biomes,
        verdant: { ...verdant, palette: { ...verdant.palette, ground: '#ff00ff' } },
      },
    };
    expect(contentFingerprint(repainted)).toBe(contentFingerprint(content));
  });

  it('ignores player-facing display strings, which cannot affect the simulation', () => {
    const grunt = content.enemies.grunt!;
    const renamed = { ...content, enemies: { ...content.enemies, grunt: { ...grunt, name: 'Gruntolomew' } } };
    expect(contentFingerprint(renamed)).toBe(contentFingerprint(content));
  });
});


describe('hashState ignores display text, exactly as the content fingerprint does', () => {
  /**
   * Regression. The golden corpus's content fingerprint deliberately strips
   * name/description/palette on the promise that "renaming an item does not"
   * change a run. But offer options carry their display names INSIDE the game
   * state, and the state hash covered them, so the promise was false: renaming
   * five items to remove a borrowed term turned 15 goldens red with no
   * behavioural change (proved by restoring only the names, which made all 29
   * pass). Renaming is cosmetic; the two hashes must agree that it is.
   */
  const withOffer = (name: string, description: string, id = 'fury', rarity = 'rare') => ({
    ...advance(300),
    offer: {
      source: 'level',
      openedTick: 10,
      rerollsUsed: 0,
      options: [{ kind: 'tome', id, rarity, name, description }],
    },
  }) as unknown as GameState;

  it('a renamed offer option hashes identically', () => {
    expect(hashState(withOffer('Tome of Fury', 'Attack faster.'))).toBe(
      hashState(withOffer('Rite of Fury', 'Swing quicker.')),
    );
  });

  it('a renamed merchant item hashes identically', () => {
    const stock = (name: string) => ({
      ...advance(300),
      merchant: {
        pos: { x: 1, y: 2 },
        stock: [{ option: { kind: 'item', id: 'boots', rarity: 'common', name, description: 'x' }, price: 40, sold: false }],
      },
    }) as unknown as GameState;
    expect(hashState(stock('Stompers'))).toBe(hashState(stock('Heavy Boots')));
  });

  it('but a change to what the option IS still changes the hash', () => {
    const base = hashState(withOffer('A', 'd'));
    expect(hashState(withOffer('A', 'd', 'wrath'))).not.toBe(base);
    expect(hashState(withOffer('A', 'd', 'fury', 'epic'))).not.toBe(base);
  });
});
