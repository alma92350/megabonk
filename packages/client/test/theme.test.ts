import { describe, expect, it } from 'vitest';
import { RARITIES } from '@megabonk/sim';
import { enemies } from '@megabonk/content';
import { RARITY_VISUALS, THEME, enemyVisual, rarityVisual } from '../src/render/theme.js';

describe('AC-19.1 rarity is conveyed by colour AND shape AND text', () => {
  it('covers every rarity the sim can produce', () => {
    for (const r of RARITIES) expect(RARITY_VISUALS[r]).toBeDefined();
    expect(Object.keys(RARITY_VISUALS).sort()).toEqual([...RARITIES].sort());
  });

  it('gives all five rarities a distinct colour', () => {
    const colours = RARITIES.map((r) => rarityVisual(r).color.toLowerCase());
    expect(new Set(colours).size).toBe(RARITIES.length);
  });

  it('gives all five rarities a distinct shape', () => {
    const shapes = RARITIES.map((r) => rarityVisual(r).shape);
    expect(new Set(shapes).size).toBe(RARITIES.length);
  });

  it('gives all five rarities a distinct text label', () => {
    const labels = RARITIES.map((r) => rarityVisual(r).label);
    expect(new Set(labels).size).toBe(RARITIES.length);
    for (const l of labels) expect(l.length).toBeGreaterThan(0);
  });

  it('gives all five rarities a distinct pip count as a fourth redundant cue', () => {
    const pips = RARITIES.map((r) => rarityVisual(r).pips);
    expect(new Set(pips).size).toBe(RARITIES.length);
    expect(pips).toEqual([...pips].sort((a, b) => a - b));
  });

  it('labels are uppercase and short enough not to clip at 150% text scale', () => {
    for (const r of RARITIES) {
      const v = rarityVisual(r);
      expect(v.label).toBe(v.label.toUpperCase());
      expect(v.label.length).toBeLessThanOrEqual(10);
    }
  });

  it('falls back to common for an unknown rarity instead of throwing', () => {
    expect(rarityVisual('mythic' as never)).toEqual(RARITY_VISUALS.common);
  });

  it('every colour is a parseable hex triple', () => {
    for (const r of RARITIES) expect(rarityVisual(r).color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe('enemy visuals', () => {
  it('gives each shipped enemy kind a distinct silhouette', () => {
    const kinds = ['grunt', 'runner', 'brute', 'lobber', 'swarmling', 'tank', 'warden', 'stalker', 'seer'];
    const shapes = kinds.map((k) => enemyVisual(k).shape);
    expect(new Set(shapes).size).toBe(kinds.length);
  });

  it('gives each shipped enemy kind a distinct body colour', () => {
    const kinds = ['grunt', 'runner', 'brute', 'lobber', 'swarmling', 'tank', 'warden'];
    const colours = kinds.map((k) => enemyVisual(k).body.toLowerCase());
    expect(new Set(colours).size).toBe(kinds.length);
  });

  it('makes the boss the largest', () => {
    // Footprint (sim hit radius x visual scale) is what the eye sees.
    const foot = (k: string): number => enemies[k]!.radius * enemyVisual(k).scale;
    const boss = foot('warden');
    for (const k of ['grunt', 'runner', 'brute', 'lobber', 'swarmling', 'tank']) {
      expect(foot(k)).toBeLessThan(boss);
    }
  });

  it('falls back for unknown kinds', () => {
    const v = enemyVisual('gribbly');
    expect(v.body).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(v.scale).toBeGreaterThan(0);
  });
});

describe('theme', () => {
  it('is a dark theme: the panel is much darker than the text', () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
    };
    expect(lum(THEME.panel)).toBeLessThan(0.3);
    expect(lum(THEME.text)).toBeGreaterThan(0.8);
    expect(lum(THEME.text) - lum(THEME.panel)).toBeGreaterThan(0.6);
  });
});

describe('ranged enemies look different because they behave differently', () => {
  it('gives ranged kinds the hooded imp / seer designs, melee kinds neither', () => {
    expect(enemyVisual('lobber').ranged).toBe(true);
    expect(enemyVisual('seer').ranged).toBe(true);
    expect(enemyVisual('grunt').ranged).toBe(false);
    expect(enemyVisual('lobber', true).shape).toBe('imp');
  });

  it('keeps the body colour so the archetype is still identifiable', () => {
    expect(enemyVisual('lobber', true).body).toBe(enemyVisual('lobber').body);
  });
});

describe('enemyVisual allocates nothing per entity per frame', () => {
  it('returns the same object for repeated melee lookups', () => {
    expect(enemyVisual('grunt')).toBe(enemyVisual('grunt'));
  });

  it('caches the ranged variant instead of spreading a new object each call', () => {
    expect(enemyVisual('lobber', true)).toBe(enemyVisual('lobber', true));
  });
});
