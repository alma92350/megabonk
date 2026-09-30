import { describe, expect, it } from 'vitest';
import { content } from '@megabonk/content';
import { createRun, step, TICK_MS, type Enemy, type GameState, type Pickup } from '@megabonk/sim';
import { makeRunConfigSafe } from './replay-helper.js';
import { fakeCtx } from './fake-ctx.js';
import { detectFx, weaponFxKind, type FxSpawn } from '../src/render/fx/detect.js';
import { ParticlePool } from '../src/render/fx/pool.js';
import { FxManager } from '../src/render/fx/manager.js';
import { hash01 } from '../src/render/fx/hash.js';
import type { WorldFrame } from '../src/render/world.js';

const W = content.weapons;

function enemy(id: number, over: Partial<Enemy> = {}): Enemy {
  return {
    id, kind: 'grunt', pos: { x: 2 + id * 0.1, y: 1 }, hp: 20, maxHp: 20, speed: 1, damage: 1,
    radius: 0.5, xp: 1, gold: 1, isBoss: false, attackCooldown: 0, stagger: 0, ...over,
  };
}

function baseState(): GameState {
  return createRun(makeRunConfigSafe(11));
}

function withEnemies(s: GameState, enemies: Enemy[], tick = s.tick + 1): GameState {
  return { ...s, tick, enemies };
}

function withCooldown(s: GameState, cooldown: number): GameState {
  return {
    ...s,
    player: { ...s.player, weapons: s.player.weapons.map((w) => ({ ...w, cooldown })) },
  };
}

const types = (l: readonly FxSpawn[]): string[] => l.map((f) => f.type);

describe('fx detection', () => {
  it('a real hp decrease spawns a hit; healing and new spawns do not', () => {
    const s0 = withEnemies(baseState(), [enemy(1), enemy(2)]);
    const s1 = withEnemies(s0, [enemy(1, { hp: 8 }), enemy(2, { hp: 25 }), enemy(3)]);
    const hits = detectFx(s0, s1, W).filter((f) => f.type === 'hit');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.id).toBe(1);
    expect(hits[0]!.amount).toBe(12);
  });

  it('kill fires exactly once per enemy, when dyingFor first appears', () => {
    const s0 = withEnemies(baseState(), [enemy(1)]);
    const s1 = withEnemies(s0, [enemy(1, { hp: -2, dyingFor: 8 })]);
    const s2 = withEnemies(s1, [enemy(1, { hp: -2, dyingFor: 7 })]);
    expect(detectFx(s0, s1, W).filter((f) => f.type === 'kill')).toHaveLength(1);
    expect(detectFx(s1, s2, W).filter((f) => f.type === 'kill')).toHaveLength(0);
    // an enemy that first appears already dying (never seen alive) is not a kill we can show twice
    expect(detectFx(s0, withEnemies(s0, []), W).filter((f) => f.type === 'kill')).toHaveLength(0);
  });

  it('detects a swing from a cooldown reset and never from a decrement', () => {
    const s0 = withCooldown(baseState(), 0);
    const s1 = withCooldown({ ...s0, tick: s0.tick + 1 }, 20);
    const s2 = withCooldown({ ...s1, tick: s1.tick + 1 }, 19);
    expect(types(detectFx(s0, s1, W))).toContain('swing');
    expect(types(detectFx(s1, s2, W))).not.toContain('swing');
  });

  it('maps WeaponDef.kind to an effect kind', () => {
    expect(weaponFxKind('melee')).toBe('smear');
    expect(weaponFxKind('projectile')).toBe('streak');
    expect(weaponFxKind('orbital')).toBe('orbit');
    expect(weaponFxKind('weird')).toBe('smear');
    const s0 = withCooldown(baseState(), 0);
    const swing = detectFx(s0, withCooldown({ ...s0, tick: s0.tick + 1 }, 9), W).find((f) => f.type === 'swing');
    expect(swing?.weaponKind).toBe(weaponFxKind(W[s0.player.weapons[0]!.id]!.kind));
  });

  it('collects a pickup that vanished near the player, ignores an expiry far away', () => {
    const s0 = baseState();
    const near: Pickup = { id: 50, kind: 'xp', pos: { x: s0.player.pos.x + 1, y: s0.player.pos.y }, value: 1, age: 3 };
    const far: Pickup = { id: 51, kind: 'gold', pos: { x: s0.player.pos.x + 40, y: s0.player.pos.y }, value: 1, age: 3 };
    const a = { ...s0, pickups: [near, far] };
    const b = { ...s0, tick: s0.tick + 1, pickups: [] };
    const c = detectFx(a, b, W).filter((f) => f.type === 'collect');
    expect(c).toHaveLength(1);
    expect(c[0]!.id).toBe(50);
  });

  it('a pickup that moved is flying (magnet trail)', () => {
    const s0 = baseState();
    const p: Pickup = { id: 60, kind: 'xp', pos: { x: s0.player.pos.x + 4, y: s0.player.pos.y }, value: 1, age: 3 };
    let flying = 0;
    for (let t = 0; t < 4; t++) {
      const a = { ...s0, tick: t, pickups: [p] };
      const b = { ...s0, tick: t + 1, pickups: [{ ...p, pos: { x: p.pos.x - 0.25, y: p.pos.y } }] };
      flying += detectFx(a, b, W).filter((f) => f.type === 'fly').length;
    }
    expect(flying).toBeGreaterThan(0);
  });

  it('is a pure function of (before, after)', () => {
    const s0 = withEnemies(withCooldown(baseState(), 0), [enemy(1), enemy(2)]);
    const s1 = withEnemies(withCooldown(s0, 12), [enemy(1, { hp: 3 }), enemy(2, { hp: -1, dyingFor: 8 })]);
    expect(detectFx(s0, s1, W)).toEqual(detectFx(s0, s1, W));
  });

  it('hash01 is stable and in [0,1)', () => {
    expect(hash01(1, 2, 3)).toBe(hash01(1, 2, 3));
    expect(hash01(1, 2, 3)).not.toBe(hash01(1, 2, 4));
    for (let i = 0; i < 200; i++) { const v = hash01(i, i * 7, 3); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('particle pool', () => {
  it('never exceeds its cap and reuses slots', () => {
    const pool = new ParticlePool(16);
    let ok = 0;
    for (let i = 0; i < 100; i++) if (pool.spawn(1) >= 0) ok++;
    expect(ok).toBe(16);
    expect(pool.live).toBe(16);
    pool.update(10_000);
    expect(pool.live).toBe(0);
    for (let i = 0; i < 16; i++) expect(pool.spawn(1)).toBeGreaterThanOrEqual(0);
    expect(pool.live).toBe(16);
  });

  it('low priority spawns leave headroom for hits', () => {
    const pool = new ParticlePool(20);
    let low = 0;
    for (let i = 0; i < 40; i++) if (pool.spawn(0) >= 0) low++;
    expect(low).toBeLessThan(20);
    expect(pool.spawn(1)).toBeGreaterThanOrEqual(0);
  });

  it('ageing removes only expired particles', () => {
    const pool = new ParticlePool(8);
    const a = pool.spawn(1); pool.life[a] = 100;
    const b = pool.spawn(1); pool.life[b] = 300;
    pool.update(150);
    expect(pool.live).toBe(1);
    pool.update(200);
    expect(pool.live).toBe(0);
  });
});

function frameFor(s: GameState, prev: GameState | null, reduce = false): WorldFrame {
  return {
    state: s, prev, alpha: 1, cam: { x: s.player.pos.x, y: s.player.pos.y, zoom: 30 },
    view: { width: 960, height: 600 }, palette: undefined as never, content, time: 1000, reduceMotion: reduce,
  };
}

function fightPair(): [GameState, GameState] {
  const s0 = withEnemies(withCooldown(baseState(), 0), [enemy(1), enemy(2), enemy(3, { kind: 'goblin' })]);
  const s1 = withEnemies(withCooldown(s0, 12), [
    enemy(1, { hp: 3 }), enemy(2, { hp: -1, dyingFor: 8 }), enemy(3, { kind: 'goblin', hp: 4 }),
  ]);
  return [s0, s1];
}

describe('FxManager', () => {
  it('same (state, prev) yields identical particle state', () => {
    const [a, b] = fightPair();
    const m1 = new FxManager(); const m2 = new FxManager();
    m1.observe(a, b, W); m2.observe(a, b, W);
    expect(m1.live).toBeGreaterThan(0);
    expect(m1.checksum()).toBe(m2.checksum());
  });

  it('reduced motion spawns fewer particles', () => {
    const [a, b] = fightPair();
    const full = new FxManager(); const calm = new FxManager({ reduceMotion: true });
    full.observe(a, b, W); calm.observe(a, b, W);
    expect(calm.live).toBeLessThan(full.live);
    expect(calm.live).toBeGreaterThan(0);
  });

  it('never exceeds the cap under a flood', () => {
    const m = new FxManager({ capacity: 64 });
    const [a, b] = fightPair();
    for (let i = 0; i < 200; i++) m.observe({ ...a, tick: i }, { ...b, tick: i + 1 }, W);
    expect(m.live).toBeLessThanOrEqual(64);
  });

  it('ageing in wall-clock ms clears every effect', () => {
    const m = new FxManager();
    const [a, b] = fightPair();
    m.observe(a, b, W);
    for (let i = 0; i < 20; i++) m.update(100);
    expect(m.live).toBe(0);
    expect(m.liveNumbers).toBe(0);
  });

  it('draw is balanced, never touches shadowBlur, and works on the fake ctx', () => {
    const m = new FxManager();
    const [a, b] = fightPair();
    m.observe(a, b, W);
    m.update(40);
    const { ctx, fake } = fakeCtx();
    let blur = 0;
    Object.defineProperty(fake, 'shadowBlur', { get: () => 0, set: () => { blur++; } });
    m.draw(ctx, frameFor(b, a));
    expect(fake.balanced).toBe(true);
    expect(blur).toBe(0);
    expect((fake.calls.fill ?? 0) + (fake.calls.stroke ?? 0)).toBeGreaterThan(0);
    // batched: far fewer fills than live particles
    expect((fake.calls.fill ?? 0)).toBeLessThan(m.live + 10);
  });

  it('draws orbital shards for an owned orbital weapon, even with no live particles', () => {
    const s = baseState();
    const halo = { id: 'halo', level: 2, cooldown: 5 };
    const st = { ...s, player: { ...s.player, weapons: [halo] } };
    const m = new FxManager();
    const { ctx, fake } = fakeCtx();
    m.draw(ctx, frameFor(st, st));
    expect(fake.calls.fill ?? 0).toBeGreaterThan(0);
    expect(fake.balanced).toBe(true);
  });

  it('kicks a struck enemy and none when reduced', () => {
    const [a, b] = fightPair();
    const m = new FxManager(); m.observe(a, b, W);
    expect(m.kickFor(1)).toBeGreaterThanOrEqual(0);
    expect(m.kickFor(999)).toBe(-1);
    const r = new FxManager({ reduceMotion: true }); r.observe(a, b, W);
    expect(r.kickFor(1)).toBe(-1);
  });

  it('caps live damage numbers at 12', () => {
    const m = new FxManager();
    const s0 = withEnemies(baseState(), Array.from({ length: 40 }, (_, i) => enemy(i + 1)));
    const s1 = withEnemies(s0, s0.enemies.map((e) => ({ ...e, hp: 5 })));
    m.observe(s0, s1, W);
    expect(m.liveNumbers).toBeLessThanOrEqual(12);
    expect(m.liveNumbers).toBeGreaterThan(0);
  });

  it('replaying the same recorded run yields the same effect sequence', () => {
    const run = (): number[] => {
      const cfg = makeRunConfigSafe(5);
      let s = createRun(cfg);
      const m = new FxManager();
      const sums: number[] = [];
      for (let t = 0; t < 900; t++) {
        const next = step(s, { move: { x: Math.sin(t / 50), y: Math.cos(t / 70) } }, TICK_MS, cfg);
        m.observe(s, next, W);
        if (t % 30 === 0) sums.push(m.checksum());
        if (t % 4 === 0) m.update(16.7);
        s = next;
        if (s.phase === 'offer') s = step(s, { move: { x: 0, y: 0 }, chooseIndex: 0 }, TICK_MS, cfg);
        if (s.phase === 'ended') break;
      }
      return sums;
    };
    const a = run(); const b = run();
    expect(a.length).toBeGreaterThan(5);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBeGreaterThan(1);
  });
});
