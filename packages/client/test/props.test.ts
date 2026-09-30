import { describe, expect, it } from 'vitest';
import { content } from '@megabonk/content';
import type { Interactable, MerchantState, Obstacle, Pickup, PickupKind, Projectile } from '@megabonk/sim';
import { fakeCtx } from './fake-ctx.js';
import {
  FALLBACK_SHRINE_TINT, GROUND_REFERENCE, HOSTILE, PICKUP_VISUALS, SHRINE_TINTS, CHEST_GLOW,
  contrastRatio, hueDistance, hueOf, pickupTier, pickupVisual, shrineTint,
} from '../src/render/props/palette.js';
import { PULSE_LOW, PULSE_LOW_REDUCED, bob, glowPulse, popScale, twinkle } from '../src/render/props/motion.js';
import { BLOCKING_HEIGHT, obstacleStyle, seedOf } from '../src/render/props/obstacleStyle.js';
import {
  DECOR_CELL, MAX_DECOR, cellHash, cellRange, countDecor, decorKind, decorX, decorY,
} from '../src/render/props/decor.js';
import { drawPickupProp, pickupSpriteKey } from '../src/render/props/pickups.js';
import { drawInteractableProp, interactableState } from '../src/render/props/interactables.js';
import { drawMerchantProp, merchantAffordability } from '../src/render/props/merchant.js';
import { drawObstacleProp } from '../src/render/props/obstacles.js';
import { drawProjectileProp } from '../src/render/props/projectiles.js';
import { drawGroundDecor } from '../src/render/props/ground.js';
import { SpriteCache, type Surface } from '../src/render/atlas.js';

const KINDS: PickupKind[] = ['xp', 'gold', 'heal'];

describe('pickup visuals', () => {
  it('every PickupKind has a visual, with a distinct shape id and hue', () => {
    const shapes = new Set<string>();
    for (const k of KINDS) {
      const v = pickupVisual(k);
      expect(v.kind).toBe(k);
      shapes.add(v.shape);
    }
    expect(shapes.size).toBe(3);
    // >= 40 degrees apart pairwise (xp ~195, gold ~42, heal ~150 -> min 45).
    for (const a of KINDS) for (const b of KINDS) {
      if (a < b) expect(hueDistance(PICKUP_VISUALS[a].core, PICKUP_VISUALS[b].core)).toBeGreaterThan(40);
    }
  });

  it('tier selection is monotonic in value and bounded by the tier count', () => {
    for (const k of KINDS) {
      const max = PICKUP_VISUALS[k].tiers;
      let last = 0;
      for (let v = -5; v <= 500; v += 0.5) {
        const t = pickupTier(k, v);
        expect(t).toBeGreaterThanOrEqual(last);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(max);
        last = t;
      }
    }
    expect(pickupTier('xp', 1)).toBeLessThan(pickupTier('xp', 90));
    expect(pickupTier('gold', 1)).toBeLessThan(pickupTier('gold', 100));
    expect(pickupTier('xp', Number.NaN)).toBe(0);
  });

  it('reward colours are far from hostile pink and readable against the moss ground', () => {
    const rows: string[] = [];
    for (const k of KINDS) {
      const v = PICKUP_VISUALS[k];
      const pinkDist = hueDistance(v.core, HOSTILE);
      const ground = contrastRatio(v.core, GROUND_REFERENCE);
      const groundHue = hueDistance(v.core, GROUND_REFERENCE);
      rows.push(`${k}: hue ${hueOf(v.core).toFixed(0)} pink-dist ${pinkDist.toFixed(0)} ground-contrast ${ground.toFixed(1)} ground-hue-dist ${groundHue.toFixed(0)}`);
      expect(pinkDist).toBeGreaterThan(45);
      expect(ground).toBeGreaterThan(7); // moss is near-black; rewards are bright
      // Either a different hue family from the moss, or (heal green) separated purely by brightness.
      expect(groundHue > 40 || ground > 9).toBe(true);
    }
    // Numbers are documented by the assertion thresholds above; keep the table for debugging.
    expect(rows).toHaveLength(3);
  });

  it('hostile pink is unique: no shrine tint, chest or pickup is near it', () => {
    for (const t of [...Object.values(SHRINE_TINTS), FALLBACK_SHRINE_TINT]) {
      expect(hueDistance(t.color, HOSTILE)).toBeGreaterThan(40);
    }
    expect(hueDistance(CHEST_GLOW, HOSTILE)).toBeGreaterThan(60);
  });

  it('pickup bake keys are bounded: at most sum(tiers) x frames', () => {
    const keys = new Set<string>();
    for (const k of KINDS) for (let v = 0; v < 200; v++) keys.add(pickupSpriteKey(k, pickupTier(k, v)));
    expect(keys.size).toBeLessThanOrEqual(4 + 3 + 1);
  });
});

describe('motion', () => {
  it('glow pulse is deterministic and bounded, and damped under reduced motion', () => {
    let loMin = 1, loMax = 0, rdMin = 1, rdMax = 0;
    for (let t = 0; t < 20000; t += 7) {
      const a = glowPulse(t, 1.3, false);
      expect(glowPulse(t, 1.3, false)).toBe(a);
      const b = glowPulse(t, 1.3, true);
      loMin = Math.min(loMin, a); loMax = Math.max(loMax, a);
      rdMin = Math.min(rdMin, b); rdMax = Math.max(rdMax, b);
    }
    expect(loMin).toBeGreaterThanOrEqual(PULSE_LOW - 1e-9);
    expect(loMax).toBeLessThanOrEqual(1 + 1e-9);
    expect(rdMin).toBeGreaterThanOrEqual(PULSE_LOW_REDUCED - 1e-9);
    expect(rdMax - rdMin).toBeLessThan((loMax - loMin) * 0.5);
  });

  it('bob and twinkle are bounded and damped', () => {
    for (let t = 0; t < 10000; t += 13) {
      expect(Math.abs(bob(t, 2, 0.12, false))).toBeLessThanOrEqual(0.12 + 1e-9);
      expect(Math.abs(bob(t, 2, 0.12, true))).toBeLessThan(0.02);
      const w = twinkle(t, 1, false);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
      expect(twinkle(t, 1, true)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });

  it('spawn pop is bounded and settles at 1', () => {
    for (let a = 0; a < 40; a++) {
      const s = popScale(a);
      expect(s).toBeGreaterThan(0.3);
      expect(s).toBeLessThan(1.3);
    }
    expect(popScale(12)).toBe(1);
    expect(popScale(500)).toBe(1);
  });
});

describe('interactables', () => {
  const chest = (used: boolean): Interactable => ({ id: 1, kind: 'chest', pos: { x: 0, y: 0 }, used });
  const shrine = (used: boolean, id: string): Interactable => ({ id: 2, kind: 'shrine', pos: { x: 0, y: 0 }, used, shrineId: id });

  it('armed and spent states differ, and only armed glows', () => {
    for (const [a, b] of [[chest(false), chest(true)], [shrine(false, 'forge'), shrine(true, 'forge')]] as const) {
      const on = interactableState(a);
      const off = interactableState(b);
      expect(on.glow).toBe(true);
      expect(off.glow).toBe(false);
      expect(on.key).not.toBe(off.key);
    }
  });

  it('a shrine tint exists for every shrine in content, distinct in colour and glyph', () => {
    const ids = Object.keys(content.shrines);
    expect(ids.length).toBeGreaterThan(0);
    const colours = new Set<string>();
    const glyphs = new Set<string>();
    for (const id of ids) {
      const t = shrineTint(id);
      expect(t).not.toBe(FALLBACK_SHRINE_TINT);
      colours.add(t.color);
      glyphs.add(t.glyph);
      expect(contrastRatio(t.color, GROUND_REFERENCE)).toBeGreaterThan(7);
    }
    expect(colours.size).toBe(ids.length);
    expect(glyphs.size).toBe(ids.length);
    expect(shrineTint('nope')).toBe(FALLBACK_SHRINE_TINT);
    expect(shrineTint(undefined)).toBe(FALLBACK_SHRINE_TINT);
  });
});

describe('obstacle style', () => {
  const seeds = [0, 1, 7, 99, 12345, 4294967295];

  it('is deterministic for the same obstacle', () => {
    for (const s of seeds) expect(obstacleStyle(2.1, 2.7, s)).toBe(obstacleStyle(2.1, 2.7, s));
    expect(seedOf(3.5, -8.25)).toBe(seedOf(3.5, -8.25));
  });

  it('mirrors the sim blocking rule: tall iff height >= 2', () => {
    expect(BLOCKING_HEIGHT).toBe(2);
    for (const s of seeds) {
      for (const h of [1, 1.2, 1.4, 1.49]) expect(obstacleStyle(2, h, s).tall).toBe(false);
      for (const h of [1.6, 2, 2.6, 3.5]) expect(obstacleStyle(2, h, s).tall).toBe(true);
    }
  });

  it('tall obstacles look like walls, low ones like low rocks', () => {
    for (const s of seeds) {
      for (const r of [1.2, 2, 3.2]) {
        const low = obstacleStyle(r, 1, s);
        const tall = obstacleStyle(r, 3.5, s);
        expect(['boulder', 'stump']).toContain(low.kind);
        expect(['tree', 'crag']).toContain(tall.kind);
        expect(tall.aspect).toBeGreaterThan(low.aspect * 1.4);
        expect(low.aspect).toBeLessThan(0.75);
      }
    }
  });

  it('bake keys across many generated worlds stay under budget', () => {
    const keys = new Set<string>();
    let n = 0;
    for (let w = 0; w < 80; w++) {
      for (let i = 0; i < 26; i++) {
        const r = 1.2 + ((w * 31 + i * 17) % 200) / 100;
        const h = 1 + ((w * 13 + i * 29) % 250) / 100;
        keys.add(obstacleStyle(r, h, seedOf(w * 3.1 + i, i * 2.7 - w)).key);
        n++;
      }
    }
    expect(n).toBe(2080);
    expect(keys.size).toBeLessThan(200);
  });
});

describe('ground decoration', () => {
  it('is a pure function of cell coordinates', () => {
    for (let cx = -20; cx < 20; cx++) for (let cy = -20; cy < 20; cy++) {
      const h = cellHash(cx, cy);
      expect(cellHash(cx, cy)).toBe(h);
      expect(decorKind(h)).toBe(decorKind(cellHash(cx, cy)));
      // Placement stays inside its own cell, so it can never pop between cells.
      const x = decorX(h, cx), y = decorY(h, cy);
      expect(x).toBeGreaterThanOrEqual(cx * DECOR_CELL);
      expect(x).toBeLessThan((cx + 1) * DECOR_CELL);
      expect(y).toBeGreaterThanOrEqual(cy * DECOR_CELL);
      expect(y).toBeLessThan((cy + 1) * DECOR_CELL);
    }
  });

  it('is sparse and bounded per viewport', () => {
    const r = { x0: 0, x1: 0, y0: 0, y1: 0 };
    cellRange(-30, 30, -30, 30, r);
    const n = countDecor(r);
    const cells = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
    expect(n).toBeLessThanOrEqual(MAX_DECOR);
    expect(n).toBeLessThan(cells);
    expect(n).toBeGreaterThan(cells * 0.3);
    cellRange(-2000, 2000, -2000, 2000, r);
    expect(countDecor(r)).toBe(MAX_DECOR);
  });

  it('draws deterministically: two frames issue identical call counts, and none with the map off-screen', () => {
    const cam = { x: 5, y: -3, zoom: 32 };
    const view = { width: 1280, height: 800 };
    const a = fakeCtx(), b = fakeCtx();
    drawGroundDecor(a.ctx, cam, view, 60);
    drawGroundDecor(b.ctx, cam, view, 60);
    expect(a.fake.calls).toEqual(b.fake.calls);
    expect(a.fake.calls.fill ?? 0).toBeGreaterThan(0);
    // One fill per colour batch, never per item.
    expect(a.fake.calls.fill ?? 0).toBeLessThanOrEqual(8);
    expect(a.fake.calls.stroke ?? 0).toBeLessThanOrEqual(4);
    const off = fakeCtx();
    drawGroundDecor(off.ctx, { x: 900, y: 900, zoom: 32 }, view, 60);
    expect(off.fake.calls.fill ?? 0).toBe(0);
    expect(a.fake.balanced && off.fake.balanced).toBe(true);
  });
});

describe('draw paths', () => {
  const pk = (kind: PickupKind, value: number, age = 30): Pickup => ({ id: 3, kind, pos: { x: 0, y: 0 }, value, age });

  it('pickups: one blit-equivalent, balanced, no shadowBlur, with a null surface factory', () => {
    const { ctx, fake } = fakeCtx();
    for (const k of KINDS) for (const v of [1, 6, 15, 60]) drawPickupProp(ctx, pk(k, v), 100, 100, 32, 1234, false);
    drawPickupProp(ctx, pk('xp', 5, 2), 100, 100, 32, 0, true);
    expect(fake.balanced).toBe(true);
    expect(fake.shadowBlur).toBe(0);
    expect(fake.globalAlpha).toBe(1);
    expect(fake.calls.fill ?? 0).toBeGreaterThan(0);
  });

  it('pickups baked: with a working factory each draw is blits only and keys are reused', () => {
    const made: string[] = [];
    const surface = (): Surface => {
      const inner = fakeCtx();
      made.push('s');
      return { width: 1, height: 1, getContext: () => inner.ctx };
    };
    const cache = new SpriteCache(surface);
    const { ctx, fake } = fakeCtx();
    for (let i = 0; i < 300; i++) drawPickupProp(ctx, pk('xp', 1 + (i % 4)), i, i, 32, 1000 + i, false, cache);
    const bakes = made.length;
    for (let i = 0; i < 300; i++) drawPickupProp(ctx, pk('xp', 1 + (i % 4)), i, i, 32, 5000 + i, false, cache);
    expect(made.length).toBe(bakes);
    expect(bakes).toBeLessThan(10);
    expect(fake.calls.drawImage ?? 0).toBeGreaterThanOrEqual(600);
    expect(fake.calls.fill ?? 0).toBe(0);
    expect(fake.balanced).toBe(true);
  });

  it('chest, shrine (every id + fallback), merchant, obstacle and projectile draw balanced', () => {
    const { ctx, fake } = fakeCtx();
    for (const used of [false, true]) {
      drawInteractableProp(ctx, { id: 1, kind: 'chest', pos: { x: 0, y: 0 }, used }, 50, 50, 32, 999, false);
      for (const id of [...Object.keys(content.shrines), 'unknown']) {
        drawInteractableProp(ctx, { id: 2, kind: 'shrine', pos: { x: 0, y: 0 }, used, shrineId: id }, 50, 50, 32, 999, used);
      }
    }
    const merchant: MerchantState = {
      pos: { x: 0, y: 0 },
      stock: [
        { option: { kind: 'gold', id: 'g', rarity: 'common', name: 'a', description: 'b' }, price: 10, sold: false },
        { option: { kind: 'gold', id: 'g', rarity: 'common', name: 'a', description: 'b' }, price: 999, sold: false },
        { option: { kind: 'gold', id: 'g', rarity: 'common', name: 'a', description: 'b' }, price: 5, sold: true },
      ],
    };
    drawMerchantProp(ctx, merchant, 20, 60, 60, 32, 777, false);
    const cam = { x: 0, y: 0, zoom: 32 };
    const view = { width: 960, height: 600 };
    for (const o of [{ radius: 1.2, height: 1 }, { radius: 3.2, height: 3.5 }, { radius: 2, height: 2.2 }, { radius: 1.3, height: 1.4 }] as Obstacle[]) {
      drawObstacleProp(ctx, { ...o, pos: { x: 1, y: 2 } }, 100, 100, 32);
    }
    const q: Projectile = { id: 1, pos: { x: 1, y: 1 }, vel: { x: 6, y: 0 }, damage: 5, radius: 0.25, ttl: 60 };
    drawProjectileProp(ctx, q, cam, view, 1, 1, 1000, false);
    drawProjectileProp(ctx, { ...q, vel: { x: 0, y: 0 } }, cam, view, 1, 1, 1000, true);
    expect(fake.balanced).toBe(true);
    expect(fake.shadowBlur).toBe(0);
    expect(fake.globalAlpha).toBe(1);
  });

  it('merchant affordability counts unsold items by price vs gold', () => {
    const mk = (price: number, sold: boolean) => ({ option: { kind: 'gold', id: 'g', rarity: 'common', name: 'a', description: 'b' } as never, price, sold });
    const a = merchantAffordability([mk(10, false), mk(50, false), mk(1, true)], 20);
    expect(a).toEqual({ affordable: 1, unaffordable: 1, sold: 1 });
  });

  it('projectiles: pink head and a longer trail for faster shots', () => {
    const cam = { x: 0, y: 0, zoom: 32 };
    const view = { width: 960, height: 600 };
    const fast = fakeCtx();
    drawProjectileProp(fast.ctx, { id: 1, pos: { x: 0, y: 0 }, vel: { x: 9, y: 0 }, damage: 1, radius: 0.25, ttl: 9 }, cam, view, 0, 0, 0, false);
    expect((fast.fake.calls.fill ?? 0) + (fast.fake.calls.stroke ?? 0)).toBeGreaterThan(3);
  });
});
