/**
 * Pure geometry for the title / hub scene: where the logo, the menu column and
 * the cast stand for a given viewport. No canvas, no fonts, no state.
 *
 * Text widths depend on the font the browser ends up with, so, like layout.ts,
 * nothing here is tuned to a measured width. Things are separated vertically
 * (each text line owns a rect and the rects are stacked), and the draw code
 * shrinks or ellipsises text into the rect it was given. The tests assert that
 * the rects never intersect and never leave the viewport.
 */

import { BOXES } from '../creatures/enemies.js';
import type { EnemyShape } from '../creatures/visuals.js';
import type { Viewport } from '../projection.js';

export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export interface TextLine extends Rect {
  readonly size: number;
  readonly align: 'left' | 'center';
}

export type CastId = 'boss' | 'hero' | 'grunt' | 'runner' | 'stalker' | 'lobber' | 'swarmling';

export interface CastMember {
  readonly id: CastId;
  /** Enemy kind for creatures; the hero is drawn with the hero sprite. */
  readonly kind: string;
  /** Far members stand behind the mist; near ones in front of it. */
  readonly layer: 'far' | 'near';
  readonly feetX: number;
  readonly feetY: number;
  /** Screen pixels per sprite unit (an integer, as the sprite baker wants). */
  readonly unit: number;
  readonly flip: boolean;
  /** The sprite's footprint on screen; always inside the cast area. */
  readonly box: Rect;
}

export interface HubTree {
  readonly x: number;
  readonly baseY: number;
  readonly radius: number;
  readonly height: number;
  readonly zoom: number;
}

export interface HubGeometry {
  readonly compact: boolean;
  readonly ui: number;
  readonly pad: number;
  readonly logo: Rect;
  readonly logoFontPx: number;
  /** Where the lantern mark sits, left of the lettering. */
  readonly lantern: { readonly cx: number; readonly cy: number; readonly size: number };
  /** The lettering's box: left edge and the widest it may be. */
  readonly logoText: Rect;
  readonly tagline: TextLine;
  readonly motes: TextLine;
  readonly stats: TextLine;
  readonly menu: Rect;
  readonly rows: readonly Rect[];
  readonly hint: TextLine;
  readonly notice: TextLine;
  /** The area the cast stands in. */
  readonly scene: Rect;
  readonly horizonY: number;
  readonly cast: readonly CastMember[];
  readonly trees: readonly HubTree[];
  /** Everything the menu column claims, for scrims and collision tests. */
  readonly column: Rect;
}

/** Bounded, stable key for the baked scene: changes only with the viewport size. */
export function hubBakeKey(view: Viewport): string {
  return `hub:${Math.max(1, Math.round(view.width))}x${Math.max(1, Math.round(view.height))}`;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Width of the capitals in "HOLLOWLIGHT" per em of font size, generously (bold, outlined). */
const LOGO_EM = 11 * 0.72;
/** The lantern mark and its gap, in em. */
const LANTERN_EM = 1.0;

const HERO_BOX = { x0: -2.95, x1: 2.75, y0: -3.95, y1: 0.5 } as const;

interface Spec {
  readonly id: CastId;
  readonly kind: string;
  readonly shape: EnemyShape | 'hero';
  readonly layer: 'far' | 'near';
  readonly fx: number;
  readonly fy: number;
  /** Desired footprint as a fraction of the scene's height and width. */
  readonly fh: number;
  readonly fw: number;
  readonly flip: boolean;
}

const CAST: readonly Spec[] = [
  { id: 'boss', kind: 'warden', shape: 'warden', layer: 'far', fx: 0.42, fy: 0.62, fh: 0.64, fw: 0.56, flip: false },
  { id: 'stalker', kind: 'stalker', shape: 'wolf', layer: 'far', fx: 0.13, fy: 0.6, fh: 0.2, fw: 0.24, flip: false },
  { id: 'lobber', kind: 'lobber', shape: 'imp', layer: 'far', fx: 0.9, fy: 0.62, fh: 0.22, fw: 0.16, flip: true },
  { id: 'swarmling', kind: 'swarmling', shape: 'bug', layer: 'near', fx: 0.44, fy: 0.9, fh: 0.12, fw: 0.16, flip: false },
  { id: 'grunt', kind: 'grunt', shape: 'goblin', layer: 'near', fx: 0.14, fy: 0.84, fh: 0.2, fw: 0.22, flip: false },
  { id: 'runner', kind: 'runner', shape: 'fox', layer: 'near', fx: 0.9, fy: 0.84, fh: 0.16, fw: 0.2, flip: true },
  { id: 'hero', kind: 'hero', shape: 'hero', layer: 'near', fx: 0.66, fy: 0.9, fh: 0.46, fw: 0.38, flip: true },
];

function boxOf(shape: EnemyShape | 'hero'): { x0: number; x1: number; y0: number; y1: number } {
  return shape === 'hero' ? HERO_BOX : BOXES[shape];
}

function place(spec: Spec, R: Rect, boost: number): CastMember {
  const b = boxOf(spec.shape);
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;
  const wantH = R.h * spec.fh * boost;
  const wantW = R.w * spec.fw * boost;
  // Never larger than what fits the scene, whatever the boost asked for.
  const fitU = Math.min(R.h / bh, R.w / bw) * 0.98;
  let unit = Math.floor(Math.min(wantH / bh, wantW / bw, fitU));
  unit = clamp(unit, 4, 160);
  const w = bw * unit;
  const h = bh * unit;
  // A flipped sprite mirrors its x extents about the feet.
  const left = spec.flip ? -b.x1 * unit : b.x0 * unit;
  let feetX = R.x + R.w * spec.fx;
  let feetY = R.y + R.h * spec.fy;
  feetX = clamp(feetX, R.x - left, R.x + R.w - left - w);
  feetY = clamp(feetY, R.y - b.y0 * unit, R.y + R.h - b.y1 * unit);
  return {
    id: spec.id, kind: spec.kind, layer: spec.layer, feetX, feetY, unit, flip: spec.flip,
    box: { x: feetX + left, y: feetY + b.y0 * unit, w, h },
  };
}

/** Small deterministic hash in [0, 1). */
function unitHash(i: number, salt: number): number {
  let h = Math.imul((i + 1) * 374761393 + salt * 668265263, 2246822519) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function makeTrees(view: Viewport, horizonY: number, compact: boolean): HubTree[] {
  const { width: W, height: H } = view;
  const z0 = clamp(H / 22, 20, 60);
  const out: HubTree[] = [];
  const n = Math.max(5, Math.ceil(W / 120));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5 + (unitHash(i, 1) - 0.5) * 0.5) / n;
    out.push({
      x: t * W,
      baseY: horizonY + 6 + unitHash(i, 2) * 10,
      radius: 1.3 + unitHash(i, 3) * 0.7,
      height: 3 + unitHash(i, 4) * 0.5,
      zoom: z0 * (0.5 + unitHash(i, 5) * 0.12),
    });
  }
  // A framing rock at the right edge on wide screens (the left is the menu column).
  if (!compact) out.push({ x: W * 0.99, baseY: H * 1.0, radius: 2.4, height: 3.5, zoom: z0 * 1.15 });
  return out;
}

export function hubGeometry(entryCount: number, view: Viewport): HubGeometry {
  const W = Math.max(1, view.width);
  const H = Math.max(1, view.height);
  const compact = W < 640 || H > W * 1.1;
  const ui = clamp(Math.min(W / 1100, H / 760), 0.85, 1.4);
  const pad = compact ? clamp(Math.round(W * 0.045), 14, 32) : clamp(Math.round(W * 0.045), 20, 72);
  const n = Math.max(1, entryCount);

  const colW = compact ? Math.min(W - 2 * pad, 560) : clamp(Math.round(W * 0.4), 340, 560);
  const colX = compact ? Math.round((W - colW) / 2) : pad;
  const align: 'left' | 'center' = compact ? 'center' : 'left';

  const logoFontPx = Math.floor(colW / (LOGO_EM + LANTERN_EM));
  const logoH = Math.round(logoFontPx * 1.3);
  const taglineSize = Math.round(13 * ui);
  const motesSize = Math.round(17 * ui);
  const statsSize = Math.round(12.5 * ui);
  const hintSize = Math.max(12, Math.round(12 * ui));
  const taglineH = taglineSize + 8;
  const motesH = motesSize + 8;
  const statsH = statsSize + 8;
  const hintH = hintSize + 6;
  const gapS = Math.round(6 * ui);
  const gapL = Math.round(12 * ui);
  const rowGap = compact ? 6 : Math.round(8 * ui);
  let rowH = compact ? 48 : Math.round(56 * ui);

  const headH = logoH + gapS + taglineH + motesH + statsH;
  const footH = hintH * 2;

  let headTop: number;
  let menuTop: number;
  if (compact) {
    const menuH = n * rowH + (n - 1) * rowGap;
    menuTop = H - pad - footH - gapL - menuH;
    headTop = pad;
  } else {
    const avail = H - 2 * pad;
    let total = headH + gapL + n * rowH + (n - 1) * rowGap + gapL + footH;
    if (total > avail) {
      rowH = Math.max(40, rowH - Math.ceil((total - avail) / n));
      total = headH + gapL + n * rowH + (n - 1) * rowGap + gapL + footH;
    }
    headTop = Math.max(pad, Math.round((H - total) * 0.4));
    menuTop = headTop + headH + gapL;
  }

  const lanternSize = Math.round(logoFontPx * 0.8);
  const lettersW = colW - Math.round(logoFontPx * LANTERN_EM);
  const logo: Rect = { x: colX, y: headTop, w: colW, h: logoH };
  const logoText: Rect = {
    x: colX + colW - lettersW, y: headTop, w: lettersW, h: logoH,
  };
  const lantern = {
    cx: colX + Math.round(lanternSize * 0.5), cy: headTop + Math.round(logoH * 0.52), size: lanternSize,
  };
  let y = headTop + logoH + gapS;
  const tagline: TextLine = { x: colX, y, w: colW, h: taglineH, size: taglineSize, align };
  y += taglineH;
  const motes: TextLine = { x: colX, y, w: colW, h: motesH, size: motesSize, align };
  y += motesH;
  const stats: TextLine = { x: colX, y, w: colW, h: statsH, size: statsSize, align };

  const rows: Rect[] = [];
  for (let i = 0; i < n; i++) rows.push({ x: colX, y: menuTop + i * (rowH + rowGap), w: colW, h: rowH });
  const menu: Rect = { x: colX, y: menuTop, w: colW, h: n * rowH + (n - 1) * rowGap };
  const footTop = menuTop + menu.h + gapL;
  const hint: TextLine = { x: colX, y: footTop, w: colW, h: hintH, size: hintSize, align };
  const notice: TextLine = { x: colX, y: footTop + hintH, w: colW, h: hintH, size: hintSize, align };

  const column: Rect = { x: colX, y: headTop, w: colW, h: footTop + footH - headTop };

  // The scene the cast stands in: beside the column (wide) or between the
  // header and the menu (phone).
  let scene: Rect;
  if (compact) {
    const top = stats.y + stats.h + 6;
    scene = { x: 0, y: top, w: W, h: Math.max(40, menuTop - 6 - top) };
  } else {
    const left = colX + colW + Math.round(pad * 0.6);
    scene = { x: left, y: pad, w: Math.max(40, W - pad - left), h: Math.max(40, H - 2 * pad) };
  }
  const horizonY = compact ? Math.round(scene.y + scene.h * 0.3) : Math.round(H * 0.4);
  const boost = compact ? 1.2 : 1;
  const cast = CAST.map((s) => place(s, scene, boost));

  return {
    compact, ui, pad, logo, logoFontPx, lantern, logoText, tagline, motes, stats, menu, rows,
    hint, notice, scene, horizonY, cast, trees: makeTrees({ width: W, height: H }, horizonY, compact), column,
  };
}
