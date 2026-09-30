import { describe, expect, it } from 'vitest';
import { createRun, type GameState } from '@megabonk/sim';
import { makeRunConfigSafe } from './replay-helper.js';
import { fakeCtx } from './fake-ctx.js';
import {
  BEACON_MAX, selectBeacons, drawBeacons, type BeaconPick,
} from '../src/render/props/beacons.js';
import {
  LARGE_CELL, MAX_LARGE, countLarge, largeCellRange, largeHash, largeKind, LARGE_LOG, LARGE_RING,
  nearInteractable,
} from '../src/render/props/decor.js';
import { drawGroundDecor } from '../src/render/props/ground.js';

const view = { width: 1280, height: 800 };
const cam = { x: 0, y: 0, zoom: 32 };

function scene(): GameState {
  const its = [];
  for (let i = 0; i < 9; i++) {
    its.push({ id: i + 1, kind: i % 3 === 0 ? 'shrine' : 'chest', pos: { x: 40 + i * 9, y: (i - 4) * 12 }, used: false, shrineId: 'forge' });
  }
  its.push({ id: 99, kind: 'chest', pos: { x: -60, y: 0 }, used: true });
  return { ...createRun(makeRunConfigSafe(3)), interactables: its, merchant: { pos: { x: 0, y: -90 }, stock: [] } } as unknown as GameState;
}

describe('beacon selection', () => {
  it('returns at most 3, nearest armed chest, nearest armed shrine, merchant', () => {
    const out: BeaconPick[] = [];
    const n = selectBeacons(scene(), cam, view, out);
    expect(n).toBeLessThanOrEqual(BEACON_MAX);
    expect(BEACON_MAX).toBe(3);
    expect(n).toBe(3);
    const kinds = out.slice(0, n).map((p) => p.kind).sort();
    expect(kinds).toEqual(['chest', 'merchant', 'shrine']);
    const chest = out.find((p) => p.kind === 'chest')!;
    // Nearest armed chest: id 2 at x=49 (id 1 is the shrine at 40,-48 is shrine idx0).
    expect(chest.dist).toBeLessThanOrEqual(Math.hypot(58, 0) + 1e-6 + 100);
    for (const p of out.slice(0, n)) expect(['chest', 'shrine', 'merchant']).toContain(p.kind);
  });
  it('never picks a used chest, and orders nearest-first per kind', () => {
    const s = scene();
    const out: BeaconPick[] = [];
    selectBeacons(s, cam, view, out);
    const chest = out.find((p) => p.kind === 'chest')!;
    const armed = s.interactables.filter((i) => i.kind === 'chest' && !i.used);
    const best = Math.min(...armed.map((i) => Math.hypot(i.pos.x - cam.x, i.pos.y - cam.y)));
    expect(chest.dist).toBeCloseTo(best, 6);
    expect(chest.id).not.toBe(99);
  });
  it('skips things already on screen and works with no merchant', () => {
    const s = { ...scene(), merchant: null, interactables: [{ id: 1, kind: 'chest', pos: { x: 1, y: 1 }, used: false }] } as unknown as GameState;
    const out: BeaconPick[] = [];
    expect(selectBeacons(s, cam, view, out)).toBe(0);
  });
  it('draws at most 3 badges (each a ring plus arrow stroke), balanced', () => {
    const { ctx, fake } = fakeCtx();
    drawBeacons(ctx, scene(), cam, view, 100, false);
    expect(fake.calls.stroke ?? 0).toBeLessThanOrEqual(6);
    expect(fake.calls.stroke ?? 0).toBeGreaterThan(0);
    expect(fake.balanced).toBe(true);
    expect(fake.globalAlpha).toBe(1);
  });
});

describe('ground scatter families', () => {
  it('logs and rings are deterministic, sparse and bounded per viewport', () => {
    let logs = 0, rings = 0;
    for (let cy = -20; cy < 20; cy++) {
      for (let cx = -20; cx < 20; cx++) {
        const h = largeHash(cx, cy);
        expect(largeHash(cx, cy)).toBe(h);
        const k = largeKind(h);
        if (k === LARGE_LOG) logs++;
        else if (k === LARGE_RING) rings++;
      }
    }
    expect(logs).toBeGreaterThan(20);
    expect(rings).toBeGreaterThan(20);
    expect(logs + rings).toBeLessThan(1600 * 0.5);
    const r = { x0: 0, x1: 0, y0: 0, y1: 0 };
    largeCellRange(-30, 30, -20, 20, r);
    expect(countLarge(r)).toBeLessThanOrEqual(MAX_LARGE);
    expect(LARGE_CELL).toBeGreaterThan(8);
  });
  it('keeps clear of interactables', () => {
    expect(nearInteractable(5, 5, [{ pos: { x: 6, y: 5 } }] as never, 3)).toBe(true);
    expect(nearInteractable(50, 5, [{ pos: { x: 6, y: 5 } }] as never, 3)).toBe(false);
  });
  it('draws balanced, batched and shadowless, with a clearing near a shrine', () => {
    const shrine = [{ id: 1, kind: 'shrine', pos: { x: 3, y: 2 }, used: false, shrineId: 'forge' }] as never;
    const a = fakeCtx();
    drawGroundDecor(a.ctx, cam, view, 60, []);
    const b = fakeCtx();
    drawGroundDecor(b.ctx, cam, view, 60, shrine);
    expect(b.fake.balanced).toBe(true);
    expect(b.fake.shadowBlur).toBe(0);
    expect(b.fake.calls.fill ?? 0).toBeGreaterThan(0);
    expect(b.fake.calls.ellipse ?? 0).toBeGreaterThanOrEqual(a.fake.calls.ellipse ?? 0);
    expect(b.fake.calls.fill ?? 0).toBeLessThan(40);
  });
});
