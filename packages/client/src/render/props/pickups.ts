/**
 * Pickups: XP gems, gold coins, heal crosses.
 *
 * Each frame of a pickup is FOUR blits at most (shadow, halo, body, sparkle) of
 * sprites baked once per (kind, tier). Bob, pulse, pop-in, coin wobble and the
 * twinkle are all applied at blit time, so nothing is re-baked and nothing
 * allocates. Bake keys: 4 xp + 3 gold + 1 heal bodies, and the same again for
 * halos, plus one shadow and one spark.
 */

import type { Pickup } from '@megabonk/sim';
import type { Ctx2D } from '../ctx.js';
import { Z_LIFT } from '../projection.js';
import type { SpriteCache } from '../atlas.js';
import { U } from './obstacleStyle.js';
import { bob, glowPulse, popScale, twinkle } from './motion.js';
import { blit, inkStroke, paintGroundDisc, paintHalo, paintSpark, polygon, propCache } from './bake.js';
import { INK, pickupTier, pickupVisual, type PickupVisual } from './palette.js';

const GEM_R = [8, 10.5, 13, 16] as const;
const HALO_R = [26, 32, 40, 52] as const;
/** World-unit float height of a pickup above the ground. */
const FLOAT_Z = 0.55;

export function pickupSpriteKey(kind: string, tier: number): string {
  return `pk:${kind}:${tier}`;
}

function paintGem(ctx: Ctx2D, v: PickupVisual, r: number, bright: boolean): void {
  // Crown + pavilion outline: a classic cut that reads as "gem" in silhouette.
  const pts = [-0.55 * r, -0.95 * r, 0.55 * r, -0.95 * r, r, -0.25 * r, 0, 1.1 * r, -r, -0.25 * r];
  polygon(ctx, pts);
  ctx.fillStyle = v.core;
  ctx.fill();
  // Shadow-side facets.
  polygon(ctx, [r, -0.25 * r, 0, 1.1 * r, 0.3 * r, -0.25 * r]);
  ctx.fillStyle = v.dark;
  ctx.globalAlpha = 0.75;
  ctx.fill();
  polygon(ctx, [0, 1.1 * r, -r, -0.25 * r, -0.3 * r, -0.25 * r]);
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;
  // Table (top face), lit from the upper left.
  polygon(ctx, [-0.55 * r, -0.95 * r, 0.55 * r, -0.95 * r, 0.3 * r, -0.25 * r, -0.3 * r, -0.25 * r]);
  ctx.fillStyle = v.light;
  ctx.globalAlpha = bright ? 0.95 : 0.8;
  ctx.fill();
  ctx.globalAlpha = 1;
  polygon(ctx, [-r, -0.25 * r, -0.55 * r, -0.95 * r, -0.3 * r, -0.25 * r]);
  ctx.fillStyle = v.light;
  ctx.globalAlpha = 0.45;
  ctx.fill();
  ctx.globalAlpha = 1;
  polygon(ctx, pts);
  inkStroke(ctx, 1.7);
  // Facet lines.
  ctx.strokeStyle = v.dark;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-0.3 * r, -0.25 * r);
  ctx.lineTo(0, 1.1 * r);
  ctx.moveTo(0.3 * r, -0.25 * r);
  ctx.lineTo(0, 1.1 * r);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function paintCoin(ctx: Ctx2D, v: PickupVisual, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = v.dark;
  ctx.fill();
  inkStroke(ctx, 1.7);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  ctx.fillStyle = v.core;
  ctx.fill();
  // Rim highlight, upper left.
  ctx.strokeStyle = v.light;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.82, Math.PI * 0.95, Math.PI * 1.6);
  ctx.stroke();
  // Embossed mark: a diamond, the coin's "stamp".
  polygon(ctx, [cx, cy - r * 0.42, cx + r * 0.3, cy, cx, cy + r * 0.42, cx - r * 0.3, cy]);
  ctx.fillStyle = v.dark;
  ctx.fill();
  polygon(ctx, [cx, cy - r * 0.42, cx + r * 0.3, cy, cx - r * 0.3, cy]);
  ctx.fillStyle = v.light;
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function paintCross(ctx: Ctx2D, v: PickupVisual): void {
  // White medic disc with a green cross: the only white-and-green thing in the game.
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fillStyle = '#f2fff7';
  ctx.fill();
  inkStroke(ctx, 1.8);
  const a = 3.6, l = 8.2;
  const cross = [-a, -l, a, -l, a, -a, l, -a, l, a, a, a, a, l, -a, l, -a, a, -l, a, -l, -a, -a, -a];
  polygon(ctx, cross);
  ctx.fillStyle = v.core;
  ctx.fill();
  ctx.strokeStyle = v.dark;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.strokeStyle = INK;
}

function paintBody(ctx: Ctx2D, v: PickupVisual, tier: number): void {
  if (v.shape === 'gem') {
    const r = GEM_R[tier] ?? GEM_R[0];
    if (tier >= 3) {
      ctx.save();
      ctx.translate(-r * 0.95, r * 0.35);
      paintGem(ctx, v, r * 0.5, false);
      ctx.restore();
      ctx.save();
      ctx.translate(r * 0.95, r * 0.45);
      paintGem(ctx, v, r * 0.45, false);
      ctx.restore();
    }
    paintGem(ctx, v, r, tier >= 2);
  } else if (v.shape === 'coin') {
    if (tier === 0) paintCoin(ctx, v, 0, 0, 8.5);
    else if (tier === 1) {
      paintCoin(ctx, v, -4, -3, 8.5);
      paintCoin(ctx, v, 4, 4, 8.5);
    } else {
      paintCoin(ctx, v, -9, 5, 8);
      paintCoin(ctx, v, 9, 5, 8);
      paintCoin(ctx, v, 0, 8, 8);
      paintCoin(ctx, v, -4, -3, 9);
      paintCoin(ctx, v, 5, -6, 9.5);
    }
  } else {
    paintCross(ctx, v);
  }
}

function bodyBox(v: PickupVisual, tier: number): { w: number; h: number } {
  if (v.shape === 'gem') {
    const r = GEM_R[tier] ?? GEM_R[0];
    return tier >= 3 ? { w: r * 4.2, h: r * 3.2 } : { w: r * 2 + 10, h: r * 2 + 12 };
  }
  if (v.shape === 'coin') return tier === 0 ? { w: 24, h: 24 } : tier === 1 ? { w: 34, h: 34 } : { w: 50, h: 44 };
  return { w: 32, h: 32 };
}

/**
 * Draw one pickup. (x, groundY) is the projected ground point; `zoom` is
 * pixels per world unit. `cache` is injectable for tests.
 */
export function drawPickupProp(
  ctx: Ctx2D, p: Pickup, x: number, groundY: number, zoom: number,
  time: number, reduce: boolean, cache: SpriteCache = propCache,
): void {
  const v = pickupVisual(p.kind);
  const tier = Math.min(pickupTier(p.kind, p.value), v.tiers - 1);
  const k = (zoom / U) * popScale(p.age);
  const z = FLOAT_Z + bob(time, p.id, 0.12, reduce);
  const y = groundY - z * zoom * Z_LIFT;
  const pulse = glowPulse(time, p.id * 1.7, reduce);

  // Contact shadow shrinks as the pickup rises on its bob.
  blit(ctx, cache, 'pk:shadow', 40, 20, x, groundY, k, k, 0.5 - (z - FLOAT_Z) * 0.6, (c) => {
    paintGroundDisc(c, 9, 4.5, '#000000', 0.55);
  });

  const hr = HALO_R[tier] ?? HALO_R[0];
  blit(ctx, cache, `pk:halo:${p.kind}:${tier}`, hr * 2, hr * 2, x, y, k, k, 0.4 + 0.5 * pulse,
    (c) => paintHalo(c, v.glow, hr, 0.85));

  const box = bodyBox(v, tier);
  // Coins wobble like a slow spin; everything else holds still.
  const sx = v.shape === 'coin' && tier === 0 ? 0.8 + 0.2 * Math.cos(time * 0.006 + p.id) : 1;
  blit(ctx, cache, pickupSpriteKey(p.kind, tier), box.w, box.h, x, y, k * sx, k, 1,
    (c) => paintBody(c, v, tier));

  const tw = twinkle(time, p.id, reduce);
  if (tw > 0.04) {
    const s = k * tw * (1 + tier * 0.22);
    const gr = GEM_R[tier] ?? GEM_R[0];
    blit(ctx, cache, 'pk:spark', 24, 24, x - gr * 0.45 * k, y - gr * 0.7 * k, s, s, 1,
      (c) => paintSpark(c, 11));
  }
}
