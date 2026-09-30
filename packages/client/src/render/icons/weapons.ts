/** Weapon icons: Rootclub, Dartgun, Wisp Ring. 64-box, centre-local. */

import type { Ctx2D } from '../ctx.js';
import { INK, TONES, cel, circle, poly, rrect, sparkle, stick, tick, inkWeight, type PathFn } from './paint.js';

/** Rootclub: a knobbly wooden club, head up-right, with a sprout. */
export function paintBonker(ctx: Ctx2D): void {
  const a = 0.62;
  ctx.save();
  ctx.rotate(a);
  // Root nubs first so the head's outline sits over them.
  cel(ctx, circle(-12, -7, 5.2), TONES.wood, a);
  cel(ctx, circle(12.5, -19, 5), TONES.wood, a);
  cel(ctx, circle(11, -4, 4.2), TONES.wood, a);
  // Handle.
  cel(ctx, poly(-3.6, 28, 3.6, 28, 5.6, -2, -5.6, -2), TONES.leather, a);
  cel(ctx, circle(0, 27, 4.6), TONES.leather, a);
  // Head.
  cel(ctx, circle(0, -13, 13), TONES.wood, a);
  // Grain and a knot.
  ctx.strokeStyle = TONES.wood.shade;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-7, -19); ctx.quadraticCurveTo(-2, -14, -6, -6);
  ctx.moveTo(6, -21); ctx.quadraticCurveTo(9, -14, 4, -8);
  ctx.stroke();
  ctx.fillStyle = TONES.wood.shade;
  ctx.beginPath();
  ctx.arc(2, -12, 2.6, 0, Math.PI * 2);
  ctx.fill();
  tick(ctx, -8, -20, -3, -24, TONES.wood.light, 2.6);
  // Sprout.
  cel(ctx, poly(0, -25, -8, -29, -3, -22), TONES.leaf, a);
  cel(ctx, poly(0, -25, 8, -30, 3, -22), TONES.leaf, a);
  ctx.restore();
}

/** Dartgun: a stubby pistol firing a fletched dart. */
export function paintDart(ctx: Ctx2D): void {
  // Grip.
  cel(ctx, poly(-21, 4, -8, 4, -11, 25, -25, 25), TONES.leather);
  // Body.
  cel(ctx, rrect(-27, -12, 36, 18, 6), TONES.teal);
  tick(ctx, -22, -8, 2, -8, TONES.teal.light, 2.6);
  // Barrel.
  cel(ctx, rrect(7, -8, 11, 10, 3), TONES.steel);
  // Trigger guard.
  stick(ctx, (c) => { c.beginPath(); c.arc(-5, 7, 5.5, 0.1, Math.PI - 0.1); }, 2.4, TONES.steel.base);
  // Dart in flight.
  cel(ctx, poly(18, -6, 25, -5.5, 30, -3, 25, -0.5, 18, 0), TONES.bone);
  cel(ctx, poly(18, -3, 14, -9, 20, -5), TONES.flame);
  cel(ctx, poly(18, -3, 14, 3, 20, -1), TONES.flame);
  tick(ctx, 20, -5, 27, -4, '#ffffff', 1.8);
}

/** Wisp Ring: a ring with orbiting wisp shards. */
export function paintHalo(ctx: Ctx2D): void {
  const w = inkWeight();
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4 + w;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = TONES.blue.shade;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = TONES.blue.base;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-0.6, -0.6, 18, 0, Math.PI * 2);
  ctx.stroke();
  // Tangential kite-shaped wisps, each with a tail behind it.
  const wisp: PathFn = poly(-12, 0, -3, -6, 9, -3.6, 13, 0, 9, 3.6, -3, 6);
  const N = 4;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 - Math.PI * 0.75;
    ctx.save();
    ctx.translate(Math.cos(ang) * 18, Math.sin(ang) * 18);
    ctx.rotate(ang + Math.PI / 2);
    cel(ctx, wisp, TONES.cyan, ang + Math.PI / 2);
    tick(ctx, -3, -3, 7, -2, '#ffffff', 2);
    ctx.restore();
  }
  cel(ctx, sparkle(0, 0, 7), TONES.gold);
}
