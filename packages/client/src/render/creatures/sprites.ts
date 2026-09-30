/**
 * Baking and blitting creatures. Every creature frame is drawn once into an
 * offscreen surface and then blitted with a single drawImage per entity.
 *
 * Blits are the hot path, so they are made as cheap as a blit can be:
 *  - sprites are baked at their exact on-screen pixel size (per kind, per zoom),
 *    so the blit is 1:1 with no resampling;
 *  - facing left and facing right are baked separately, so there is no
 *    save / translate / scale / restore around the draw;
 *  - destination coordinates snap to whole device pixels.
 * Nothing on the per-entity path allocates: keys and draw closures are built once
 * per (visual, zoom) and looked up from maps and arrays.
 */

import { SpriteCache, browserSurfaceFactory, drawSprite, type Anchor, type SpriteDraw } from '../atlas.js';
import type { Ctx2D } from '../ctx.js';
import { FRAMES } from './anim.js';
import { BOXES, PAINTERS, type Box } from './enemies.js';
import { HERO_VARIANTS, heroPal, paintHero } from './hero.js';
import { makePose, palFor } from './paint.js';
import type { EnemyVisual } from './visuals.js';

export { HERO_VARIANTS };

function devicePixelRatio(): number {
  const dpr = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
  return typeof dpr === 'number' && dpr >= 1 ? Math.min(2, dpr) : 1;
}

const DPR = devicePixelRatio();

/** Module-level cache: one per page. Null factory (tests) means direct drawing. */
export const creatureCache = new SpriteCache(browserSurfaceFactory(), { resolution: DPR });

/** Smallest / largest baked unit in CSS pixels; bounds the number of distinct keys. */
const MIN_UNIT = 4;
const MAX_UNIT = 160;

function snap(v: number): number {
  return Math.round(v * DPR) / DPR;
}

/**
 * One baked set: FRAMES x variants x {right, left} sprites for a given pixel unit.
 * Index = ((variant * 2 + dir) * FRAMES + frame).
 */
interface SpriteSet {
  readonly keys: string[];
  readonly draws: SpriteDraw[];
  readonly anchors: Anchor[];
  readonly width: number;
  readonly height: number;
}

type Paint = (ctx: Ctx2D, frame: number, variant: number) => void;

function makeSet(prefix: string, box: Box, unit: number, variants: number, paint: Paint): SpriteSet {
  const keys: string[] = [];
  const draws: SpriteDraw[] = [];
  const anchors: Anchor[] = [];
  const width = Math.ceil((box.x1 - box.x0) * unit);
  const height = Math.ceil((box.y1 - box.y0) * unit);
  // Whole-pixel anchors: the feet land exactly on a pixel boundary.
  const ayPx = Math.round(-box.y0 * unit);
  const axRight = Math.round(-box.x0 * unit);
  const axLeft = width - axRight;
  for (let variant = 0; variant < variants; variant++) {
    for (let dir = 0; dir < 2; dir++) {
      for (let frame = 0; frame < FRAMES; frame++) {
        keys.push(`${prefix}:${unit}:${variant}:${dir}:${frame}`);
        draws.push((ctx) => {
          ctx.scale(dir === 1 ? -unit : unit, unit);
          paint(ctx, frame, variant);
        });
        anchors.push({ ax: (dir === 1 ? axLeft : axRight) / width, ay: ayPx / height });
      }
    }
  }
  return { keys, draws, anchors, width, height };
}

function unitOf(px: number): number {
  const u = Math.round(px);
  return u < MIN_UNIT ? MIN_UNIT : u > MAX_UNIT ? MAX_UNIT : u;
}

const sets = new Map<string, Map<number, SpriteSet>>();

function setFor(v: EnemyVisual, unit: number): SpriteSet {
  let byUnit = sets.get(v.id);
  if (byUnit === undefined) {
    byUnit = new Map();
    sets.set(v.id, byUnit);
  }
  let s = byUnit.get(unit);
  if (s === undefined) {
    const painter = PAINTERS[v.shape];
    s = makeSet(`c:${v.id}`, BOXES[v.shape], unit, 2, (ctx, frame, variant) =>
      painter(makePose(ctx, palFor(v, variant === 1 ? 1 : 0), frame, FRAMES)));
    byUnit.set(unit, s);
  }
  return s;
}

function index(variant: number, flip: boolean, frame: number): number {
  return (variant * 2 + (flip ? 1 : 0)) * FRAMES + frame;
}

/** Cache key for a creature frame (exposed for tests and key-budget checks). */
export function creatureKey(v: EnemyVisual, frame: number, flash: boolean, flipX = false, unitPx = 24): string {
  return setFor(v, unitOf(unitPx)).keys[index(flash ? 1 : 0, flipX, frame)]!;
}

/**
 * Draw one creature. `unitPx` is screen pixels per sprite unit (hit radius times
 * the visual's scale times zoom). `scale` is 1 except for the death swell. One
 * drawImage when baked.
 */
export function drawCreature(
  ctx: Ctx2D, cache: SpriteCache, v: EnemyVisual, frame: number, flash: boolean,
  x: number, y: number, unitPx: number, flipX: boolean, scale = 1,
): void {
  const unit = unitOf(unitPx);
  const s = setFor(v, unit);
  const i = index(flash ? 1 : 0, flipX, frame);
  drawSprite(
    ctx, cache, s.keys[i]!, s.width, s.height, snap(x), snap(y), scale, false, s.draws[i]!, s.anchors[i]!,
  );
}

// ---- hero -----------------------------------------------------------------

const HERO_BOX: Box = { x0: -2.95, x1: 2.75, y0: -3.95, y1: 0.5 };
const heroSets = new Map<number, SpriteSet>();

function heroSet(unit: number): SpriteSet {
  let s = heroSets.get(unit);
  if (s === undefined) {
    s = makeSet('hero', HERO_BOX, unit, HERO_VARIANTS, (ctx, frame, variant) =>
      paintHero(makePose(ctx, heroPal(variant as 0 | 1 | 2), frame, FRAMES), variant as 0 | 1 | 2));
    heroSets.set(unit, s);
  }
  return s;
}

export function heroKey(frame: number, variant: number, flipX = false, unitPx = 24): string {
  return heroSet(unitOf(unitPx)).keys[index(variant, flipX, frame)]!;
}

/** variant: 0 normal, 1 flash, 2 hurt. */
export function drawHero(
  ctx: Ctx2D, cache: SpriteCache, frame: number, variant: number,
  x: number, y: number, unitPx: number, flipX: boolean,
): void {
  const s = heroSet(unitOf(unitPx));
  const i = index(variant, flipX, frame);
  drawSprite(ctx, cache, s.keys[i]!, s.width, s.height, snap(x), snap(y), 1, false, s.draws[i]!, s.anchors[i]!);
}
