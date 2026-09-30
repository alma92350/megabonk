/**
 * The merchant: a hooded travelling trader with a laden pack and a lantern on a
 * staff, under a floating gold coin-purse sign. The sign carries the meaning
 * ("shop / money") and the pips under it the state: a gold pip per affordable
 * item, a hollow grey pip per unaffordable one, none for sold items.
 */

import type { MerchantState } from '@megabonk/sim';
import type { Ctx2D } from '../ctx.js';
import { Y_SQUASH } from '../projection.js';
import type { SpriteCache } from '../atlas.js';
import { U } from './obstacleStyle.js';
import { bob, glowPulse, twinkle } from './motion.js';
import { FEET, blit, inkStroke, paintGroundDisc, paintHalo, paintSpark, polygon, propCache } from './bake.js';
import { INK, MERCHANT_GLOW } from './palette.js';

export interface Affordability {
  readonly affordable: number;
  readonly unaffordable: number;
  readonly sold: number;
}

export function merchantAffordability(stock: MerchantState['stock'], gold: number): Affordability {
  let affordable = 0, unaffordable = 0, sold = 0;
  for (let i = 0; i < stock.length; i++) {
    const s = stock[i]!;
    if (s.sold) sold++;
    else if (s.price <= gold) affordable++;
    else unaffordable++;
  }
  return { affordable, unaffordable, sold };
}

const BOX_W = 130;
const BOX_H = 150;

function paintTrader(ctx: Ctx2D): void {
  // Pack: a fat sack with a bedroll on top and a hanging pot, behind the cloak.
  ctx.beginPath();
  ctx.ellipse(-25, -33, 21, 25, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = '#9b7440';
  ctx.fill();
  inkStroke(ctx, 1.8);
  ctx.fillStyle = '#c29a5c';
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.ellipse(-31, -41, 8, 11, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.ellipse(-27, -62, 20, 7, -0.1, 0, Math.PI * 2);
  ctx.fillStyle = '#3f8a92';
  ctx.fill();
  inkStroke(ctx, 1.6);
  ctx.strokeStyle = '#2a5f66';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-40, -62); ctx.lineTo(-40, -58);
  ctx.moveTo(-14, -63); ctx.lineTo(-14, -59);
  ctx.stroke();
  // Hanging pot.
  ctx.beginPath();
  ctx.arc(-40, -22, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = '#7f8a94';
  ctx.fill();
  inkStroke(ctx, 1.4);

  // Cloak.
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.quadraticCurveTo(-19, -34, -13, -46);
  ctx.quadraticCurveTo(-8, -62, 4, -70);
  ctx.quadraticCurveTo(14, -58, 14, -44);
  ctx.quadraticCurveTo(20, -30, 20, 0);
  ctx.closePath();
  ctx.fillStyle = '#a2622f';
  ctx.fill();
  ctx.fillStyle = '#c98847';
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(-18, -2);
  ctx.quadraticCurveTo(-17, -32, -11, -46);
  ctx.quadraticCurveTo(-8, -58, -2, -64);
  ctx.quadraticCurveTo(-8, -40, -8, -2);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.quadraticCurveTo(-19, -34, -13, -46);
  ctx.quadraticCurveTo(-8, -62, 4, -70);
  ctx.quadraticCurveTo(14, -58, 14, -44);
  ctx.quadraticCurveTo(20, -30, 20, 0);
  ctx.closePath();
  inkStroke(ctx, 2);
  // Gold belt and hem.
  ctx.fillStyle = '#ffd24d';
  ctx.fillRect(-18, -22, 36, 4);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-18, -22, 36, 4);
  ctx.fillStyle = '#ffd24d';
  ctx.fillRect(-19.5, -4, 39, 3);
  // Hood opening with two bright eyes.
  ctx.beginPath();
  ctx.ellipse(1, -46, 8.5, 11, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#150c07';
  ctx.fill();
  ctx.fillStyle = '#fff1b0';
  ctx.beginPath();
  ctx.arc(-2.5, -47, 1.9, 0, Math.PI * 2);
  ctx.arc(4.5, -47, 1.9, 0, Math.PI * 2);
  ctx.fill();

  // Staff with lantern.
  ctx.strokeStyle = '#4a3018';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(32, 0);
  ctx.lineTo(32, -82);
  ctx.quadraticCurveTo(32, -90, 40, -88);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();
  // Lantern cage.
  polygon(ctx, [26, -66, 38, -66, 40, -50, 24, -50]);
  ctx.fillStyle = '#ffe28a';
  ctx.fill();
  inkStroke(ctx, 1.7);
  ctx.strokeStyle = '#7a4e17';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(32, -66); ctx.lineTo(32, -50);
  ctx.moveTo(25, -58); ctx.lineTo(39, -58);
  ctx.stroke();
  ctx.fillStyle = '#4a3018';
  ctx.fillRect(25, -69, 14, 3);

  // A little sack of wares on the ground, coins spilling.
  ctx.beginPath();
  ctx.ellipse(16, -5, 9, 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#b48a4e';
  ctx.fill();
  inkStroke(ctx, 1.4);
  ctx.fillStyle = '#ffd24d';
  ctx.beginPath();
  ctx.arc(26, 1, 3.4, 0, Math.PI * 2);
  ctx.arc(21, 4, 3, 0, Math.PI * 2);
  ctx.fill();
}

function paintSign(ctx: Ctx2D): void {
  // A round brass badge holding a coin purse.
  ctx.beginPath();
  ctx.arc(0, 0, 17, 0, Math.PI * 2);
  ctx.fillStyle = '#2b1b0d';
  ctx.fill();
  ctx.strokeStyle = '#ffd24d';
  ctx.lineWidth = 3;
  ctx.stroke();
  inkStroke(ctx, 1);
  // Purse.
  ctx.beginPath();
  ctx.moveTo(-4, -8);
  ctx.quadraticCurveTo(-13, 3, -8, 9);
  ctx.quadraticCurveTo(0, 13, 8, 9);
  ctx.quadraticCurveTo(13, 3, 4, -8);
  ctx.closePath();
  ctx.fillStyle = '#ffd24d';
  ctx.fill();
  ctx.strokeStyle = '#8a5a10';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = '#8a5a10';
  ctx.fillRect(-5, -9.5, 10, 3);
  ctx.beginPath();
  ctx.arc(0, 2, 3.6, 0, Math.PI * 2);
  ctx.fillStyle = '#fff3ae';
  ctx.fill();
  ctx.strokeStyle = '#8a5a10';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawMerchantProp(
  ctx: Ctx2D, m: MerchantState, gold: number, x: number, groundY: number, zoom: number,
  time: number, reduce: boolean, cache: SpriteCache = propCache,
): void {
  const k = zoom / U;
  const aff = merchantAffordability(m.stock, gold);
  const pulse = glowPulse(time, 0.7, reduce);
  const hot = aff.affordable > 0;

  blit(ctx, cache, 'mv:ground-glow', 190, 190, x, groundY, k, k * Y_SQUASH, 0.3 + 0.35 * pulse,
    (c) => paintHalo(c, MERCHANT_GLOW, 92, 0.85));
  blit(ctx, cache, 'mv:shadow', 100, 40, x, groundY, k, k, 0.5, (c) => paintGroundDisc(c, 34, 11, '#000000', 0.5));
  blit(ctx, cache, 'mv:trader', BOX_W, BOX_H, x, groundY, k, k, 1, paintTrader, FEET);
  // Lantern glow flickers.
  blit(ctx, cache, 'mv:lantern-halo', 100, 100, x + 32 * k, groundY - 58 * k, k, k, 0.45 + 0.5 * glowPulse(time, 2.1, reduce),
    (c) => paintHalo(c, '#ffdc80', 46, 0.9));

  const sy = groundY - (98 + bob(time, 1.9, 0.14, reduce) * U) * k;
  blit(ctx, cache, 'mv:sign-halo', 110, 110, x, sy, k, k, (hot ? 0.55 : 0.25) + 0.4 * pulse,
    (c) => paintHalo(c, MERCHANT_GLOW, 50, 0.95));
  blit(ctx, cache, 'mv:sign', 44, 44, x, sy, k, k, hot ? 1 : 0.7, paintSign);
  const tw = twinkle(time, 5.3, reduce);
  if (tw > 0.04 && hot) {
    const s = k * tw * 1.2;
    blit(ctx, cache, 'pk:spark', 24, 24, x + 12 * k, sy - 13 * k, s, s, 1, (c) => paintSpark(c, 11));
  }

  // Stock pips (direct: one merchant per world, a handful of arcs).
  const n = m.stock.length;
  if (n > 0) {
    const gap = 9 * k;
    let px = x - ((n - 1) * gap) / 2;
    const py = sy + 24 * k;
    for (let i = 0; i < n; i++) {
      const s = m.stock[i]!;
      if (!s.sold) {
        const can = s.price <= gold;
        ctx.beginPath();
        ctx.arc(px, py, 3.2 * k, 0, Math.PI * 2);
        ctx.fillStyle = can ? '#ffd24d' : 'rgba(20,16,10,0.85)';
        ctx.fill();
        ctx.strokeStyle = can ? INK : '#8a8f94';
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
      px += gap;
    }
  }
}
