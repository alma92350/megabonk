/**
 * Sprite baking.
 *
 * Drawing a shaded, outlined, multi-part creature with a dozen paths for each of
 * 1500 enemies every frame does not fit a 16 ms budget. Drawing it ONCE into an
 * offscreen surface and blitting that with drawImage does — a blit is a single
 * call however elaborate the picture is. That is what lets the art be rich
 * without the frame rate paying for it.
 *
 * Design rules:
 *  - The draw routine is authored in ANCHOR-LOCAL space: (0, 0) is the anchor
 *    point of the sprite (feet, centre, wherever `anchor` says). The exact same
 *    routine runs whether the sprite is baked or drawn directly, so there is
 *    nothing to keep in sync and the fallback cannot drift from the real thing.
 *  - Nothing here may throw into a frame. Allocation can fail, a context can be
 *    unavailable, and a draw routine can have a bug; each of those yields null
 *    and the caller draws directly instead.
 *  - A failed bake is remembered, so a broken sprite costs one attempt, not one
 *    attempt per entity per frame.
 *  - The cache is bounded. Keys that vary (animation frames, tints) must not be
 *    able to grow memory without limit.
 */

import type { Ctx2D } from './ctx.js';

/** The slice of OffscreenCanvas / HTMLCanvasElement the cache needs. */
export interface Surface {
  readonly width: number;
  readonly height: number;
  getContext(kind: '2d'): Ctx2D | null;
}

/** Returns a surface, or null when none can be made. May throw; the cache copes. */
export type SurfaceFactory = (width: number, height: number) => Surface | null;

export interface Anchor {
  /** Fraction of the width the anchor sits at (0 = left, 0.5 = centre). */
  readonly ax: number;
  /** Fraction of the height the anchor sits at (0 = top, 1 = bottom / feet). */
  readonly ay: number;
}

export interface Sprite {
  readonly surface: Surface;
  /** Logical (pre-resolution) size, in the units draw routines are authored in. */
  readonly width: number;
  readonly height: number;
  readonly anchor: Anchor;
}

export interface SpriteCacheOptions {
  /** Backing-store scale over the logical size. 2 keeps sprites crisp when scaled up. */
  readonly resolution?: number;
}

export const MAX_CACHED_SPRITES = 600;
const CENTRE: Anchor = Object.freeze({ ax: 0.5, ay: 0.5 });

export type SpriteDraw = (ctx: Ctx2D, width: number, height: number) => void;

export class SpriteCache {
  private readonly sprites = new Map<string, Sprite>();
  private readonly failed = new Set<string>();
  private readonly resolution: number;

  constructor(
    private readonly factory: SurfaceFactory | null,
    options: SpriteCacheOptions = {},
  ) {
    this.resolution = options.resolution ?? 2;
  }

  get size(): number {
    return this.sprites.size;
  }

  clear(): void {
    this.sprites.clear();
    this.failed.clear();
  }

  /**
   * The baked sprite for `key`, baking it on first use. Returns null when it
   * cannot be baked; the caller then draws directly.
   */
  get(
    key: string,
    width: number,
    height: number,
    draw: SpriteDraw,
    anchor: Anchor = CENTRE,
  ): Sprite | null {
    const hit = this.sprites.get(key);
    if (hit !== undefined) return hit;
    if (this.factory === null || this.failed.has(key)) return null;

    try {
      const res = this.resolution;
      const surface = this.factory(Math.ceil(width * res), Math.ceil(height * res));
      const ctx = surface?.getContext('2d') ?? null;
      if (surface === null || ctx === null) {
        this.failed.add(key);
        return null;
      }
      ctx.save();
      ctx.scale(res, res);
      ctx.translate(width * anchor.ax, height * anchor.ay);
      draw(ctx, width, height);
      ctx.restore();

      // Bounded: when full, start over rather than tracking recency. Sprite sets
      // are small and stable, so hitting the cap means keys are leaking and a
      // flush is the right response, not a cleverer eviction policy.
      if (this.sprites.size >= MAX_CACHED_SPRITES) this.sprites.clear();
      const sprite: Sprite = { surface, width, height, anchor };
      this.sprites.set(key, sprite);
      return sprite;
    } catch {
      this.failed.add(key);
      return null;
    }
  }
}

/**
 * Draw a sprite at (x, y) — the anchor point — scaled by `k`, optionally mirrored.
 *
 * Baked: one drawImage. Not baked: run the draw routine directly in the same
 * anchor-local space. Either way the caller sees the same picture.
 */
export function drawSprite(
  ctx: Ctx2D,
  cache: SpriteCache,
  key: string,
  width: number,
  height: number,
  x: number,
  y: number,
  k: number,
  flipX: boolean,
  draw: SpriteDraw,
  anchor: Anchor = CENTRE,
): void {
  const sprite = cache.get(key, width, height, draw, anchor);

  if (sprite !== null) {
    const w = width * k;
    const h = height * k;
    const dx = -w * anchor.ax;
    const dy = -h * anchor.ay;
    if (flipX) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite.surface, dx, dy, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(sprite.surface, x + dx, y + dy, w, h);
    }
    return;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flipX ? -k : k, k);
  draw(ctx, width, height);
  ctx.restore();
}

/** The browser's OffscreenCanvas when it has one, else a detached <canvas>, else null. */
export function browserSurfaceFactory(): SurfaceFactory | null {
  const g = globalThis as unknown as {
    OffscreenCanvas?: new (w: number, h: number) => Surface;
    document?: { createElement(tag: 'canvas'): Surface & { width: number; height: number } };
  };
  if (typeof g.OffscreenCanvas === 'function') {
    const Off = g.OffscreenCanvas;
    return (w, h) => new Off(w, h);
  }
  if (g.document !== undefined && typeof g.document.createElement === 'function') {
    const doc = g.document;
    return (w, h) => {
      const c = doc.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    };
  }
  return null;
}
