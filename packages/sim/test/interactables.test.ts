import { describe, it, expect } from 'vitest';
import { createRun } from '../src/state.js';
import { step } from '../src/step.js';
import { TICK_MS, TICKS_PER_SECOND } from '../src/rules.js';
import type { GameState, InputFrame } from '../src/types.js';
import type { ContentBundle, RunConfig } from '../src/content-types.js';
import { fixture } from './fixture.js';

/** Fixture with interactables and one shrine buff. */
const withExtras: ContentBundle = {
  ...fixture,
  shrines: {
    haste: {
      id: 'haste', name: 'Shrine of Haste', description: 'Move faster, briefly.',
      cost: 20, durationSeconds: 10,
      mods: [{ stat: 'moveSpeed', kind: 'mult', value: 1.5 }],
    },
    greed: {
      id: 'greed', name: 'Shrine of Greed', description: 'More gold, briefly.',
      cost: 10, durationSeconds: 5, stackable: true,
      mods: [{ stat: 'goldGain', kind: 'mult', value: 1.5 }],
    },
  },
  biomes: {
    testfield: { ...fixture.biomes.testfield!, chestCount: 3, shrineCount: 2 },
  },
};

const config = (over: Partial<RunConfig> = {}): RunConfig => ({
  seed: 2024, characterId: 'tester', biomeId: 'testfield', content: withExtras, ...over,
});

const still: InputFrame = { move: { x: 0, y: 0 } };

/** Teleporting the player is not a sim action, so tests place them by rebuilding state. */
function movePlayerTo(state: GameState, x: number, y: number): GameState {
  return { ...state, player: { ...state.player, pos: { x, y } } };
}

describe('FR-14 chests and shrines', () => {
  it('places the declared number of chests and shrines at run start', () => {
    const state = createRun(config());
    expect(state.interactables.filter((i) => i.kind === 'chest')).toHaveLength(3);
    expect(state.interactables.filter((i) => i.kind === 'shrine')).toHaveLength(2);
  });

  it('places none when the biome declares none, and does not crash', () => {
    const state = createRun({ ...config(), content: fixture });
    expect(state.interactables).toEqual([]);
  });

  it('placement is deterministic for a seed and differs between seeds', () => {
    const a = createRun(config({ seed: 5 })).interactables;
    const b = createRun(config({ seed: 5 })).interactables;
    const c = createRun(config({ seed: 6 })).interactables;
    expect(a).toEqual(b);
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it('opens a curated offer when the player touches a chest, and marks it used', () => {
    let state = createRun(config());
    const chest = state.interactables.find((i) => i.kind === 'chest')!;
    state = movePlayerTo(state, chest.pos.x, chest.pos.y);
    state = step(state, still, TICK_MS, config());
    expect(state.phase).toBe('offer');
    expect(state.offer!.source).toBe('chest');
    expect(state.offer!.options).toHaveLength(3);
    expect(state.interactables.find((i) => i.id === chest.id)!.used).toBe(true);
  });

  it('a used chest never fires again', () => {
    const cfg = config();
    let state = createRun(cfg);
    const chest = state.interactables.find((i) => i.kind === 'chest')!;
    state = movePlayerTo(state, chest.pos.x, chest.pos.y);
    state = step(state, still, TICK_MS, cfg);
    state = step(state, { ...still, chooseIndex: 0 }, TICK_MS, cfg);
    expect(state.phase).toBe('playing');
    for (let i = 0; i < 10; i++) {
      state = movePlayerTo(state, chest.pos.x, chest.pos.y);
      state = step(state, still, TICK_MS, cfg);
    }
    expect(state.phase).toBe('playing');
  });

  it('a chest offer rolls better rarities than a level-up offer at the same Luck', () => {
    // Statistical, so it is asserted over many seeds rather than one.
    const order = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    let chestScore = 0;
    let levelScore = 0;
    for (let seed = 0; seed < 60; seed++) {
      const cfg = config({ seed });
      let state = createRun(cfg);
      const chest = state.interactables.find((i) => i.kind === 'chest')!;
      const chestState = step(movePlayerTo(state, chest.pos.x, chest.pos.y), still, TICK_MS, cfg);
      for (const o of chestState.offer!.options) chestScore += order.indexOf(o.rarity);

      // A level-up offer from the same seed for comparison.
      let s = createRun(cfg);
      let guard = 0;
      while (s.phase !== 'offer' && guard++ < 20000) {
        s = step({ ...s, interactables: [] }, { move: { x: -1, y: 0 } }, TICK_MS, cfg);
      }
      if (s.offer) for (const o of s.offer.options) levelScore += order.indexOf(o.rarity);
    }
    expect(chestScore).toBeGreaterThan(levelScore);
  });

  it('a shrine charges gold and grants its buff', () => {
    const cfg = config();
    let state = createRun(cfg);
    state = { ...state, player: { ...state.player, gold: 100 } };
    const shrine = state.interactables.find((i) => i.kind === 'shrine')!;
    const baseSpeed = state.player.stats.moveSpeed;
    state = movePlayerTo(state, shrine.pos.x, shrine.pos.y);
    state = step(state, still, TICK_MS, cfg);
    expect(state.player.gold).toBeLessThan(100);
    expect(state.player.buffs.length).toBe(1);
    const def = withExtras.shrines![state.player.buffs[0]!.id]!;
    if (def.mods.some((m) => m.stat === 'moveSpeed')) {
      expect(state.player.stats.moveSpeed).toBeGreaterThan(baseSpeed);
    }
  });

  it('a shrine does nothing when the player cannot pay, and is not consumed', () => {
    const cfg = config();
    let state = createRun(cfg);
    const shrine = state.interactables.find((i) => i.kind === 'shrine')!;
    state = movePlayerTo(state, shrine.pos.x, shrine.pos.y);
    const after = step({ ...state, player: { ...state.player, gold: 0 } }, still, TICK_MS, cfg);
    expect(after.player.buffs).toHaveLength(0);
    expect(after.interactables.find((i) => i.id === shrine.id)!.used).toBe(false);
  });

  it('AC-14.1 a buff expires at exactly its declared duration in sim ticks', () => {
    const cfg = config();
    let state = createRun(cfg);
    state = { ...state, player: { ...state.player, gold: 500 }, interactables: state.interactables.filter((i) => i.kind === 'shrine') };
    const shrine = state.interactables[0]!;
    state = movePlayerTo(state, shrine.pos.x, shrine.pos.y);
    state = step(state, still, TICK_MS, cfg);
    const buff = state.player.buffs[0]!;
    const def = withExtras.shrines![buff.id]!;
    const expectedTicks = Math.round(def.durationSeconds * TICKS_PER_SECOND);
    expect(buff.expiresAtTick).toBe(state.tick + expectedTicks);

    // Step to one tick before expiry: still active. One more: gone.
    while (state.tick < buff.expiresAtTick - 1 && state.phase === 'playing') {
      state = step(state, still, TICK_MS, cfg);
    }
    expect(state.player.buffs).toHaveLength(1);
    state = step(state, still, TICK_MS, cfg);
    expect(state.player.buffs).toHaveLength(0);
  });

  it('AC-14.2 re-triggering refreshes duration rather than stacking, unless stackable', () => {
    const cfg = config();
    const base = createRun(cfg);
    const shrineDefs = withExtras.shrines!;

    // Non-stackable: two activations leave one buff with a refreshed expiry.
    const nonStackId = Object.keys(shrineDefs).find((k) => !shrineDefs[k]!.stackable)!;
    let s: GameState = {
      ...base,
      player: { ...base.player, gold: 1000 },
      interactables: [{ id: 900, kind: 'shrine', pos: { x: 0, y: 0 }, used: false, shrineId: nonStackId }],
    };
    s = step(movePlayerTo(s, 0, 0), still, TICK_MS, cfg);
    const firstExpiry = s.player.buffs[0]!.expiresAtTick;
    // Re-arm the same shrine and walk back in later.
    s = { ...s, interactables: [{ id: 901, kind: 'shrine', pos: { x: 0, y: 0 }, used: false, shrineId: nonStackId }] };
    for (let i = 0; i < 30; i++) s = step(movePlayerTo(s, 5, 5), still, TICK_MS, cfg);
    s = step(movePlayerTo(s, 0, 0), still, TICK_MS, cfg);
    expect(s.player.buffs).toHaveLength(1);
    expect(s.player.buffs[0]!.expiresAtTick).toBeGreaterThan(firstExpiry);

    // Stackable: two activations leave two buffs.
    const stackId = Object.keys(shrineDefs).find((k) => shrineDefs[k]!.stackable)!;
    let t: GameState = {
      ...base,
      player: { ...base.player, gold: 1000 },
      interactables: [{ id: 910, kind: 'shrine', pos: { x: 0, y: 0 }, used: false, shrineId: stackId }],
    };
    t = step(movePlayerTo(t, 0, 0), still, TICK_MS, cfg);
    t = { ...t, interactables: [{ id: 911, kind: 'shrine', pos: { x: 0, y: 0 }, used: false, shrineId: stackId }] };
    t = step(movePlayerTo(t, 0, 0), still, TICK_MS, cfg);
    expect(t.player.buffs).toHaveLength(2);
  });

  it('buff modifiers leave the build untouched once they expire', () => {
    const cfg = config();
    let state = createRun(cfg);
    const before = state.player.stats.moveSpeed;
    const shrineId = Object.keys(withExtras.shrines!).find(
      (k) => withExtras.shrines![k]!.mods.some((m) => m.stat === 'moveSpeed'),
    )!;
    state = {
      ...state,
      player: { ...state.player, gold: 1000 },
      interactables: [{ id: 950, kind: 'shrine', pos: { x: 0, y: 0 }, used: false, shrineId }],
    };
    state = step(movePlayerTo(state, 0, 0), still, TICK_MS, cfg);
    expect(state.player.stats.moveSpeed).toBeGreaterThan(before);
    const expiry = state.player.buffs[0]!.expiresAtTick;
    while (state.tick <= expiry && state.phase === 'playing') {
      state = step(state, still, TICK_MS, cfg);
    }
    expect(state.player.buffs).toHaveLength(0);
    expect(state.player.stats.moveSpeed).toBeCloseTo(before, 10);
  });

  it('interactables survive a JSON round-trip and keep stepping identically', () => {
    const cfg = config();
    let state = createRun(cfg);
    for (let i = 0; i < 200; i++) {
      state = step(state, state.phase === 'offer' ? { ...still, chooseIndex: 0 } : { move: { x: 1, y: 0 } }, TICK_MS, cfg);
    }
    const revived: GameState = JSON.parse(JSON.stringify(state));
    expect(revived).toEqual(state);
    expect(JSON.stringify(step(revived, still, TICK_MS, cfg)))
      .toBe(JSON.stringify(step(state, still, TICK_MS, cfg)));
  });
});
