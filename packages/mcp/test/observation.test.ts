import { describe, it, expect } from 'vitest';
import { createRun } from '@megabonk/sim';
import type { Enemy, GameState } from '@megabonk/sim';
import { resolveHandicap } from '../src/handicap.js';
import { PerceptionGate, hpBucketFor, observeState, sectorName } from '../src/observation.js';
import { allKeys, allPositions, cfg, driveSim, enemyAt, stateWith } from './helpers.js';

const H = resolveHandicap();
const FREE = resolveHandicap({ profile: 'unrestricted' });
const FORBIDDEN = /velocity|intent|nextAttack|aiState|seed|rng/i;

describe('FR-27 perception handicap', () => {
  it('AC-27.1: get_state at tick 1000 serves the snapshot from tick 988', () => {
    const gate = new PerceptionGate(H);
    let last: GameState = stateWith(0, []);
    for (let t = 0; t <= 1000; t++) {
      // An enemy that only exists from tick 995 onwards.
      const enemies: Enemy[] = t >= 995 ? [enemyAt(99, { x: 3, y: 0 })] : [enemyAt(1, { x: 5, y: 0 })];
      last = stateWith(t, enemies);
      gate.record(last);
    }
    const obs = gate.observe(last);
    expect(obs.tick).toBe(988);
    expect(obs.enemies.map((e) => e.id)).toEqual([1]);
    expect(obs.enemies.some((e) => e.id === 99)).toBe(false);
    // And it is exactly what the filter produces for the tick-988 state.
    expect(obs).toEqual(observeState(stateWith(988, [enemyAt(1, { x: 5, y: 0 })]), H, { frame: 988 }));
  });

  it('AC-27.2: two calls inside one 2-tick window return byte-identical payloads', () => {
    const gate = new PerceptionGate(H);
    let s = stateWith(0, []);
    for (let t = 0; t <= 1000; t++) {
      s = stateWith(t, [enemyAt(1, { x: t * 0.01, y: 0 })]);
      gate.record(s);
    }
    const a = gate.observe(s);
    const b = gate.observe(s);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(b).toBe(a); // cached, no recomputation, no cursor movement

    const s1001 = stateWith(1001, [enemyAt(1, { x: 10.01, y: 0 })]);
    gate.record(s1001);
    const c = gate.observe(s1001);
    expect(JSON.stringify(c)).toBe(JSON.stringify(a)); // same 2-tick window

    const s1002 = stateWith(1002, [enemyAt(1, { x: 10.02, y: 0 })]);
    gate.record(s1002);
    expect(gate.observe(s1002).tick).toBe(990);
  });

  it('AC-27.3: an off-screen enemy is absent even when inside weapon range', () => {
    const tight = resolveHandicap({ overrides: { viewportWidth: 4, viewportHeight: 4 } });
    const s = stateWith(0, [enemyAt(1, { x: 2.5, y: 0 }), enemyAt(2, { x: 1, y: 0 })]);
    const obs = observeState(s, tight, { frame: 0 });
    // half-width 2 + 10% margin = 2.2 world units
    expect(obs.enemies.map((e) => e.id)).toEqual([2]);
    // Default viewport: far enemies are gone too.
    const wide = observeState(stateWith(0, [enemyAt(1, { x: 30, y: 0 })]), H, { frame: 0 });
    expect(wide.enemies).toEqual([]);
    // Unrestricted sees them all.
    expect(observeState(stateWith(0, [enemyAt(1, { x: 30, y: 0 })]), FREE, { frame: 0 }).enemies)
      .toHaveLength(1);
  });

  it('AC-27.3: off-screen enemies collapse to a coarse 8-sector audio hint with no distance', () => {
    const s = stateWith(0, [enemyAt(1, { x: 40, y: 0 }), enemyAt(2, { x: 45, y: 1 })]);
    const obs = observeState(s, H, { frame: 0 });
    expect(obs.enemies).toEqual([]);
    expect(obs.audio).toEqual([{ sector: 'E', count: 2 }]);
    expect(JSON.stringify(obs.audio)).not.toMatch(/dist/i);
    expect(sectorName({ x: 1, y: 1 })).toBe('NE');
  });

  it('AC-27.4: a non-boss at 47/100 HP reports hpBucket mid and carries no hp key at all', () => {
    const s = stateWith(0, [enemyAt(1, { x: 2, y: 0 }, { hp: 47, maxHp: 100 })]);
    const e = observeState(s, H, { frame: 0 }).enemies[0]!;
    expect(e.hpBucket).toBe('mid');
    expect('hp' in e).toBe(false);
    expect('maxHp' in e).toBe(false);
    expect(hpBucketFor(100, 100)).toBe('full');
    expect(hpBucketFor(70, 100)).toBe('high');
    expect(hpBucketFor(47, 100)).toBe('mid');
    expect(hpBucketFor(20, 100)).toBe('low');
    expect(hpBucketFor(5, 100)).toBe('critical');
  });

  it('AC-27.5: a boss reports exact hp and maxHp', () => {
    const s = stateWith(0, [enemyAt(1, { x: 2, y: 0 }, { hp: 470.5, maxHp: 1000, isBoss: true })]);
    const e = observeState(s, H, { frame: 0 }).enemies[0]!;
    expect(e.isBoss).toBe(true);
    expect(e.hp).toBe(470.5);
    expect(e.maxHp).toBe(1000);
    expect(e.hpBucket).toBe('mid');
  });

  it('AC-27.6: every reported position is an exact multiple of 0.25', () => {
    const frames = driveSim(cfg(11), 400, () => ({ move: { x: 0.7, y: 0.4 } }));
    for (const f of frames) {
      const obs = observeState(f, H, { frame: f.tick });
      const positions = allPositions(obs);
      expect(positions.length).toBeGreaterThan(0);
      for (const p of positions) {
        expect(Number.isInteger(p.x * 4)).toBe(true);
        expect(Number.isInteger(p.y * 4)).toBe(true);
      }
    }
  });

  it('AC-27.7: no key anywhere in a full recorded run matches the forbidden pattern', () => {
    const frames = driveSim(cfg(7), 2400, () => ({ move: { x: -1, y: 0.3 } }));
    expect(frames.length).toBeGreaterThan(1000);
    const seen = new Set<string>();
    for (const f of frames) {
      for (const k of allKeys(observeState(f, H, { frame: f.tick }))) seen.add(k);
    }
    const offenders = [...seen].filter((k) => FORBIDDEN.test(k));
    expect(offenders).toEqual([]);
    expect(seen.has('enemies')).toBe(true); // the walk really did see the payload
    // The unrestricted payload must not leak them either — it is still an observation, not the state.
    const free = new Set<string>();
    for (const f of frames.slice(0, 200)) {
      for (const k of allKeys(observeState(f, FREE, { frame: f.tick }))) free.add(k);
    }
    expect([...free].filter((k) => FORBIDDEN.test(k))).toEqual([]);
  });

  it('AC-24.5: unspawned waves, the RNG streams and the raw offer pool are never present', () => {
    const s = createRun(cfg(3));
    const obs = observeState(s, H, { frame: 0 });
    const json = JSON.stringify(obs);
    expect(json).not.toContain('"rng"');
    expect(json).not.toContain('"seed"');
    expect(json).not.toContain('"waves"');
    expect(json).not.toContain('"nextId"');
    expect(Object.keys(obs)).not.toContain('offerPool');
  });

  it('AC-24.6: the payload stays under 8 KB and 24 enemies with 2000 live entities', () => {
    const swarm: Enemy[] = [];
    for (let i = 0; i < 2000; i++) {
      swarm.push(enemyAt(i + 1, { x: (i % 40) * 0.9 - 18, y: Math.floor(i / 40) * 0.25 - 6 }));
    }
    const obs = observeState(stateWith(500, swarm), H, { frame: 500 });
    expect(obs.enemies.length).toBe(24);
    const bytes = Buffer.byteLength(JSON.stringify(obs), 'utf8');
    expect(bytes).toBeLessThan(8 * 1024);
  });

  it('AC-24.6: the capped enemy list is nearest-first', () => {
    const swarm: Enemy[] = [];
    for (let i = 0; i < 60; i++) swarm.push(enemyAt(i + 1, { x: 0.25 * (60 - i), y: 0 }));
    const obs = observeState(stateWith(10, swarm), H, { frame: 10 });
    const dists = obs.enemies.map((e) => e.dist);
    expect(dists).toEqual([...dists].sort((a, b) => a - b));
    expect(obs.visibleEnemies).toBe(60);
  });

  it('AC-27.8: the delay buffer is capped at delayTicks+1 frames and stays under 4 MB', () => {
    const swarm: Enemy[] = [];
    for (let i = 0; i < 2000; i++) {
      swarm.push(enemyAt(i + 1, { x: (i % 50) * 0.5 - 12, y: Math.floor(i / 50) * 0.3 - 6 }));
    }
    const gate = new PerceptionGate(H);
    for (let t = 0; t < 500; t++) gate.record(stateWith(t, swarm));
    expect(gate.size).toBeLessThanOrEqual(H.observationDelayTicks + 1);
    expect(gate.byteSize()).toBeLessThan(4 * 1024 * 1024);
  });

  it('AC-29.5: advisor-mode perception is the handicapped one — delay and buckets still apply', () => {
    const s = stateWith(0, [enemyAt(1, { x: 1, y: 0 }, { hp: 50, maxHp: 100 })]);
    const free = observeState(s, FREE, { frame: 0 }).enemies[0]!;
    expect(free.hp).toBe(50); // the debug profile does expose it
    const bound = observeState(s, H, { frame: 0 }).enemies[0]!;
    expect('hp' in bound).toBe(false);
  });
});
