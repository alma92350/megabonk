/**
 * Rite icons: a wax seal with an embossed glyph. Shared seal = "this is a Rite";
 * the glyph names it. Fist (Wrath), flame (Fury), blade edge (Edge), hide shield
 * (Hide), four-leaf clover (Fortune).
 */

import type { Ctx2D } from '../ctx.js';
import { INK, TONES, cel, circle, poly, rrect, sparkle, stick, tick, inkWeight, type PathFn } from './paint.js';

function scallopedSeal(): PathFn {
  return (ctx) => {
    ctx.beginPath();
    const steps = 72;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const r = 25 + 2.2 * Math.cos(t * 10);
      const x = Math.cos(t) * r;
      const y = Math.sin(t) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
}

function seal(ctx: Ctx2D): void {
  cel(ctx, scallopedSeal(), TONES.plum);
  // Embossed inner ring.
  ctx.strokeStyle = TONES.plum.shade;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 19.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = TONES.plum.light;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, 19.5, Math.PI * 1.05, Math.PI * 1.6);
  ctx.stroke();
}

export function paintFury(ctx: Ctx2D): void {
  seal(ctx);
  const flame: PathFn = (c) => {
    c.beginPath();
    c.moveTo(1, -17);
    c.quadraticCurveTo(4, -8, 10, -2);
    c.quadraticCurveTo(15, 5, 9, 12);
    c.quadraticCurveTo(4, 17, -1, 16);
    c.quadraticCurveTo(-9, 16, -11, 8);
    c.quadraticCurveTo(-12, 2, -6, -4);
    c.quadraticCurveTo(-5, 3, -2, 4);
    c.quadraticCurveTo(-5, -7, 1, -17);
    c.closePath();
  };
  cel(ctx, flame, TONES.flame);
  const core: PathFn = (c) => {
    c.beginPath();
    c.moveTo(1, 1);
    c.quadraticCurveTo(6, 6, 3, 12);
    c.quadraticCurveTo(0, 14, -3, 12);
    c.quadraticCurveTo(-5, 7, 1, 1);
    c.closePath();
  };
  ctx.fillStyle = TONES.flame.light;
  core(ctx);
  ctx.fill();
}

export function paintWrath(ctx: Ctx2D): void {
  seal(ctx);
  // Raised fist, front view: four fingers, palm block, thumb.
  const xs = [-9.5, -3.2, 3.1, 9.4];
  const tops = [-12, -14, -14, -12];
  for (let i = 0; i < 4; i++) {
    cel(ctx, rrect(xs[i]! - 3.4, tops[i]!, 6.8, 11, 3), TONES.bone);
  }
  cel(ctx, rrect(-13, -5, 26, 19, 6), TONES.bone);
  cel(ctx, rrect(-17, -1, 8, 11, 4), TONES.bone);
  tick(ctx, -8, 3, -8, 3.1, TONES.bone.shade, 1);
  ctx.strokeStyle = TONES.bone.shade;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-11, -4); ctx.lineTo(11, -4);
  ctx.stroke();
}

export function paintEdge(ctx: Ctx2D): void {
  seal(ctx);
  const a = 0.72;
  ctx.save();
  ctx.rotate(a);
  cel(ctx, poly(0, -19, 4.4, -9, 3.8, 8, -3.8, 8, -4.4, -9), TONES.steel, a);
  tick(ctx, -1.6, -10, -1.6, 5, '#ffffff', 1.8);
  cel(ctx, rrect(-9, 7.5, 18, 4.2, 2), TONES.brass, a);
  cel(ctx, rrect(-2.3, 11, 4.6, 8, 1.6), TONES.leather, a);
  ctx.restore();
  cel(ctx, sparkle(12, -13, 7), TONES.gold);
}

export function paintHide(ctx: Ctx2D): void {
  seal(ctx);
  const shield: PathFn = (c) => {
    c.beginPath();
    c.moveTo(-13, -14);
    c.lineTo(13, -14);
    c.lineTo(13, 3);
    c.quadraticCurveTo(13, 12, 0, 18);
    c.quadraticCurveTo(-13, 12, -13, 3);
    c.closePath();
  };
  cel(ctx, shield, { base: '#dcaa64', shade: '#a8763a', light: '#f5d39a' });
  // Stitched cross.
  ctx.strokeStyle = '#6b4222';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(0, -11); ctx.lineTo(0, 13);
  ctx.moveTo(-10, -3); ctx.lineTo(10, -3);
  ctx.stroke();
  ctx.setLineDash([]);
  tick(ctx, -10, -11, 8, -11, '#f5d39a', 2);
}

export function paintFortune(ctx: Ctx2D): void {
  seal(ctx);
  stick(ctx, (c) => { c.beginPath(); c.moveTo(1, 2); c.quadraticCurveTo(-2, 12, 6, 17); }, 2.4, TONES.leaf.shade);
  const off = 7.2;
  const spots: ReadonlyArray<readonly [number, number]> = [[-off, -off], [off, -off], [-off, off], [off, off]];
  for (const [x, y] of spots) cel(ctx, circle(x * 0.98, y * 0.98 - 1, 7.6), TONES.leaf);
  cel(ctx, circle(0, -1, 3.4), TONES.leaf);
  ctx.strokeStyle = TONES.leaf.shade;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-3, -4); ctx.lineTo(-11, -12);
  ctx.moveTo(3, -4); ctx.lineTo(11, -12);
  ctx.moveTo(-3, 2); ctx.lineTo(-11, 10);
  ctx.moveTo(3, 2); ctx.lineTo(11, 10);
  ctx.stroke();
  tick(ctx, -12, -11, -8, -15, TONES.leaf.light, 2);
}
