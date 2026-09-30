import { describe, it, expect } from 'vitest';
import { SpriteCache, drawSprite, MAX_CACHED_SPRITES, type Surface } from '../src/render/atlas.js';
import { FakeCtx, fakeCtx } from './fake-ctx.js';
import type { Ctx2D } from '../src/render/ctx.js';

/** A surface factory that records what was created, standing in for OffscreenCanvas. */
function factory() {
  const made: Array<{ w: number; h: number; ctx: FakeCtx }> = [];
  const make = (w: number, h: number): Surface => {
    const ctx = new FakeCtx();
    made.push({ w, h, ctx });
    return { width: w, height: h, getContext: () => ctx as unknown as Ctx2D };
  };
  return { make, made };
}

const noop = (): void => {};

describe('SpriteCache', () => {
  it('bakes a sprite once and returns the same one thereafter', () => {
    const f = factory();
    const cache = new SpriteCache(f.make);
    let draws = 0;
    const a = cache.get('grunt:0', 40, 40, () => void draws++);
    const b = cache.get('grunt:0', 40, 40, () => void draws++);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(draws).toBe(1);
    expect(f.made).toHaveLength(1);
  });

  it('bakes different keys separately', () => {
    const f = factory();
    const cache = new SpriteCache(f.make);
    cache.get('a', 20, 20, noop);
    cache.get('b', 20, 20, noop);
    expect(f.made).toHaveLength(2);
    expect(cache.size).toBe(2);
  });

  it('bakes at higher resolution than it draws, so sprites stay crisp', () => {
    const f = factory();
    const cache = new SpriteCache(f.make, { resolution: 2 });
    cache.get('a', 30, 20, noop);
    expect(f.made[0]!.w).toBe(60);
    expect(f.made[0]!.h).toBe(40);
    expect(f.made[0]!.ctx.calls.scale).toBe(1); // resolution applied once
  });

  it('places the drawing origin at the anchor, so the same draw works baked or direct', () => {
    const f = factory();
    const cache = new SpriteCache(f.make);
    cache.get('a', 40, 40, noop, { ax: 0.5, ay: 1 });
    expect(f.made[0]!.ctx.calls.translate).toBe(1);
  });

  it('returns null when there is no surface factory (node, tests, old browsers)', () => {
    const cache = new SpriteCache(null);
    expect(cache.get('a', 20, 20, noop)).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('returns null when the surface cannot give a 2D context, rather than throwing', () => {
    const cache = new SpriteCache(() => ({ width: 1, height: 1, getContext: () => null }));
    expect(cache.get('a', 20, 20, noop)).toBeNull();
  });

  it('survives a factory that throws, as OffscreenCanvas can on allocation failure', () => {
    const cache = new SpriteCache(() => { throw new Error('out of memory'); });
    expect(() => cache.get('a', 20, 20, noop)).not.toThrow();
    expect(cache.get('a', 20, 20, noop)).toBeNull();
  });

  it('does not re-attempt a failed bake on every frame', () => {
    let attempts = 0;
    const cache = new SpriteCache(() => { attempts++; throw new Error('nope'); });
    for (let i = 0; i < 50; i++) cache.get('a', 20, 20, noop);
    expect(attempts).toBe(1);
  });

  it('is bounded: it cannot grow without limit as keys vary', () => {
    const f = factory();
    const cache = new SpriteCache(f.make);
    for (let i = 0; i < MAX_CACHED_SPRITES + 50; i++) cache.get(`k${i}`, 8, 8, noop);
    expect(cache.size).toBeLessThanOrEqual(MAX_CACHED_SPRITES);
  });

  it('clear() drops everything', () => {
    const f = factory();
    const cache = new SpriteCache(f.make);
    cache.get('a', 8, 8, noop);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('a draw function that throws does not poison the cache or the frame', () => {
    const f = factory();
    const cache = new SpriteCache(f.make);
    expect(() => cache.get('bad', 8, 8, () => { throw new Error('bug'); })).not.toThrow();
    expect(cache.get('bad', 8, 8, noop)).toBeNull();
  });
});

describe('drawSprite', () => {
  it('blits a baked sprite with drawImage instead of re-running the draw routine', () => {
    const f = factory();
    const cache = new SpriteCache(f.make);
    const { ctx, fake } = fakeCtx();
    let draws = 0;
    const draw = (): void => void draws++;
    drawSprite(ctx, cache, 'a', 40, 40, 100, 100, 1, false, draw);
    drawSprite(ctx, cache, 'a', 40, 40, 120, 90, 1, false, draw);
    expect(draws).toBe(1); // baked once
    expect(fake.calls.drawImage).toBe(2); // blitted twice
  });

  it('falls back to drawing directly when nothing can be baked', () => {
    const cache = new SpriteCache(null);
    const { ctx, fake } = fakeCtx();
    let draws = 0;
    drawSprite(ctx, cache, 'a', 40, 40, 100, 100, 1, false, () => void draws++);
    drawSprite(ctx, cache, 'a', 40, 40, 100, 100, 1, false, () => void draws++);
    expect(draws).toBe(2);
    expect(fake.calls.drawImage ?? 0).toBe(0);
  });

  it('keeps save/restore balanced on both paths, including when flipped', () => {
    for (const cache of [new SpriteCache(factory().make), new SpriteCache(null)]) {
      const { ctx, fake } = fakeCtx();
      drawSprite(ctx, cache, 'a', 40, 40, 100, 100, 1.5, true, noop);
      drawSprite(ctx, cache, 'a', 40, 40, 100, 100, 1.5, false, noop);
      expect(fake.balanced).toBe(true);
    }
  });

  it('never touches shadowBlur, which is prohibitively slow per entity', () => {
    const cache = new SpriteCache(factory().make);
    const { ctx, fake } = fakeCtx();
    for (let i = 0; i < 200; i++) drawSprite(ctx, cache, 'a', 40, 40, i, i, 1, i % 2 === 0, noop);
    expect(fake.shadowBlur).toBe(0);
  });
});
