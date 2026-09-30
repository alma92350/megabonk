import { describe, expect, it } from 'vitest';
import { enemies } from '@megabonk/content';
import { SpriteCache, type Surface } from '../src/render/atlas.js';
import { FRAMES, animFrame, facingFor, phaseOf, resolveFacing } from '../src/render/creatures/anim.js';
import { contrastRatio, hueDistance, hueOf } from '../src/render/creatures/color.js';
import {
  ENEMY_VISUALS, MOSS_HUE_MAX, MOSS_HUE_MIN, RANGED_GLOW, enemyVisual, hasEnemyVisual,
  isFallbackVisual, type EnemyVisual,
} from '../src/render/creatures/visuals.js';
import {
  creatureKey, drawCreature, drawHero, heroKey, HERO_VARIANTS,
} from '../src/render/creatures/sprites.js';
import { PROJECTILE_CORE } from '../src/render/theme.js';
import { drawFrame } from '../src/render/renderer.js';
import { GameClient } from '../src/app.js';
import { fakeCtx } from './fake-ctx.js';

/** The ground colour of the first biome, and the one hostile creatures must beat. */
const GROUND = '#1d2a22';
const KINDS = Object.keys(enemies);
const visualOf = (k: string): EnemyVisual => enemyVisual(k, enemies[k]?.ranged !== undefined);
/** Documented thresholds: bodies read against the ground at >= 2.0:1, rims at >= 6:1. */
const MIN_BODY_CONTRAST = 2.0;
const MIN_RIM_CONTRAST = 6;
const footprint = (k: string): number => enemies[k]!.radius * visualOf(k).scale;

describe('roster coverage', () => {
  it('every content enemy has its own designed (non-fallback) visual', () => {
    for (const k of KINDS) {
      expect(hasEnemyVisual(k), k).toBe(true);
      expect(isFallbackVisual(visualOf(k)), k).toBe(false);
    }
  });

  it('stalker and seer, which used to have no entry, are covered', () => {
    expect(hasEnemyVisual('stalker')).toBe(true);
    expect(hasEnemyVisual('seer')).toBe(true);
  });

  it('unknown kinds still render as a generic eyed monster, ranged ones with the cue', () => {
    expect(isFallbackVisual(enemyVisual('gribbly'))).toBe(true);
    expect(enemyVisual('gribbly').ranged).toBe(false);
    expect(enemyVisual('gribbly', true).ranged).toBe(true);
    expect(enemyVisual('constructor')).toBe(enemyVisual('nothing'));
  });
});

describe('distinct silhouette + colour family', () => {
  it('every pair differs in shape, and in hue (>= 20 deg) or achromatic tone or footprint', () => {
    for (let i = 0; i < KINDS.length; i++) {
      for (let j = i + 1; j < KINDS.length; j++) {
        const a = visualOf(KINDS[i]!), b = visualOf(KINDS[j]!);
        expect(a.shape, `${a.id}/${b.id} shape`).not.toBe(b.shape);
        const ha = hueOf(a.body), hb = hueOf(b.body);
        let colourApart: boolean;
        if (ha < 0 || hb < 0) colourApart = ha !== hb || Math.abs(a.scale - b.scale) > 0.1;
        else colourApart = hueDistance(ha, hb) >= 20;
        const sizeApart = Math.abs(footprint(KINDS[i]!) - footprint(KINDS[j]!)) / Math.max(footprint(KINDS[i]!), footprint(KINDS[j]!)) >= 0.15;
        expect(colourApart || sizeApart, `${a.id}/${b.id} colour or size`).toBe(true);
      }
    }
  });

  it('hues are spread: no two chromatic bodies closer than 15 degrees', () => {
    const hues = KINDS.map((k) => ({ k, h: hueOf(visualOf(k).body) })).filter((x) => x.h >= 0);
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        expect(hueDistance(hues[i]!.h, hues[j]!.h), `${hues[i]!.k}/${hues[j]!.k}`).toBeGreaterThanOrEqual(15);
      }
    }
  });
});

describe('contrast with the moss-green ground', () => {
  it('no hostile body or shade sits in the moss hue band', () => {
    const all = [...KINDS.map(visualOf), enemyVisual('x'), enemyVisual('x', true)];
    for (const v of all) {
      for (const c of [v.body, v.shade, v.light, v.rim]) {
        const h = hueOf(c);
        if (h < 0) continue;
        expect(h < MOSS_HUE_MIN || h > MOSS_HUE_MAX, `${v.id} ${c} hue ${h.toFixed(0)}`).toBe(true);
      }
    }
  });

  it(`bodies clear ${MIN_BODY_CONTRAST}:1 and rims ${MIN_RIM_CONTRAST}:1 against the ground`, () => {
    for (const v of [...KINDS.map(visualOf), enemyVisual('x'), enemyVisual('x', true)]) {
      expect(contrastRatio(v.body, GROUND), `${v.id} body`).toBeGreaterThanOrEqual(MIN_BODY_CONTRAST);
      expect(contrastRatio(v.rim, GROUND), `${v.id} rim`).toBeGreaterThanOrEqual(MIN_RIM_CONTRAST);
    }
  });
});

describe('ranged cue', () => {
  it('ranged kinds share it and melee kinds do not, matching the sim data', () => {
    for (const k of KINDS) expect(visualOf(k).ranged, k).toBe(enemies[k]!.ranged !== undefined);
    expect(KINDS.filter((k) => visualOf(k).ranged).sort()).toEqual(['lobber', 'seer']);
  });

  it('the cue glow is not the projectile pink, so a creature never reads as a shot', () => {
    expect(hueDistance(hueOf(RANGED_GLOW), hueOf(PROJECTILE_CORE))).toBeGreaterThanOrEqual(30);
  });

  it('no creature BODY hue is within 40 degrees of the projectile hue', () => {
    for (const v of [...KINDS.map(visualOf), enemyVisual('x'), enemyVisual('x', true)]) {
      const h = hueOf(v.body);
      if (h < 0) continue;
      expect(hueDistance(h, hueOf(PROJECTILE_CORE)), v.id).toBeGreaterThanOrEqual(40);
    }
  });
});

describe('size hierarchy', () => {
  it('footprint follows threat: swarmling < grunt/runner < stalker < brute < tank < boss', () => {
    const f = footprint;
    expect(f('swarmling')).toBeLessThan(f('runner'));
    expect(f('runner')).toBeLessThan(f('grunt'));
    expect(f('grunt')).toBeLessThan(f('stalker'));
    expect(f('stalker')).toBeLessThan(f('brute'));
    expect(f('brute')).toBeLessThan(f('tank'));
    expect(f('tank')).toBeLessThan(f('warden'));
  });

  it('a body is never smaller than its hitbox nor wildly larger', () => {
    for (const k of KINDS) {
      const s = visualOf(k).scale;
      expect(s, k).toBeGreaterThanOrEqual(1);
      expect(s, k).toBeLessThanOrEqual(1.6);
    }
  });
});

describe('animation', () => {
  it('frame selection is deterministic and in range', () => {
    for (let t = 0; t < 5000; t += 37) {
      for (const id of [0, 1, 7, 12345, -3]) {
        const f = animFrame(t, id, 120, false);
        expect(f).toBe(animFrame(t, id, 120, false));
        expect(Number.isInteger(f) && f >= 0 && f < FRAMES).toBe(true);
      }
    }
  });

  it('is per-entity phased: a crowd is not in lockstep', () => {
    const seen = new Set<number>();
    for (let id = 1; id <= 64; id++) seen.add(animFrame(1000, id, 120, false));
    expect(seen.size).toBe(FRAMES);
    const phases = new Set<number>();
    for (let id = 1; id <= 64; id++) phases.add(phaseOf(id));
    expect(phases.size).toBeGreaterThan(40);
  });

  it('cycles through every frame over time', () => {
    const seen = new Set<number>();
    for (let t = 0; t < 1000; t += 10) seen.add(animFrame(t, 5, 100, false));
    expect(seen.size).toBe(FRAMES);
  });

  it('reduced motion pins the pose', () => {
    for (let t = 0; t < 2000; t += 50) expect(animFrame(t, 9, 100, true)).toBe(0);
  });

  it('allocates nothing: results are primitives, and visuals are shared objects', () => {
    expect(typeof animFrame(10, 1, 100, false)).toBe('number');
    expect(enemyVisual('grunt')).toBe(enemyVisual('grunt'));
    expect(creatureKey(enemyVisual('grunt'), 1, false)).toBe(creatureKey(enemyVisual('grunt'), 1, false));
  });
});

describe('facing', () => {
  it('follows horizontal movement', () => {
    expect(resolveFacing(0.05, -1)).toBe(1);
    expect(resolveFacing(-0.05, 1)).toBe(-1);
  });

  it('holds the last facing when still or moving only vertically', () => {
    expect(resolveFacing(0, 1)).toBe(1);
    expect(resolveFacing(0.001, -1)).toBe(-1);
  });

  it('per-entity memory: starts toward the player, then holds', () => {
    expect(facingFor(910001, 0, -1)).toBe(-1);
    expect(facingFor(910001, 0, 1)).toBe(-1);
    expect(facingFor(910001, 0.1, 1)).toBe(1);
    expect(facingFor(910001, 0, -1)).toBe(1);
  });
});

function countingFactory(): { factory: (w: number, h: number) => Surface; made: () => number } {
  let n = 0;
  return {
    made: () => n,
    factory: (width, height) => {
      n++;
      return { width, height, getContext: () => fakeCtx().ctx };
    },
  };
}

describe('sprite bake keys', () => {
  it('are stable and bounded over a 600-frame run of every kind', () => {
    const keys = new Set<string>();
    const kinds = [...KINDS, 'unknown-a', 'unknown-b'];
    for (let frame = 0; frame < 600; frame++) {
      for (let id = 1; id <= 40; id++) {
        const v = enemyVisual(kinds[id % kinds.length]!, id % 2 === 0);
        const f = animFrame(frame * 16.7, id, v.frameMs, false);
        keys.add(creatureKey(v, f, id % 7 === 0, id % 3 === 0, 32));
      }
    }
    // (kinds + 2 fallbacks) * frames * {normal, flash} * {right, left}
    expect(keys.size).toBeLessThanOrEqual((KINDS.length + 2) * FRAMES * 2 * 2);
    expect(keys.size).toBeLessThan(200);
  });

  it('bake once per key and then blit', () => {
    const { factory, made } = countingFactory();
    const cache = new SpriteCache(factory);
    const { ctx, fake } = fakeCtx();
    const v = enemyVisual('brute');
    for (let i = 0; i < 50; i++) drawCreature(ctx, cache, v, i % 2, false, 100, 100, 30, i % 3 === 0);
    expect(made()).toBe(4); // frames 0 and 1, facing right and left
    expect(fake.calls.drawImage).toBe(50);
    expect(fake.calls.save ?? 0).toBe(0); // no per-blit state changes: mirroring is baked
    expect(fake.balanced).toBe(true);
  });

  it('hero keys are bounded too', () => {
    const keys = new Set<string>();
    for (let f = 0; f < FRAMES; f++) for (let vr = 0; vr < HERO_VARIANTS; vr++) for (const fl of [false, true]) keys.add(heroKey(f, vr, fl, 20));
    expect(keys.size).toBe(FRAMES * HERO_VARIANTS * 2);
  });
});

describe('the draw path', () => {
  it('draws every creature and the hero directly (no surfaces) with balanced save/restore', () => {
    const cache = new SpriteCache(null);
    const { ctx, fake } = fakeCtx();
    const all = [...KINDS.map(visualOf), enemyVisual('zzz'), enemyVisual('zzz', true)];
    for (const v of all) {
      for (let f = 0; f < FRAMES; f++) {
        drawCreature(ctx, cache, v, f, false, 50, 50, 1, false);
        drawCreature(ctx, cache, v, f, true, 50, 50, 1, true);
      }
    }
    for (let f = 0; f < FRAMES; f++) for (let vr = 0; vr < HERO_VARIANTS; vr++) drawHero(ctx, cache, f, vr, 50, 50, 1, f % 2 === 0);
    expect(fake.balanced).toBe(true);
    expect(fake.shadowBlur).toBe(0);
    expect(fake.calls.fill).toBeGreaterThan(200);
  });

  it('a whole frame with many enemies stays balanced and never touches shadowBlur', () => {
    const { ctx, fake } = fakeCtx();
    const c = new GameClient({ storage: null, viewport: { width: 960, height: 600 }, seedSource: () => 7 });
    c.startRun();
    for (let i = 0; i < 1500; i++) c.advance(1000 / 60);
    drawFrame(ctx, c);
    expect(fake.balanced).toBe(true);
    expect(fake.shadowBlur).toBe(0);
  });
});

it('every visual is a well-formed table row', () => {
  for (const v of Object.values(ENEMY_VISUALS)) {
    for (const c of [v.body, v.shade, v.light, v.rim, v.accent, v.dark]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(v.frameMs).toBeGreaterThan(30);
    expect(v.height).toBeGreaterThan(1);
  }
});
