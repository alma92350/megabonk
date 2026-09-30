/**
 * Upgrade icons: one bespoke painted icon per weapon, rite and item, plus the
 * gold-padding icon and a fallback. Icons are baked (atlas.ts) in two variants,
 * a 32-unit one with a heavier outline for the ~28 px loadout tiles and a
 * 64-unit one for the ~56 px cards, so both read at their size. Bake keys are
 * bounded: (icons + 2) x 2 variants.
 */

import type { Ctx2D } from '../ctx.js';
import { SpriteCache, browserSurfaceFactory, drawSprite, type SpriteDraw } from '../atlas.js';
import { FALLBACK_ICON, GOLD_ICON, ICON_IDS } from './keys.js';
import { withInk } from './paint.js';
import { paintBonker, paintDart, paintHalo } from './weapons.js';
import { paintEdge, paintFortune, paintFury, paintHide, paintWrath } from './rites.js';
import {
  paintBell, paintBoots, paintFallback, paintGauntlet, paintGold, paintLens, paintMagnet,
  paintPlating, paintSpurs, paintTonic, paintVacuum, paintWallet, paintWhetstone,
} from './items.js';

export { ICON_IDS, GOLD_ICON, FALLBACK_ICON, hasIcon, iconKey } from './keys.js';

type Painter = (ctx: Ctx2D) => void;

const PAINTERS: Readonly<Record<string, Painter>> = Object.freeze({
  bonker: paintBonker, dart: paintDart, halo: paintHalo,
  fury: paintFury, wrath: paintWrath, edge: paintEdge, hide: paintHide, fortune: paintFortune,
  boots: paintBoots, spurs: paintSpurs, plating: paintPlating, tonic: paintTonic,
  magnet: paintMagnet, vacuum: paintVacuum, wallet: paintWallet, gauntlet: paintGauntlet,
  lens: paintLens, bell: paintBell, whetstone: paintWhetstone,
  [GOLD_ICON]: paintGold, [FALLBACK_ICON]: paintFallback,
});

/** Every key that has a painter (all icon ids + gold + fallback). */
export const ALL_ICON_KEYS: readonly string[] = Object.freeze(Object.keys(PAINTERS));

/** Paint one icon in its 64-unit centred box. Used by the bake and by tests. */
export function paintIcon(ctx: Ctx2D, key: string, ink = 4.5): void {
  const p = PAINTERS[key] ?? paintFallback;
  withInk(ink, () => p(ctx));
}

const SMALL_BOX = 32;
const LARGE_BOX = 64;
/** Sizes up to this many px use the small (heavy-outline) bake. */
export const SMALL_MAX_PX = 40;

interface Baked {
  readonly keyS: string;
  readonly keyL: string;
  readonly drawS: SpriteDraw;
  readonly drawL: SpriteDraw;
}

const BAKED = new Map<string, Baked>();
for (const key of ALL_ICON_KEYS) {
  BAKED.set(key, {
    keyS: `icon:${key}:s`,
    keyL: `icon:${key}:l`,
    drawS: (ctx) => {
      ctx.scale(SMALL_BOX / 64, SMALL_BOX / 64);
      paintIcon(ctx, key, 6);
    },
    drawL: (ctx) => {
      ctx.scale(LARGE_BOX / 64, LARGE_BOX / 64);
      paintIcon(ctx, key, 4.4);
    },
  });
}
const FALLBACK_BAKED = BAKED.get(FALLBACK_ICON)!;

export const iconCache = new SpriteCache(browserSurfaceFactory(), { resolution: 2 });

/** Blit (or, without a surface, directly draw) an icon centred on (cx, cy). */
export function drawIcon(
  ctx: Ctx2D, key: string, cx: number, cy: number, size: number, cache: SpriteCache = iconCache,
): void {
  const b = BAKED.get(key) ?? FALLBACK_BAKED;
  if (size <= SMALL_MAX_PX) {
    drawSprite(ctx, cache, b.keyS, SMALL_BOX, SMALL_BOX, cx, cy, size / SMALL_BOX, false, b.drawS);
  } else {
    drawSprite(ctx, cache, b.keyL, LARGE_BOX, LARGE_BOX, cx, cy, size / LARGE_BOX, false, b.drawL);
  }
}

/** Upper bound on baked sprites this module can create. */
export const MAX_ICON_BAKES = ALL_ICON_KEYS.length * 2;

export { ICON_IDS as ICON_CONTENT_IDS };
