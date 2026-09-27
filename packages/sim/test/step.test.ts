import { describe, it, expect } from 'vitest';
import { createRun } from '../src/state.js';
import { step } from '../src/step.js';
import { spawnRateAt } from '../src/step.js';
import { TICK_MS, TICKS_PER_SECOND, MAX_ENTITIES } from '../src/rules.js';
import { summarise } from '../src/summary.js';
import type { GameState, InputFrame, SimEvent } from '../src/types.js';
import type { RunConfig } from '../src/content-types.js';
import { fixture } from './fixture.js';

const config = (over: Partial<RunConfig> = {}): RunConfig => ({
  seed: 1234, characterId: 'tester', biomeId: 'testfield', content: fixture, ...over,
});

const still: InputFrame = { move: { x: 0, y: 0 } };
const west: InputFrame = { move: { x: -1, y: 0 } };

/**
 * Drive the sim to a target SIM TICK, auto-resolving offers by index 0.
 *
 * Note the loop condition: it counts sim ticks, not iterations. An open offer
 * pauses the clock (AC-19.2), so an iteration-counted loop silently falls short
 * of the wall time it looks like it is asking for — which is exactly how the
 * first version of this helper hid a boss that spawns at t=60s.
 */
function drive(
  cfg: RunConfig,
  ticks: number,
  input: (s: GameState, i: number) => InputFrame = () => still,
): { state: GameState; events: SimEvent[] } {
  let state = createRun(cfg);
  const events: SimEvent[] = [...state.events];
  const maxIterations = ticks * 4 + 1000; // offers cost iterations without ticks
  for (let i = 0; state.tick < ticks && state.phase !== 'ended' && i < maxIterations; i++) {
    const frame = state.phase === 'offer' ? { move: { x: 0, y: 0 }, chooseIndex: 0 } : input(state, i);
    state = step(state, frame, TICK_MS, cfg);
    events.push(...state.events);
  }
  return { state, events };
}

describe('ARCH-1 simulation contract', () => {
  it('is pure: step does not mutate the state it is given', () => {
    const cfg = config();
    let state = createRun(cfg);
    for (let i = 0; i < 200; i++) state = step(state, west, TICK_MS, cfg);
    const before = JSON.stringify(state);
    step(state, west, TICK_MS, cfg);
    step(state, west, TICK_MS, cfg);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('is deterministic: identical (state, input, dt) gives deeply equal output', () => {
    const cfg = config();
    let state = createRun(cfg);
    for (let i = 0; i < 300; i++) state = step(state, west, TICK_MS, cfg);
    expect(step(state, west, TICK_MS, cfg)).toEqual(step(state, west, TICK_MS, cfg));
  });

  it('rejects a variable timestep rather than silently drifting', () => {
    const cfg = config();
    const state = createRun(cfg);
    expect(() => step(state, still, 16, cfg)).toThrow(/fixed timestep/);
    expect(() => step(state, still, 33.3, cfg)).toThrow(/fixed timestep/);
    expect(() => step(state, still, TICK_MS, cfg)).not.toThrow();
  });

  it('state is fully JSON-serialisable, and a round-trip steps identically', () => {
    const cfg = config();
    let state = createRun(cfg);
    for (let i = 0; i < 400; i++) {
      state = step(state, state.phase === 'offer' ? { ...still, chooseIndex: 0 } : west, TICK_MS, cfg);
    }
    const revived: GameState = JSON.parse(JSON.stringify(state));
    expect(revived).toEqual(state);
    const a = step(state, west, TICK_MS, cfg);
    const b = step(revived, west, TICK_MS, cfg);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('runs headless with no DOM present', () => {
    expect(typeof globalThis.document).toBe('undefined');
    expect(drive(config(), 600).state.tick).toBeGreaterThan(0);
  });
});

describe('FR-5 waves and escalation', () => {
  it('AC-5.1 spawn rate is monotonically non-decreasing over 0..900s', () => {
    const waves = fixture.biomes.testfield!.waves;
    let prev = -Infinity;
    for (let t = 0; t <= 900; t += 1) {
      const r = spawnRateAt(waves, t);
      expect(r).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = r;
    }
  });

  it('spawns enemies over time', () => {
    const { state } = drive(config(), TICKS_PER_SECOND * 10);
    expect(state.enemies.length).toBeGreaterThan(0);
  });

  it('AC-5.4 a boss spawns at its declared second', () => {
    const { events } = drive(config(), TICKS_PER_SECOND * 61);
    const spawned = events.find((e) => e.type === 'boss_spawned');
    expect(spawned).toBeDefined();
    expect(spawned!.tick).toBe(60 * TICKS_PER_SECOND);
  });

  it('AC-5.3 never exceeds the entity cap even under an extreme spawn rate', () => {
    const swarm: RunConfig = config({
      content: {
        ...fixture,
        biomes: {
          testfield: {
            ...fixture.biomes.testfield!,
            waves: [{ fromSeconds: 0, spawnRate: 20000, enemies: [['grunt', 1]] }],
            bosses: [],
          },
        },
      },
    });
    const { state } = drive(swarm, TICKS_PER_SECOND * 20);
    expect(state.enemies.length).toBeLessThanOrEqual(MAX_ENTITIES);
  });
});

describe('FR-3 offers in a live run', () => {
  it('opens an offer on level-up and pauses the sim (AC-19.2: zero ticks elapse)', () => {
    const cfg = config();
    let state = createRun(cfg);
    for (let i = 0; i < TICKS_PER_SECOND * 60 && state.phase !== 'offer'; i++) {
      state = step(state, still, TICK_MS, cfg);
    }
    expect(state.phase).toBe('offer');
    const tickAtOffer = state.tick;
    const after = step(state, still, TICK_MS, cfg);
    expect(after.tick).toBe(tickAtOffer);
    expect(after.phase).toBe('offer');
  });

  it('AC-3.1 offers exactly 3 distinct options', () => {
    const cfg = config();
    let state = createRun(cfg);
    for (let i = 0; i < TICKS_PER_SECOND * 60 && state.phase !== 'offer'; i++) {
      state = step(state, still, TICK_MS, cfg);
    }
    const ids = state.offer!.options.map((o) => `${o.kind}:${o.id}`);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it('AC-3.3 pads with gold and never throws when the pool is exhausted', () => {
    const bare: RunConfig = config({
      content: { ...fixture, tomes: {}, items: {}, weapons: { bonker: fixture.weapons.bonker! } },
    });
    const { state } = drive(bare, TICKS_PER_SECOND * 90);
    expect(state.phase).not.toBe('offer');
    // With one weapon and no tomes/items, later offers must be gold-padded.
    const { events } = drive(bare, TICKS_PER_SECOND * 90);
    const presented = events.filter((e) => e.type === 'offer_presented');
    expect(presented.length).toBeGreaterThan(0);
    for (const p of presented) expect((p.data!.options as string[]).length).toBe(3);
  });

  it('rejects an out-of-range chooseIndex and mutates nothing (AC-24.3)', () => {
    const cfg = config();
    let state = createRun(cfg);
    for (let i = 0; i < TICKS_PER_SECOND * 60 && state.phase !== 'offer'; i++) {
      state = step(state, still, TICK_MS, cfg);
    }
    const before = JSON.stringify(state);
    expect(() => step(state, { ...still, chooseIndex: 7 }, TICK_MS, cfg)).toThrow(/out of range/);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('resolving an offer applies the pick and resumes play', () => {
    const cfg = config();
    let state = createRun(cfg);
    for (let i = 0; i < TICKS_PER_SECOND * 60 && state.phase !== 'offer'; i++) {
      state = step(state, still, TICK_MS, cfg);
    }
    const chosen = state.offer!.options[0]!;
    const after = step(state, { ...still, chooseIndex: 0 }, TICK_MS, cfg);
    expect(after.phase).toBe('playing');
    const owned =
      after.player.weapons.some((w) => w.id === chosen.id) ||
      after.player.items.some((i) => i.id === chosen.id) ||
      after.player.gold > state.player.gold;
    expect(owned).toBe(true);
  });
});

describe('FR-6 run termination', () => {
  it('AC-6.1 a full run ends as survived at the biome duration and summarises', () => {
    const cfg = config({ characterId: 'bruiser', seed: 99 });
    const { state, events } = drive(cfg, TICKS_PER_SECOND * 130, () => west);
    expect(state.phase).toBe('ended');
    const summary = summarise(events, null);
    expect(['survived', 'died']).toContain(summary.outcome);
    expect(summary.seed).toBe(99);
    expect(summary.kills).toBeGreaterThan(0);
    expect(summary.silverEarned).toBeGreaterThan(0);
  });

  it('a stationary weak run ends in death, and death is terminal', () => {
    // Unkillable AND lethal: raising damage alone is not enough, because the
    // melee arc deletes grunts at the perimeter before they ever make contact.
    // That the first version of this test passed by accident is the point of
    // asserting on outcome rather than merely on hp.
    const glass: RunConfig = config({
      content: {
        ...fixture,
        enemies: {
          ...fixture.enemies,
          grunt: { ...fixture.enemies.grunt!, hp: 1e6, damage: 500, speed: 6 },
        },
      },
    });
    const { state } = drive(glass, TICKS_PER_SECOND * 60);
    expect(state.phase).toBe('ended');
    expect(state.outcome).toBe('died');
    expect(state.player.hp).toBe(0);
    const frozen = step(state, west, TICK_MS, glass);
    expect(frozen.tick).toBe(state.tick);
  });

  it('AC-6.2 the summary is derivable from the event log alone', () => {
    const cfg = config({ seed: 7 });
    const { state, events } = drive(cfg, TICKS_PER_SECOND * 130, () => west);
    const summary = summarise(events);
    expect(summary.kills).toBe(state.kills);
    expect(summary.bossKills).toBe(state.bossKills);
    expect(summary.level).toBe(state.player.level);
    expect(summary.agentProfile).toBeNull();
  });
});

describe('invariants that must hold at every tick', () => {
  it('hp never exceeds maxHp, gold never goes negative, entities stay capped', () => {
    const cfg = config({ seed: 555 });
    let state = createRun(cfg);
    for (let i = 0; i < TICKS_PER_SECOND * 100 && state.phase !== 'ended'; i++) {
      state = step(
        state,
        state.phase === 'offer' ? { ...still, chooseIndex: i % 3 } : { move: { x: Math.sin(i / 40), y: Math.cos(i / 55) } },
        TICK_MS,
        cfg,
      );
      expect(state.player.hp).toBeLessThanOrEqual(state.player.stats.maxHp);
      expect(state.player.gold).toBeGreaterThanOrEqual(0);
      expect(state.enemies.length).toBeLessThanOrEqual(MAX_ENTITIES);
      expect(Number.isFinite(state.player.pos.x)).toBe(true);
      expect(Number.isFinite(state.player.pos.y)).toBe(true);
    }
  });

  it('the player never leaves the map', () => {
    const cfg = config();
    let state = createRun(cfg);
    for (let i = 0; i < 3000; i++) {
      state = step(state, state.phase === 'offer' ? { ...still, chooseIndex: 0 } : { move: { x: 1, y: 1 } }, TICK_MS, cfg);
      expect(Math.abs(state.player.pos.x)).toBeLessThanOrEqual(state.map.halfExtent + 1e-9);
      expect(Math.abs(state.player.pos.y)).toBeLessThanOrEqual(state.map.halfExtent + 1e-9);
    }
  });
});
