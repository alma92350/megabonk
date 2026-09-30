import { describe, expect, it } from 'vitest';
import { enemies } from '@megabonk/content';
import { SpriteCache, type Surface } from '../src/render/atlas.js';
import { FRAMES, animFrame, facingFor, phaseOf, resolveFacing } from '../src/render/creatures/anim.js';
import { contrastRatio, hueDistance, hueOf, luminance, saturationOf } from '../src/render/creatures/color.js';
import {
  BLUE_HUE_MAX, BLUE_HUE_MIN, GOLD_HUE_MAX, GOLD_HUE_MIN, SATURATED,
  ENEMY_VISUALS, MOSS_HUE_MAX, MOSS_HUE_MIN, RANGED_GLOW, enemyVisual, hasEnemyVisual,
  isFallbackVisual, type EnemyVisual,
} from '../src/render/creatures/visuals.js';
import {
  creatureKey, drawCreature, drawHero, heroKey, HERO_VARIANTS,
} from '../src/render/creatures/sprites.js';
import { PROJECTILE_CORE } from '../src/render/theme.js';
import { HERO_RIM, HERO_SIGNATURE } from '../src/render/creatures/hero.js';
import { CHEST_GLOW, MERCHANT_GLOW, PICKUP_VISUALS, SHRINE_TINTS } from '../src/render/props/palette.js';
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
  const lightness = (hex: string): number => luminance(hex);
  it('every pair differs by at least two of: silhouette, hue, value, size', () => {
    for (let i = 0; i < KINDS.length; i++) {
      for (let j = i + 1; j < KINDS.length; j++) {
        const A = KINDS[i]!, B = KINDS[j]!;
        const a = visualOf(A), b = visualOf(B);
        const ha = hueOf(a.body), hb = hueOf(b.body);
        const cues = [
          a.shape !== b.shape,
          (ha < 0) !== (hb < 0) || (ha >= 0 && hb >= 0 && hueDistance(ha, hb) >= 20),
          Math.abs(lightness(a.body) - lightness(b.body)) >= 0.04,
          Math.abs(footprint(A) - footprint(B)) / Math.max(footprint(A), footprint(B)) >= 0.15,
        ].filter(Boolean).length;
        expect(cues, `${A}/${B}`).toBeGreaterThanOrEqual(2);
        expect(a.shape, `${A}/${B} silhouette`).not.toBe(b.shape);
      }
    }
  });
});

describe('the meaning scheme: a colour means one thing', () => {
  const bodies = (): EnemyVisual[] => [...KINDS.map(visualOf), enemyVisual('x'), enemyVisual('x', true)];
  const chromatic = (c: string): boolean => hueOf(c) >= 0;
  const saturated = (c: string): boolean => chromatic(c) && saturationOf(c) >= SATURATED;

  it('no creature body sits in the blue/cyan band (that is XP, rare, fleetfoot: friendly)', () => {
    for (const v of bodies()) {
      const h = hueOf(v.body);
      if (h < 0) continue;
      expect(h < BLUE_HUE_MIN || h > BLUE_HUE_MAX, `${v.id} hue ${h.toFixed(0)}`).toBe(true);
    }
  });

  it('no saturated creature body reads as gold / reward', () => {
    for (const v of bodies()) {
      if (!saturated(v.body)) continue;
      const h = hueOf(v.body);
      expect(h < GOLD_HUE_MIN || h > GOLD_HUE_MAX, `${v.id} hue ${h.toFixed(0)}`).toBe(true);
    }
  });

  it('no saturated creature body is in the pink (incoming damage) arc', () => {
    for (const v of bodies()) {
      if (!saturated(v.body)) continue;
      expect(hueDistance(hueOf(v.body), hueOf(PROJECTILE_CORE)), v.id).toBeGreaterThanOrEqual(40);
    }
  });

  it('bodies are clay/mud, plum, iron grey or bone: low or violet saturation', () => {
    for (const v of bodies()) {
      const h = hueOf(v.body);
      const purple = h >= 255 && h <= 306;
      expect(!saturated(v.body) || purple, v.id).toBe(true);
    }
  });
});

describe('the hero owns a colour nothing else uses', () => {
  const heroHue = hueOf(HERO_SIGNATURE);
  it('is at least 35 degrees from every creature, pickup, shrine and the projectile', () => {
    const others: string[] = [PROJECTILE_CORE, CHEST_GLOW, MERCHANT_GLOW];
    for (const k of KINDS) for (const c of [visualOf(k).body, visualOf(k).accent]) if (hueOf(c) >= 0 && saturationOf(c) > 0.3) others.push(c);
    for (const p of Object.values(PICKUP_VISUALS)) others.push(p.core, p.glow);
    for (const t of Object.values(SHRINE_TINTS)) others.push(t.color);
    for (const c of others) {
      expect(hueDistance(heroHue, hueOf(c)), c).toBeGreaterThanOrEqual(35);
    }
  });

  it('is vivid enough to find in a crowd, and contrasts with the ground', () => {
    expect(saturationOf(HERO_SIGNATURE)).toBeGreaterThan(0.7);
    expect(contrastRatio(HERO_SIGNATURE, GROUND)).toBeGreaterThan(8);
  });

  it('has a light rim colour that no creature outline uses', () => {
    for (const k of KINDS) expect(visualOf(k).rim.toLowerCase()).not.toBe(HERO_RIM);
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
