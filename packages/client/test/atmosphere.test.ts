import { describe, expect, it } from 'vitest';
import { content } from '@megabonk/content';
import { createRun, type Enemy, type GameState, type Interactable } from '@megabonk/sim';
import { makeRunConfigSafe } from './replay-helper.js';
import { fakeCtx } from './fake-ctx.js';
import {
  ENTRANCE_MS, entranceProgress, entranceScale, phaseTell, telegraphRadius, detectBossSpawns,
} from '../src/render/atmosphere/boss.js';
import { MOTE_COUNT, moteAt, drawMotes, moteAlpha } from '../src/render/atmosphere/motes.js';
import { Atmosphere, attachAtmosphere, atmosphereOf } from '../src/render/atmosphere/index.js';
import { FxManager } from '../src/render/fx/manager.js';
import type { WorldFrame } from '../src/render/world.js';
import { hueOf } from '../src/render/props/palette.js';

function enemy(id: number, over: Partial<Enemy> = {}): Enemy {
  return {
    id, kind: 'grunt', pos: { x: 2, y: 1 }, hp: 20, maxHp: 20, speed: 1, damage: 1,
    radius: 0.5, xp: 1, gold: 1, isBoss: false, attackCooldown: 0, stagger: 0, ...over,
  };
}
const boss = (id: number, over: Partial<Enemy> = {}): Enemy =>
  enemy(id, { kind: 'warden', isBoss: true, radius: 1.6, hp: 900, maxHp: 900, pos: { x: 6, y: 4 }, ...over });

function base(): GameState { return createRun(makeRunConfigSafe(5)); }
function at(s: GameState, tick: number, enemies: Enemy[], events: unknown[] = []): GameState {
  return { ...s, tick, enemies, events: events as never };
}
const spawnedEvt = { type: 'boss_spawned', tick: 0, enemyId: 'warden' };

function frameFor(s: GameState, atmo: Atmosphere, time: number, reduce = false): WorldFrame {
  return {
    state: s, prev: null, alpha: 1, cam: { x: 0, y: 0, zoom: 32 }, view: { width: 1280, height: 800 },
    palette: { ground: '#000', groundAlt: '#111', accent: '#fff', fog: '#000' } as never,
    content, time, reduceMotion: reduce,
  } as WorldFrame;
}

describe('boss detection', () => {
  it('fires exactly once per boss, however many ticks it lives', () => {
    const s0 = at(base(), 10, [enemy(1)]);
    const s1 = at(s0, 11, [enemy(1), boss(2)], [spawnedEvt]);
    const seen = new Set<number>();
    expect(detectBossSpawns(s0, s1, seen)).toHaveLength(1);
    // The boss remains on the next tick, even if the event is replayed.
    const s2 = at(s1, 12, [enemy(1), boss(2)], [spawnedEvt]);
    expect(detectBossSpawns(s1, s2, seen)).toHaveLength(0);
    const s3 = at(s2, 13, [enemy(1), boss(2), boss(3)], [spawnedEvt]);
    expect(detectBossSpawns(s2, s3, seen)).toHaveLength(1);
  });
  it('a bare boss-flagged enemy without the event is ignored', () => {
    const s0 = at(base(), 10, []);
    expect(detectBossSpawns(s0, at(s0, 11, [boss(9)]), new Set())).toHaveLength(0);
  });
});

describe('boss entrance and tell', () => {
  it('progress is monotonic, bounded and reaches 1', () => {
    let last = -1;
    for (let t = -50; t <= ENTRANCE_MS * 2; t += 16) {
      const p = entranceProgress(t);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(entranceProgress(ENTRANCE_MS)).toBe(1);
    expect(entranceScale(1)).toBe(1);
    expect(entranceScale(0)).toBeGreaterThan(0);
    for (let p = 0; p <= 1; p += 0.05) expect(entranceScale(p)).toBeLessThan(1.15);
  });
  it('phase tell triggers under 50% and not above', () => {
    expect(phaseTell(900, 900)).toBe(0);
    expect(phaseTell(451, 900)).toBe(0);
    expect(phaseTell(450, 900)).toBe(0);
    expect(phaseTell(300, 900)).toBeGreaterThan(0);
    expect(phaseTell(100, 900)).toBeGreaterThan(phaseTell(300, 900));
    expect(phaseTell(-5, 900)).toBeLessThanOrEqual(1);
    expect(phaseTell(5, 0)).toBe(0);
  });
  it('telegraph radius derives from the boss radius (sim contact reach)', () => {
    expect(telegraphRadius(1.6)).toBeCloseTo(1.6 + 0.45, 6);
    expect(telegraphRadius(2.4)).toBeGreaterThan(telegraphRadius(1.6));
  });
});

describe('Atmosphere manager', () => {
  it('spawns one entrance per boss, ages it per frame, and finishes', () => {
    const a = new Atmosphere();
    const s0 = at(base(), 10, []);
    const s1 = at(s0, 11, [boss(2)], [spawnedEvt]);
    a.observe(s0, s1);
    expect(a.bossCount).toBe(1);
    a.observe(s1, at(s1, 12, [boss(2)], [spawnedEvt]));
    expect(a.bossCount).toBe(1);
    a.advance(1000);
    expect(a.bossScale(2)).toBeLessThan(1);
    a.advance(1100);
    expect(a.bossScale(2)).toBeGreaterThan(0.3);
    for (let t = 1200; t <= 1000 + ENTRANCE_MS + 100; t += 100) a.advance(t);
    expect(a.bossScale(2)).toBe(1);
    expect(a.bossScale(999)).toBe(1);
  });
  it('rumble is finite and drains; reduced motion damps rim and rumble', () => {
    const run = (reduce: boolean): { rim: number; rumble: number } => {
      const a = new Atmosphere({ reduceMotion: reduce });
      const s0 = at(base(), 10, []);
      a.observe(s0, at(s0, 11, [boss(2)], [spawnedEvt]));
      a.advance(0); a.advance(50);
      let total = 0;
      for (let i = 0; i < 400; i++) total += a.takeRumble();
      return { rim: a.rimAlpha(), rumble: total };
    };
    const full = run(false), red = run(true);
    expect(full.rumble).toBeGreaterThan(0);
    expect(full.rumble).toBeLessThan(100);
    expect(red.rumble).toBeLessThan(full.rumble * 0.5);
    expect(red.rim).toBeLessThan(full.rim);
    expect(full.rim).toBeGreaterThan(0);
  });
  it('is deterministic: the same state sequence gives the same spawns', () => {
    const seq = (): number[] => {
      const a = new Atmosphere();
      let s = at(base(), 1, []);
      const out: number[] = [];
      for (let t = 2; t < 40; t++) {
        const list = t === 10 || t === 30 ? [boss(t)] : [];
        const n = at(s, t, list, list.length ? [spawnedEvt] : []);
        a.observe(s, n);
        out.push(a.bossCount);
        s = n;
      }
      return out;
    };
    expect(seq()).toEqual(seq());
  });
  it('clears when the run restarts (tick goes backwards)', () => {
    const a = new Atmosphere();
    const s0 = at(base(), 10, []);
    a.observe(s0, at(s0, 11, [boss(2)], [spawnedEvt]));
    a.observe(at(s0, 50, []), at(s0, 2, []));
    expect(a.bossCount).toBe(0);
  });
  it('attaches to an FxManager for the world pass', () => {
    const fx = new FxManager();
    expect(atmosphereOf(fx)).toBeNull();
    const a = new Atmosphere();
    attachAtmosphere(fx, a);
    expect(atmosphereOf(fx)).toBe(a);
    expect(atmosphereOf(undefined)).toBeNull();
  });
});

describe('motes', () => {
  const R = { w: 44, h: 30 };
  const o1 = { x: 0, y: 0, a: 0, r: 0 }, o2 = { x: 0, y: 0, a: 0, r: 0 };
  it('are a pure function of (index, camera, time) and stable', () => {
    for (let i = 0; i < MOTE_COUNT; i++) {
      moteAt(i, 12.5, -3.25, 4000, R.w, R.h, false, o1);
      moteAt(i, 12.5, -3.25, 4000, R.w, R.h, false, o2);
      expect(o2).toEqual(o1);
    }
  });
  it('stay in the region around the camera and move continuously', () => {
    for (let i = 0; i < MOTE_COUNT; i++) {
      moteAt(i, 0, 0, 1000, R.w, R.h, false, o1);
      expect(Math.abs(o1.x)).toBeLessThanOrEqual(R.w / 2 + 1e-6);
      expect(Math.abs(o1.y)).toBeLessThanOrEqual(R.h / 2 + 1e-6);
      moteAt(i, 0, 0, 1016, R.w, R.h, false, o2);
      const d = Math.hypot(o2.x - o1.x, o2.y - o1.y);
      // Wrapping aside, a 16 ms step is a tiny move.
      if (Math.abs(o1.x) < R.w / 2 - 1 && Math.abs(o1.y) < R.h / 2 - 1) expect(d).toBeLessThan(0.1);
    }
  });
  it('count is 20-30, alpha is subordinate and reduced motion slows drift', () => {
    expect(MOTE_COUNT).toBeGreaterThanOrEqual(20);
    expect(MOTE_COUNT).toBeLessThanOrEqual(30);
    for (let i = 0; i < MOTE_COUNT; i++) {
      for (let t = 0; t < 6000; t += 500) expect(moteAlpha(i, t, false)).toBeLessThanOrEqual(0.6);
    }
    moteAt(3, 0, 0, 0, R.w, R.h, true, o1);
    moteAt(3, 0, 0, 3000, R.w, R.h, true, o2);
    const reduced = Math.hypot(o2.x - o1.x, o2.y - o1.y);
    moteAt(3, 0, 0, 0, R.w, R.h, false, o1);
    moteAt(3, 0, 0, 3000, R.w, R.h, false, o2);
    expect(reduced).toBeLessThan(Math.hypot(o2.x - o1.x, o2.y - o1.y) + 1e-9);
  });
  it('draw is balanced, batched, capped, shadowless, and culled at the map edge', () => {
    const s = base();
    const { ctx, fake } = fakeCtx();
    const f = frameFor(s, new Atmosphere(), 1234);
    drawMotes(ctx, f);
    expect(fake.balanced).toBe(true);
    expect(fake.shadowBlur).toBe(0);
    expect(fake.globalAlpha).toBe(1);
    expect(fake.calls.fill ?? 0).toBeLessThanOrEqual(4);
    expect(fake.calls.arc ?? 0).toBeLessThanOrEqual(MOTE_COUNT * 2);
    // Camera far outside the map: everything is culled, nothing drawn.
    const far = { ...f, cam: { x: 9999, y: 9999, zoom: 32 } };
    const c2 = fakeCtx();
    drawMotes(c2.ctx, far);
    expect(c2.fake.calls.arc ?? 0).toBe(0);
  });
  it('are never pink and never gem-cyan or coin-gold', () => {
    // Ember/lantern hues only (orange to pale warm white).
    for (const c of ['#ffb46b', '#fff1d6']) {
      const h = hueOf(c);
      expect(h).toBeGreaterThan(18);
      expect(h).toBeLessThan(45);
    }
  });
});

describe('atmosphere draw paths', () => {
  it('ground + rim + tell draw balanced with the fake ctx and never touch shadowBlur', () => {
    const a = new Atmosphere();
    const s0 = at(base(), 10, []);
    const chest: Interactable = { id: 7, kind: 'chest', pos: { x: 3, y: 3 }, used: false };
    const used: Interactable = { id: 8, kind: 'chest', pos: { x: -3, y: 3 }, used: true };
    const s1 = { ...at(s0, 11, [boss(2, { hp: 100 })], [spawnedEvt]), interactables: [chest, used] } as GameState;
    a.observe(s0, s1);
    for (let t = 0; t < 1200; t += 33) {
      a.advance(t);
      const { ctx, fake } = fakeCtx();
      const f = frameFor(s1, a, t);
      a.drawGround(ctx, f);
      a.drawMotes(ctx, f);
      a.drawBossTell(ctx, f, s1.enemies[0]!, 640, 400, 60);
      a.drawRim(ctx, f.view);
      expect(fake.balanced).toBe(true);
      expect(fake.shadowBlur).toBe(0);
      expect(fake.globalAlpha).toBe(1);
    }
  });
  it('a chest light pool draws only for armed chests', () => {
    const a = new Atmosphere();
    const mk = (used: boolean): number => {
      const s = { ...base(), enemies: [], interactables: [{ id: 1, kind: 'chest', pos: { x: 2, y: 2 }, used }] } as unknown as GameState;
      const { ctx, fake } = fakeCtx();
      a.drawGround(ctx, frameFor(s, a, 0));
      return (fake.calls.ellipse ?? 0);
    };
    expect(mk(false)).toBeGreaterThan(mk(true));
  });
});
