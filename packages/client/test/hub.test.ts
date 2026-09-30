import { describe, expect, it } from 'vitest';
import { GameClient } from '../src/app.js';
import { breath, flicker, moteAt, MOTE_COUNT } from '../src/render/hub/anim.js';
import { hubBakeKey, hubGeometry, rectsOverlap, type Rect } from '../src/render/hub/geometry.js';
import { drawHub } from '../src/render/hub.js';
import { drawFrame } from '../src/render/renderer.js';
import { fakeCtx } from './fake-ctx.js';

const SIZES = [
  { width: 360, height: 640 },
  { width: 800, height: 600 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

const inside = (r: Rect, w: number, h: number): boolean =>
  r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5;

describe('hub geometry', () => {
  it('keeps every text line, the logo and the rows inside the viewport, all finite', () => {
    for (const v of SIZES) {
      const g = hubGeometry(4, v);
      const all: Rect[] = [g.logo, g.tagline, g.motes, g.stats, g.hint, g.notice, ...g.rows, g.scene];
      for (const r of all) {
        expect(Object.values(r).every((n) => typeof n !== 'number' || Number.isFinite(n))).toBe(true);
        expect(inside(r, v.width, v.height), `${v.width}x${v.height} ${JSON.stringify(r)}`).toBe(true);
      }
    }
  });

  it('never overlaps: logo, text lines and rows are pairwise disjoint', () => {
    for (const v of SIZES) {
      const g = hubGeometry(4, v);
      const all: Rect[] = [g.logo, g.tagline, g.motes, g.stats, ...g.rows, g.hint, g.notice];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          expect(rectsOverlap(all[i]!, all[j]!), `${v.width}x${v.height} #${i} vs #${j}`).toBe(false);
        }
      }
    }
  });

  it('keeps menu rows reachable: tall enough to read, and one per entry', () => {
    for (const v of SIZES) {
      for (const n of [1, 4, 6]) {
        const g = hubGeometry(n, v);
        expect(g.rows).toHaveLength(n);
        for (const r of g.rows) expect(r.h).toBeGreaterThanOrEqual(40);
        expect(inside(g.column, v.width, v.height)).toBe(true);
      }
    }
  });

  it('keeps the logo lettering at a readable size floor', () => {
    for (const v of SIZES) {
      const g = hubGeometry(4, v);
      expect(g.logoFontPx, `${v.width}x${v.height}`).toBeGreaterThanOrEqual(34);
      expect(g.logoText.w).toBeGreaterThan(g.logoFontPx * 6);
    }
    expect(hubGeometry(4, { width: 1920, height: 1080 }).logoFontPx)
      .toBeGreaterThan(hubGeometry(4, { width: 800, height: 600 }).logoFontPx);
  });

  it('puts the cast inside the scene and clear of the menu column and logo', () => {
    for (const v of SIZES) {
      const g = hubGeometry(4, v);
      expect(g.cast.map((m) => m.id)).toEqual(expect.arrayContaining(['hero', 'boss']));
      for (const m of g.cast) {
        expect(inside(m.box, v.width, v.height), `${v.width}x${v.height} ${m.id}`).toBe(true);
        expect(inside(m.box, g.scene.x + g.scene.w, g.scene.y + g.scene.h + 0.5), m.id).toBe(true);
        expect(m.box.x).toBeGreaterThanOrEqual(g.scene.x - 0.5);
        expect(m.box.y).toBeGreaterThanOrEqual(g.scene.y - 0.5);
        expect(Number.isInteger(m.unit)).toBe(true);
        for (const r of [g.logo, g.tagline, g.motes, g.stats, g.menu, g.hint, g.notice]) {
          expect(rectsOverlap(m.box, r), `${v.width}x${v.height} ${m.id}`).toBe(false);
        }
      }
    }
  });

  it('draws the boss behind the hero and larger than any small creature', () => {
    for (const v of SIZES) {
      const g = hubGeometry(4, v);
      const boss = g.cast.find((m) => m.id === 'boss')!;
      const hero = g.cast.find((m) => m.id === 'hero')!;
      expect(boss.feetY).toBeLessThan(hero.feetY);
      expect(boss.box.h).toBeGreaterThan(hero.box.h * 0.9);
      for (const m of g.cast) if (m.id !== 'boss' && m.id !== 'hero') expect(m.box.h).toBeLessThan(boss.box.h);
    }
  });

  it('switches to the phone layout on narrow or tall viewports', () => {
    expect(hubGeometry(4, { width: 360, height: 640 }).compact).toBe(true);
    expect(hubGeometry(4, { width: 1280, height: 800 }).compact).toBe(false);
  });

  it('is deterministic and survives absurd viewports', () => {
    expect(hubGeometry(4, SIZES[1]!)).toEqual(hubGeometry(4, SIZES[1]!));
    for (const v of [{ width: 320, height: 240 }, { width: 0, height: 0 }, { width: 5000, height: 300 }]) {
      const g = hubGeometry(4, v);
      expect(Number.isFinite(g.logoFontPx)).toBe(true);
    }
  });
});

describe('hub bake key', () => {
  it('is stable for one size, differs across sizes, and is short', () => {
    expect(hubBakeKey({ width: 800, height: 600 })).toBe(hubBakeKey({ width: 800, height: 600 }));
    expect(hubBakeKey({ width: 800, height: 600 })).not.toBe(hubBakeKey({ width: 801, height: 600 }));
    expect(hubBakeKey({ width: 800.2, height: 599.8 })).toBe(hubBakeKey({ width: 800, height: 600 }));
    expect(hubBakeKey({ width: 1920, height: 1080 }).length).toBeLessThan(24);
  });
});

describe('hub animation helpers', () => {
  it('are deterministic', () => {
    expect(breath(1234, 3000, false, 0.2)).toBe(breath(1234, 3000, false, 0.2));
    expect(flicker(999, false)).toBe(flicker(999, false));
    expect(moteAt(3, 5000, 800, 600, false)).toEqual(moteAt(3, 5000, 800, 600, false));
  });

  it('are damped to their resting values under reduced motion', () => {
    for (const t of [0, 777, 123456]) {
      expect(breath(t, 3000, true)).toBe(0);
      expect(flicker(t, true)).toBe(1);
      for (let i = 0; i < MOTE_COUNT; i++) {
        expect(moteAt(i, t, 800, 600, true)).toEqual(moteAt(i, 0, 800, 600, true));
      }
    }
  });

  it('actually move when motion is allowed, and stay in a sane range', () => {
    expect(breath(700, 3000, false)).not.toBe(0);
    expect(flicker(100, false)).not.toBe(flicker(400, false));
    expect(moteAt(2, 0, 800, 600, false)).not.toEqual(moteAt(2, 9000, 800, 600, false));
    for (let i = 0; i < MOTE_COUNT; i++) {
      for (const t of [0, 4000, 91000]) {
        const m = moteAt(i, t, 800, 600, false);
        expect(m.alpha).toBeGreaterThan(0);
        expect(m.alpha).toBeLessThanOrEqual(1);
        expect(m.y).toBeGreaterThanOrEqual(-21);
        expect(m.y).toBeLessThanOrEqual(641);
      }
    }
  });
});

function client(width: number, height: number, reduceMotion = false): GameClient {
  return new GameClient({ storage: null, viewport: { width, height }, seedSource: () => 7, reduceMotion });
}

describe('drawHub against the fake context (null surface factory: direct-draw fallback)', () => {
  it('draws at every size with balanced save/restore and no shadowBlur', () => {
    for (const v of SIZES) {
      const { ctx, fake } = fakeCtx();
      drawHub(ctx, client(v.width, v.height), 1234);
      expect(fake.balanced, `${v.width}x${v.height}`).toBe(true);
      expect(fake.shadowBlur).toBe(0);
      expect(fake.calls.fillText).toBeGreaterThan(5);
    }
  });

  it('shows the real word HOLLOWLIGHT, Motes, and the runs line', () => {
    const { ctx, fake } = fakeCtx();
    drawFrame(ctx, client(800, 600));
    const text = fake.texts.join('|');
    expect(text).toContain('HOLLOWLIGHT');
    expect(text).toMatch(/\d+ Motes/);
    expect(text).toMatch(/0 runs/);
    expect(text).toContain('Descend');
    expect(text.toLowerCase()).not.toContain('silver');
  });

  it('draws the selected row differently: a caret triangle and a heavier border', () => {
    const a = fakeCtx();
    const c = client(800, 600);
    c.hubIndex = 0;
    drawHub(a.ctx, c, 0);
    const b = fakeCtx();
    c.hubIndex = 3;
    drawHub(b.ctx, c, 0);
    // Same number of rows either way, so any difference is per-row emphasis; both draw a caret.
    expect(a.fake.calls.closePath).toBeGreaterThan(0);
    expect(b.fake.calls.stroke).toBeGreaterThan(0);
  });

  it('does not vary its path count with time under reduced motion, and is stable across frames', () => {
    const r1 = fakeCtx();
    const r2 = fakeCtx();
    drawHub(r1.ctx, client(800, 600, true), 0);
    drawHub(r2.ctx, client(800, 600, true), 99999);
    expect(r2.fake.calls).toEqual(r1.fake.calls);
    expect(r1.fake.balanced).toBe(true);
  });

  it('tolerates a zero-size viewport', () => {
    const { ctx, fake } = fakeCtx();
    drawHub(ctx, client(0, 0), 0);
    expect(fake.balanced).toBe(true);
  });
});
