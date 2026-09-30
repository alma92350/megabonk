/**
 * The one sprite cache for props, plus helpers shared by every prop painter.
 *
 * Painters are authored in ANCHOR-LOCAL space at U = 32 px per world unit, so
 * the same routine draws the baked sprite (once, at 2x) and the direct fallback
 * used in Node tests. Blitting scales by zoom / U.
 */

import { SpriteCache, browserSurfaceFactory, type Anchor, type SpriteDraw } from '../atlas.js';
import type { Ctx2D } from '../ctx.js';
import { INK, rgba } from './palette.js';

export const propCache = new SpriteCache(browserSurfaceFactory());

export const CENTRE: Anchor = Object.freeze({ ax: 0.5, ay: 0.5 });
/** Anchor at the bottom-centre of the box: the ground contact point. */
export const FEET: Anchor = Object.freeze({ ax: 0.5, ay: 0.86 });

/**
 * Blit (or, when unbakeable, draw directly) a sprite with a NON-uniform scale
 * and an alpha. Restores globalAlpha to 1. No allocation on the baked path.
 */
export function blit(
  ctx: Ctx2D, cache: SpriteCache, key: string, w: number, h: number,
  x: number, y: number, sx: number, sy: number, alpha: number,
  draw: SpriteDraw, anchor: Anchor = CENTRE,
): void {
  if (alpha <= 0.003 || sx === 0 || sy === 0) return;
  const sprite = cache.get(key, w, h, draw, anchor);
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  if (sprite !== null) {
    const dw = w * sx, dh = h * sy;
    ctx.drawImage(sprite.surface, x - dw * anchor.ax, y - dh * anchor.ay, dw, dh);
  } else {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    draw(ctx, w, h);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** Soft radial glow, drawn in anchor-local space. `peak` is the centre alpha. */
export function paintHalo(ctx: Ctx2D, color: string, radius: number, peak: number): void {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  g.addColorStop(0, rgba(color, peak));
  g.addColorStop(0.35, rgba(color, peak * 0.45));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
}

/** Four-point sparkle of half-size `r`. */
export function paintSpark(ctx: Ctx2D, r: number, color = '#ffffff'): void {
  const w = r * 0.16;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(w, -w, r, 0);
  ctx.quadraticCurveTo(w, w, 0, r);
  ctx.quadraticCurveTo(-w, w, -r, 0);
  ctx.quadraticCurveTo(-w, -w, 0, -r);
  ctx.closePath();
  ctx.fill();
}

export function polygon(ctx: Ctx2D, pts: readonly number[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0] ?? 0, pts[1] ?? 0);
  for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
  ctx.closePath();
}

/** Stroke the current path with the shared hard ink line. */
export function inkStroke(ctx: Ctx2D, width = 1.6): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export function fillShape(ctx: Ctx2D, color: string, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Ground contact ellipse in anchor space (used for glows lying on the ground). */
export function paintGroundDisc(ctx: Ctx2D, rx: number, ry: number, color: string, alpha: number): void {
  ctx.fillStyle = rgba(color, alpha);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
