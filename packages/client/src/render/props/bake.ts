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

/**
 * Backing-store scale of baked props. The renderer scales its context by the
 * device pixel ratio (main.ts), so baking at that ratio makes every blit a 1:1
 * pixel copy, which is several times cheaper than a resampled one.
 */
const RES = ((): number => {
  const dpr = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
  return Math.min(2, Math.max(1, Math.round(typeof dpr === 'number' && dpr > 0 ? dpr : 1)));
})();

export const propCache = new SpriteCache(browserSurfaceFactory(), { resolution: RES });

export const CENTRE: Anchor = Object.freeze({ ax: 0.5, ay: 0.5 });
/** Anchor near the bottom-centre of the box: the ground contact point. */
export const FEET: Anchor = Object.freeze({ ax: 0.5, ay: 0.86 });

/** Zoom is bucketed to whole pixels-per-unit so bake keys stay few (14..48 -> <= 35). */
export function zoomBucket(zoom: number): number {
  const z = Math.round(zoom);
  return z < 8 ? 8 : z > 64 ? 64 : z;
}

interface Zoomed {
  readonly key: string;
  readonly bw: number;
  readonly bh: number;
  readonly draw: SpriteDraw;
}

/**
 * A drawable prop picture: authored once in anchor-local space at U px/unit,
 * baked per zoom bucket at the exact size it is blitted (so a blit is a 1:1,
 * integer-snapped copy), and drawn directly when no surface is available.
 * Instances are created once (module level / memoised) so the per-frame path
 * allocates nothing: no closures, no key strings.
 */
export class Prop {
  private readonly zoomed = new Map<number, Zoomed>();

  constructor(
    readonly key: string,
    readonly w: number,
    readonly h: number,
    private readonly paint: SpriteDraw,
    readonly anchor: Anchor = CENTRE,
    /** Constant extra scale applied when baking (e.g. pickups are drawn 1.2x). */
    readonly scale = 1,
  ) {}

  private make(zb: number): Zoomed {
    const kz = (zb / 32) * this.scale;
    const bw = Math.max(1, Math.ceil(this.w * kz));
    const bh = Math.max(1, Math.ceil(this.h * kz));
    const fx = bw / this.w, fy = bh / this.h;
    const paint = this.paint;
    const w = this.w, h = this.h;
    const z: Zoomed = {
      key: `${this.key}@${zb}`, bw, bh,
      draw: (c) => { c.scale(fx, fy); paint(c, w, h); },
    };
    this.zoomed.set(zb, z);
    return z;
  }

  /**
   * Draw with the anchor at (x, y). `sx`/`sy` are extra scales (1 = the exact
   * baked size, the fast path). `alpha` is restored to 1 afterwards.
   */
  draw(
    ctx: Ctx2D, cache: SpriteCache, zoom: number, x: number, y: number,
    alpha = 1, sx = 1, sy = 1,
  ): void {
    if (alpha <= 0.003 || sx <= 0 || sy <= 0) return;
    const zb = zoomBucket(zoom);
    const z = this.zoomed.get(zb) ?? this.make(zb);
    const sprite = cache.get(z.key, z.bw, z.bh, z.draw, this.anchor);
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    if (sprite !== null) {
      const dw = z.bw * sx, dh = z.bh * sy;
      let dx = x - dw * this.anchor.ax, dy = y - dh * this.anchor.ay;
      if (sx === 1 && sy === 1) {
        dx = Math.round(dx * RES) / RES;
        dy = Math.round(dy * RES) / RES;
      }
      ctx.drawImage(sprite.surface, dx, dy, dw, dh);
    } else {
      const k = (zoom / 32) * this.scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k * sx, k * sy);
      this.paint(ctx, this.w, this.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
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
