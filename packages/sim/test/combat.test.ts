import { describe, it, expect } from 'vitest';
import { selectTarget, applyMovement, snapTo8, distance } from '../src/combat.js';
import type { Enemy, MapState, Vec2 } from '../src/types.js';

const enemy = (id: number, x: number, y: number, hp = 10): Enemy => ({
  id, kind: 'grunt', pos: { x, y }, hp, maxHp: 10, speed: 1, damage: 1,
  radius: 0.5, xp: 1, gold: 1, isBoss: false, attackCooldown: 0, stagger: 0,
});

const origin: Vec2 = { x: 0, y: 0 };
const emptyMap: MapState = { halfExtent: 100, obstacles: [] };

describe('FR-1 auto-attack targeting', () => {
  it('picks the nearest enemy in range', () => {
    const t = selectTarget(origin, 10, [enemy(1, 5, 0), enemy(2, 2, 0), enemy(3, 8, 0)]);
    expect(t?.id).toBe(2);
  });

  it('AC-1.1 breaks ties by ascending entity id, not iteration order', () => {
    const enemies = [enemy(12, 3, 0), enemy(7, 0, 3)];
    expect(selectTarget(origin, 10, enemies)?.id).toBe(7);
    // Reversing the array must not change the answer.
    expect(selectTarget(origin, 10, enemies.slice().reverse())?.id).toBe(7);
  });

  it('AC-1.2 an enemy at exactly weapon range is valid; just beyond is not', () => {
    expect(selectTarget(origin, 5, [enemy(1, 5, 0)])?.id).toBe(1);
    expect(selectTarget(origin, 5, [enemy(1, 5.001, 0)])).toBeNull();
  });

  it('AC-1.3 never targets a dead enemy, even on the tick it died', () => {
    expect(selectTarget(origin, 10, [enemy(1, 1, 0, 0)])).toBeNull();
    expect(selectTarget(origin, 10, [enemy(1, 1, 0, -5)])).toBeNull();
    expect(selectTarget(origin, 10, [enemy(1, 1, 0, 0), enemy(2, 9, 0, 10)])?.id).toBe(2);
  });

  it('returns null when there are no enemies at all', () => {
    expect(selectTarget(origin, 10, [])).toBeNull();
  });

  it('measures range from the given origin, not from world zero', () => {
    expect(selectTarget({ x: 50, y: 50 }, 3, [enemy(1, 51, 50)])?.id).toBe(1);
    expect(selectTarget({ x: 50, y: 50 }, 3, [enemy(1, 0, 0)])).toBeNull();
  });
});

describe('FR-7 movement', () => {
  const speed = 6;
  const dt = 1 / 60;

  it('AC-7.1 diagonal movement is normalised — same speed as cardinal', () => {
    const diag = applyMovement(origin, { x: 1, y: 1 }, speed, dt, emptyMap);
    const card = applyMovement(origin, { x: 1, y: 0 }, speed, dt, emptyMap);
    expect(distance(origin, diag)).toBeCloseTo(distance(origin, card), 12);
    expect(distance(origin, diag)).toBeCloseTo(speed * dt, 12);
  });

  it('holding a direction for one second displaces exactly speed units', () => {
    let p = origin;
    for (let i = 0; i < 60; i++) p = applyMovement(p, { x: 1, y: 1 }, speed, dt, emptyMap);
    expect(distance(origin, p)).toBeCloseTo(speed, 6);
  });

  it('zero input leaves the position untouched', () => {
    expect(applyMovement(origin, { x: 0, y: 0 }, speed, dt, emptyMap)).toEqual(origin);
  });

  it('AC-7.3 cannot leave the map bounds', () => {
    const map: MapState = { halfExtent: 10, obstacles: [] };
    let p: Vec2 = { x: 9.9, y: 0 };
    for (let i = 0; i < 600; i++) p = applyMovement(p, { x: 1, y: 0 }, speed, dt, map);
    expect(p.x).toBeLessThanOrEqual(10);
    expect(p.x).toBeCloseTo(10, 6);
  });

  it('AC-7.2 slides along an obstacle instead of stopping dead', () => {
    const map: MapState = { halfExtent: 100, obstacles: [{ pos: { x: 2, y: 0 }, radius: 1, height: 1 }] };
    // Push diagonally into the blocker: x should be impeded, y should still progress.
    let p: Vec2 = { x: 0.8, y: -0.3 };
    for (let i = 0; i < 30; i++) p = applyMovement(p, { x: 1, y: -1 }, speed, dt, map);
    expect(p.y).toBeLessThan(-0.3);
    expect(distance(p, { x: 2, y: 0 })).toBeGreaterThanOrEqual(1 - 1e-6);
  });

  it('never tunnels through an obstacle at high speed', () => {
    const map: MapState = { halfExtent: 100, obstacles: [{ pos: { x: 1, y: 0 }, radius: 1, height: 1 }] };
    const p = applyMovement(origin, { x: 1, y: 0 }, 1000, dt, map);
    expect(distance(p, { x: 1, y: 0 })).toBeGreaterThanOrEqual(1 - 1e-6);
  });

  it('is pure — the input position is not mutated', () => {
    const p = { x: 1, y: 2 };
    applyMovement(p, { x: 1, y: 1 }, speed, dt, emptyMap);
    expect(p).toEqual({ x: 1, y: 2 });
  });
});

describe('AC-28.3 snapTo8 (agent actuation handicap)', () => {
  it('snaps an arbitrary heading to one of 8 compass directions', () => {
    const snapped = snapTo8({ x: 0.31, y: 0.95 });
    expect(snapped).toEqual({ x: 0, y: 1 });
  });

  it('snaps a 17 degree heading to due east, so no fine heading is expressible', () => {
    const rad = (17 * Math.PI) / 180;
    expect(snapTo8({ x: Math.cos(rad), y: Math.sin(rad) })).toEqual({ x: 1, y: 0 });
  });

  it('preserves the 8 exact directions unchanged', () => {
    for (const d of [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
      { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
    ]) {
      const s = snapTo8(d);
      expect(Math.sign(s.x)).toBe(Math.sign(d.x));
      expect(Math.sign(s.y)).toBe(Math.sign(d.y));
    }
  });

  it('maps a zero vector to zero rather than an arbitrary direction', () => {
    expect(snapTo8({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});
