import { describe, expect, it } from 'vitest';
import { createRun } from '@megabonk/sim';
import { content, makeRunConfig } from '@megabonk/content';
import { SpriteCache, type Surface } from '../src/render/atlas.js';
import type { Ctx2D } from '../src/render/ctx.js';
import {
  ALL_ICON_KEYS, FALLBACK_ICON, GOLD_ICON, ICON_IDS, MAX_ICON_BAKES, drawIcon, hasIcon, iconCache,
  iconKey, paintIcon,
} from '../src/render/icons/index.js';
import { buildHud } from '../src/hud.js';
import { FakeCtx, fakeCtx } from './fake-ctx.js';

/** A recording ctx: logs every call and every property set, so icons can be compared. */
function record(fn: (ctx: Ctx2D) => void): { log: string[]; sets: Map<string, string[]> } {
  const log: string[] = [];
  const sets = new Map<string, string[]>();
  const props: Record<string, unknown> = {};
  const fmt = (v: unknown): string => (typeof v === 'number' ? String(Math.round(v * 10) / 10) : String(v));
  const proxy = new Proxy({}, {
    get(_t, prop: string) {
      if (prop in props) return props[prop];
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => {} });
      }
      return (...args: unknown[]) => { log.push(`${prop}(${args.map(fmt).join(',')})`); };
    },
    set(_t, prop: string, value: unknown) {
      props[prop] = value;
      const list = sets.get(prop) ?? [];
      list.push(fmt(value));
      sets.set(prop, list);
      log.push(`${prop}=${fmt(value)}`);
      return true;
    },
  });
  fn(proxy as unknown as Ctx2D);
  return { log, sets };
}

const PATH_OPS = /^(moveTo|lineTo|arc|ellipse|quadraticCurveTo)\(/;

function geometry(log: readonly string[]): Set<string> {
  return new Set(log.filter((l) => PATH_OPS.test(l)));
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

function fakeSurfaceFactory() {
  return (w: number, h: number): Surface => {
    const ctx = new FakeCtx();
    return { width: w, height: h, getContext: () => ctx as unknown as Ctx2D };
  };
}

describe('icon coverage: every upgrade has its own icon', () => {
  it('every weapon, rite and item in the content bundle has a non-fallback icon', () => {
    const ids = [
      ...Object.keys(content.weapons).map((id) => ['weapon', id] as const),
      ...Object.keys(content.tomes).map((id) => ['tome', id] as const),
      ...Object.keys(content.items).map((id) => ['item', id] as const),
    ];
    expect(ids.length).toBeGreaterThanOrEqual(19);
    for (const [kind, id] of ids) {
      expect(iconKey(kind, id), `${kind}:${id} would show the fallback icon`).not.toBe(FALLBACK_ICON);
      expect(hasIcon(id), `${kind}:${id}`).toBe(true);
    }
  });

  it('there is no orphan icon for content that no longer exists', () => {
    const real = new Set([
      ...Object.keys(content.weapons), ...Object.keys(content.tomes), ...Object.keys(content.items),
    ]);
    for (const id of ICON_IDS) expect(real.has(id), `icon ${id} has no content`).toBe(true);
  });

  it('gold padding gets the gold icon; unknown ids get the fallback', () => {
    expect(iconKey('gold', 'gold')).toBe(GOLD_ICON);
    expect(iconKey('weapon', 'not-a-real-id')).toBe(FALLBACK_ICON);
    expect(iconKey('', '')).toBe(FALLBACK_ICON);
  });

  it('every key has a painter, and the gold and fallback icons are among them', () => {
    for (const id of ICON_IDS) expect(ALL_ICON_KEYS).toContain(id);
    expect(ALL_ICON_KEYS).toContain(GOLD_ICON);
    expect(ALL_ICON_KEYS).toContain(FALLBACK_ICON);
  });
});

describe('icons are pairwise distinct by what they draw', () => {
  const recs = new Map(ALL_ICON_KEYS.map((k) => [k, record((c) => paintIcon(c, k))]));

  it('draw-call signatures differ for every pair', () => {
    const seen = new Map<string, string>();
    for (const [k, r] of recs) {
      const sig = r.log.join('|');
      expect(seen.get(sig), `${k} draws exactly the same as ${seen.get(sig)}`).toBeUndefined();
      seen.set(sig, k);
    }
  });

  it('path geometry overlaps little between any two icons', () => {
    const keys = [...recs.keys()];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = geometry(recs.get(keys[i]!)!.log);
        const b = geometry(recs.get(keys[j]!)!.log);
        // Rites share one wax seal by design (the seal says "Rite"), so they are
        // allowed more overlap with each other than unrelated icons are.
        const bothRites = ['fury', 'wrath', 'edge', 'hide', 'fortune'].includes(keys[i]!) &&
          ['fury', 'wrath', 'edge', 'hide', 'fortune'].includes(keys[j]!);
        const limit = bothRites ? 0.85 : 0.35;
        expect(jaccard(a, b), `${keys[i]} vs ${keys[j]}`).toBeLessThan(limit);
      }
    }
  });

  it('rites differ from each other in colour as well as shape', () => {
    const rites = ['fury', 'wrath', 'edge', 'hide', 'fortune'];
    const palettes = rites.map((k) => new Set(recs.get(k)!.sets.get('fillStyle') ?? []));
    for (let i = 0; i < rites.length; i++) {
      for (let j = i + 1; j < rites.length; j++) {
        expect(jaccard(palettes[i]!, palettes[j]!), `${rites[i]} vs ${rites[j]}`).toBeLessThan(0.9);
      }
    }
  });

  it('every icon has a thick ink outline and uses no shadowBlur', () => {
    for (const [k, r] of recs) {
      expect(r.sets.get('shadowBlur'), `${k} sets shadowBlur`).toBeUndefined();
      const widths = (r.sets.get('lineWidth') ?? []).map(Number);
      expect(Math.max(...widths), `${k} has no bold outline`).toBeGreaterThanOrEqual(4);
      expect(r.sets.get('strokeStyle') ?? [], k).toContain('#05090b');
    }
  });

  it('save and restore are balanced', () => {
    for (const k of ALL_ICON_KEYS) {
      const { ctx, fake } = fakeCtx();
      paintIcon(ctx, k);
      expect(fake.balanced, k).toBe(true);
    }
  });
});

describe('drawIcon: baked, bounded, and safe without a surface', () => {
  it('with a null surface factory it draws directly, balanced, with no blur', () => {
    const cache = new SpriteCache(null);
    for (const k of [...ALL_ICON_KEYS, 'no-such-icon']) {
      for (const size of [28, 56]) {
        const { ctx, fake } = fakeCtx();
        drawIcon(ctx, k, 100, 100, size, cache);
        expect(fake.balanced, `${k}@${size}`).toBe(true);
        expect(fake.shadowBlur).toBe(0);
        expect((fake.calls.fill ?? 0) + (fake.calls.stroke ?? 0)).toBeGreaterThan(0);
        expect(fake.calls.drawImage ?? 0).toBe(0);
      }
    }
  });

  it('with a surface it bakes once and blits with a single drawImage', () => {
    const cache = new SpriteCache(fakeSurfaceFactory());
    const { ctx, fake } = fakeCtx();
    drawIcon(ctx, 'bonker', 50, 50, 28, cache);
    drawIcon(ctx, 'bonker', 90, 50, 28, cache);
    expect(fake.calls.drawImage).toBe(2);
    expect(cache.size).toBe(1);
    expect(fake.balanced).toBe(true);
  });

  it('small and large sizes use separate bakes so each reads at its size', () => {
    const cache = new SpriteCache(fakeSurfaceFactory());
    const { ctx } = fakeCtx();
    drawIcon(ctx, 'boots', 0, 0, 28, cache);
    drawIcon(ctx, 'boots', 0, 0, 56, cache);
    drawIcon(ctx, 'boots', 0, 0, 60, cache);
    expect(cache.size).toBe(2);
  });

  it('bake keys are bounded however many sizes and unknown ids are drawn', () => {
    const cache = new SpriteCache(fakeSurfaceFactory());
    const { ctx } = fakeCtx();
    for (let i = 0; i < 400; i++) {
      const key = i % 3 === 0 ? `ghost-${i}` : ALL_ICON_KEYS[i % ALL_ICON_KEYS.length]!;
      drawIcon(ctx, key, 0, 0, 20 + (i % 60), cache);
    }
    expect(cache.size).toBeLessThanOrEqual(MAX_ICON_BAKES);
  });

  it('the shared icon cache also survives a node environment (no surface)', () => {
    const { ctx, fake } = fakeCtx();
    expect(() => drawIcon(ctx, 'halo', 10, 10, 56)).not.toThrow();
    expect(fake.balanced).toBe(true);
    expect(iconCache.size).toBeLessThanOrEqual(MAX_ICON_BAKES);
  });
});

describe('loadout model carries an icon key and a badge for every held entry', () => {
  it('weapons, rites and items each get their icon and level/stack badge', () => {
    const state = createRun(makeRunConfig(5));
    const held = {
      ...state,
      player: {
        ...state.player,
        items: [
          { id: 'fury', rarity: 'rare' as const, stacks: 3 },
          { id: 'boots', rarity: 'common' as const, stacks: 2 },
          { id: 'ghost', rarity: 'epic' as const, stacks: 1 },
        ],
      },
    };
    const hud = buildHud(held, content);
    const all = [...hud.weapons, ...hud.tomes, ...hud.items];
    expect(all).toHaveLength(held.player.weapons.length + 3);
    for (const e of all) {
      expect(typeof e.icon).toBe('string');
      expect(e.icon.length).toBeGreaterThan(0);
      expect(e.badge).toMatch(/^(L|×)\d+$/);
    }
    expect(hud.weapons[0]!.icon).toBe(hud.weapons[0]!.id);
    expect(hud.weapons[0]!.badge).toBe(`L${hud.weapons[0]!.level}`);
    expect(hud.tomes[0]).toMatchObject({ id: 'fury', icon: 'fury', badge: '×3' });
    expect(hud.items.find((e) => e.id === 'boots')).toMatchObject({ icon: 'boots', badge: '×2' });
    // Content the client has no icon for still resolves to something drawable.
    expect(hud.items.find((e) => e.id === 'ghost')!.icon).toBe(FALLBACK_ICON);
  });
});
