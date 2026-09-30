/**
 * The title / hub scene: the Hollow at dusk with the Kindler in the foreground
 * and the Old Crown looming behind, the logo lockup, and the menu sitting on it.
 *
 * Drawn entirely from the game's own sprite code (creature sprites, obstacle
 * props, ground decor); nothing here invents art.
 *
 * Cost model. The hub redraws every frame, so the static picture is baked once
 * per viewport size into three offscreen layers (back / mist / top) and blitted:
 *
 *   back  sky, stars, ground and its decor, trees, back-light, contact shadows
 *   mist  a haze band that half-hides the far cast (the Crown, its court)
 *   top   vignette, the menu-side scrim and the logo lettering
 *
 * Between the layers the few things that move are drawn live, each a single
 * blit or a handful of paths: the cast (one drawImage each), the lantern glow,
 * the fireflies and the lantern mark's flame. With no canvas available (Node
 * tests) atlas.ts hands back null and every layer draws directly instead.
 */

import { content } from '@megabonk/content';
import { UNLOCKS } from '@megabonk/meta';
import { SpriteCache, browserSurfaceFactory, type Anchor } from './atlas.js';
import type { GameClient } from '../app.js';
import { formatCount, formatRuns, formatTime } from '../format.js';
import { roundedRect, type Ctx2D } from './ctx.js';
import { creatureCache, drawCreature, drawHero, enemyVisual } from './creatures/index.js';
import { breath, flicker, moteAt, MOTE_COUNT } from './hub/anim.js';
import { hubBakeKey, hubGeometry, type CastMember, type HubGeometry, type Rect, type TextLine } from './hub/geometry.js';
import { drawGroundDecor, drawObstacleProp } from './props/index.js';
import { THEME, font } from './theme.js';
import { label } from './ui.js';

const INK = '#05090b';
const BRASS = '#c9a04a';
const LAMP = '#ffc44d';
const TOP_LEFT: Anchor = Object.freeze({ ax: 0, ay: 0 });

// ---- baking ---------------------------------------------------------------

function deviceScale(): number {
  const dpr = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
  return typeof dpr === 'number' && dpr >= 1 ? Math.min(2, dpr) : 1;
}

const factory = browserSurfaceFactory();
const caches = new Map<number, SpriteCache>();
let lastKey = '';

function cacheFor(res: number): SpriteCache {
  let c = caches.get(res);
  if (c === undefined) {
    c = new SpriteCache(factory, { resolution: res });
    caches.set(res, c);
  }
  return c;
}

/** Baked at device resolution unless that would be a huge surface. */
function resolutionFor(w: number, h: number): number {
  const s = deviceScale();
  return s >= 2 && w * h * 4 <= 4_500_000 ? 2 : 1;
}

type LayerDraw = (ctx: Ctx2D, w: number, h: number) => void;

function blitLayer(ctx: Ctx2D, cache: SpriteCache, key: string, w: number, h: number, draw: LayerDraw): void {
  const sprite = cache.get(key, w, h, draw, TOP_LEFT);
  if (sprite !== null) {
    ctx.drawImage(sprite.surface, 0, 0, w, h);
    return;
  }
  ctx.save();
  draw(ctx, w, h);
  ctx.restore();
}

// ---- small drawing helpers --------------------------------------------------

function radial(
  ctx: Ctx2D, x: number, y: number, r: number, inner: string, outer: string,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ellipseFill(ctx: Ctx2D, x: number, y: number, rx: number, ry: number, colour: string, alpha: number): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Text with a 1 px ink drop, so scene-side type reads over any backdrop. */
function inked(
  ctx: Ctx2D, text: string, x: number, y: number, size: number, colour: string,
  align: 'left' | 'center' | 'right', weight: 'regular' | 'bold' = 'regular',
): void {
  label(ctx, text, x + 1, y + 1.5, size, INK, align, weight);
  label(ctx, text, x, y, size, colour, align, weight);
}

function baselineOf(line: TextLine): number {
  return line.y + line.size + Math.floor((line.h - line.size) / 2);
}

function lineX(line: TextLine): number {
  return line.align === 'center' ? line.x + line.w / 2 : line.x;
}

/** Shorten `text` with an ellipsis until it fits `maxW` in the current font. */
function fitText(ctx: Ctx2D, text: string, maxW: number): string {
  if (maxW <= 0) return '';
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

// ---- layer: back ------------------------------------------------------------

function paletteOf(client: GameClient): { ground: string; fog: string } {
  const p = content.biomes[client.config?.biomeId ?? 'verdant']?.palette ?? content.biomes['verdant']?.palette;
  return { ground: p?.ground ?? '#1d2a22', fog: p?.fog ?? '#0c1310' };
}

function paintBack(ctx: Ctx2D, W: number, H: number, g: HubGeometry, pal: { ground: string; fog: string }): void {
  const hy = g.horizonY;
  // Dusk sky: deep blue-violet overhead, a low ember-brown glow at the treeline.
  const sky = ctx.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, '#080c19');
  sky.addColorStop(0.55, '#1f1a30');
  sky.addColorStop(1, '#6a3e2a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, hy + 1);

  ctx.fillStyle = '#d8dcff';
  for (let i = 0; i < 42; i++) {
    const sx = ((i * 0.6180339) % 1) * W;
    const sy = ((i * 0.7548776 + 0.13) % 1) * hy * 0.7;
    ctx.globalAlpha = 0.25 + ((i * 37) % 10) / 22;
    ctx.fillRect(Math.round(sx), Math.round(sy), i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
  }
  ctx.globalAlpha = 1;

  // Warm back-light behind the Crown: it is half-lit, edge-lit by the last of the day.
  const boss = g.cast.find((m) => m.id === 'boss');
  if (boss !== undefined) {
    const bx = boss.box.x + boss.box.w / 2;
    const by = boss.box.y + boss.box.h * 0.45;
    ctx.globalAlpha = 0.6;
    radial(ctx, bx, by, Math.max(boss.box.w, boss.box.h) * 0.85, 'rgba(255,150,70,0.55)', 'rgba(255,150,70,0)');
    ctx.globalAlpha = 1;
  }

  // Ground.
  const ground = ctx.createLinearGradient(0, hy, 0, H);
  ground.addColorStop(0, pal.ground);
  ground.addColorStop(1, '#070d0a');
  ctx.fillStyle = ground;
  ctx.fillRect(0, hy, W, H - hy);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, hy, W, H - hy);
  ctx.clip();
  const zoom = Math.max(30, Math.min(70, H / 16));
  drawGroundDecor(ctx, { x: 0, y: -3, zoom }, { width: W, height: H }, 60);
  ctx.restore();

  // Trees, far to near.
  const trees = [...g.trees].sort((a, b) => a.baseY - b.baseY);
  for (const t of trees) {
    drawObstacleProp(ctx, { pos: { x: t.x / 40, y: t.baseY / 40 }, radius: t.radius, height: t.height }, t.x, t.baseY, t.zoom);
  }

  // Contact shadows for the whole cast, and the lamp's pool under the hero.
  for (const m of g.cast) {
    ellipseFill(ctx, m.feetX + m.unit * 0.3, m.feetY + m.unit * 0.05, m.box.w * 0.42, m.unit * 0.55, '#000', 0.4);
  }
  const hero = g.cast.find((m) => m.id === 'hero');
  if (hero !== undefined) {
    ctx.globalAlpha = 0.35;
    radial(ctx, hero.feetX, hero.feetY, hero.unit * 5, 'rgba(255,196,77,0.5)', 'rgba(255,196,77,0)');
    ctx.globalAlpha = 1;
  }
}

// ---- layer: mist ------------------------------------------------------------

function paintMist(ctx: Ctx2D, W: number, H: number, g: HubGeometry): void {
  const hy = g.horizonY;
  const haze = ctx.createLinearGradient(0, hy - 40, 0, hy + 46);
  haze.addColorStop(0, 'rgba(120,84,84,0)');
  haze.addColorStop(0.5, 'rgba(120,84,84,0.22)');
  haze.addColorStop(1, 'rgba(120,84,84,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, hy - 40, W, 86);

  const boss = g.cast.find((m) => m.id === 'boss');
  if (boss === undefined) return;
  const top = boss.box.y + boss.box.h * 0.12;
  const bottom = Math.min(H, boss.feetY + boss.unit * 3);
  const band = ctx.createLinearGradient(0, top, 0, bottom);
  band.addColorStop(0, 'rgba(16,12,30,0)');
  band.addColorStop(0.4, 'rgba(16,12,30,0.42)');
  band.addColorStop(0.75, 'rgba(16,12,30,0.62)');
  band.addColorStop(0.9, 'rgba(16,12,30,0.4)');
  band.addColorStop(1, 'rgba(16,12,30,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, top, W, bottom - top);
}

// ---- layer: top (vignette, scrim, logo) ---------------------------------------

function paintLogoText(ctx: Ctx2D, g: HubGeometry): void {
  const text = 'HOLLOWLIGHT';
  const box = g.logoText;
  let size = g.logoFontPx;
  ctx.font = font(size, 'bold');
  const measured = ctx.measureText(text).width;
  const room = box.w * 0.96;
  if (measured > room && measured > 0) size = Math.max(10, Math.floor(size * (room / measured)));
  ctx.font = font(size, 'bold');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const cx = box.x + box.w / 2;
  const base = box.y + box.h * 0.8;
  const depth = Math.max(2, Math.round(size * 0.08));

  // Ink outline around the extruded silhouette, then the extrusion, then the face.
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(4, size * 0.24);
  ctx.strokeText(text, cx, base + depth);
  ctx.strokeText(text, cx, base);
  ctx.fillStyle = '#7a3d12';
  ctx.fillText(text, cx, base + depth);
  const face = ctx.createLinearGradient(0, base - size * 0.78, 0, base);
  face.addColorStop(0, '#fff2b8');
  face.addColorStop(0.44, '#ffd766');
  face.addColorStop(0.46, '#ffbb35');
  face.addColorStop(1, '#e58a1c');
  ctx.fillStyle = face;
  ctx.fillText(text, cx, base);
}

function paintTop(ctx: Ctx2D, W: number, H: number, g: HubGeometry): void {
  // Scrim behind the menu column: the busiest part of the scene never sits under type.
  if (g.compact) {
    const y0 = Math.max(0, g.menu.y - 40);
    const s = ctx.createLinearGradient(0, y0, 0, H);
    s.addColorStop(0, 'rgba(7,6,10,0)');
    s.addColorStop(0.25, 'rgba(7,6,10,0.72)');
    s.addColorStop(1, 'rgba(7,6,10,0.9)');
    ctx.fillStyle = s;
    ctx.fillRect(0, y0, W, H - y0);
    const t = ctx.createLinearGradient(0, 0, 0, g.stats.y + g.stats.h + 10);
    t.addColorStop(0, 'rgba(7,6,10,0.6)');
    t.addColorStop(1, 'rgba(7,6,10,0)');
    ctx.fillStyle = t;
    ctx.fillRect(0, 0, W, g.stats.y + g.stats.h + 10);
  } else {
    const right = g.column.x + g.column.w + g.pad * 1.4;
    const s = ctx.createLinearGradient(0, 0, right, 0);
    s.addColorStop(0, 'rgba(7,6,10,0.86)');
    s.addColorStop(0.72, 'rgba(7,6,10,0.72)');
    s.addColorStop(1, 'rgba(7,6,10,0)');
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, right, H);
  }
  // Vignette.
  const r = Math.hypot(W, H) / 2;
  const v = ctx.createRadialGradient(W / 2, H / 2, r * 0.5, W / 2, H / 2, r);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);

  paintLogoText(ctx, g);
}

// ---- live layers --------------------------------------------------------------

function drawCastMember(ctx: Ctx2D, m: CastMember, idx: number, time: number, reduce: boolean): void {
  const b = breath(time, 3400 + idx * 310, reduce, idx * 0.37);
  if (m.id === 'hero') {
    drawHero(ctx, creatureCache, 0, 0, m.feetX, m.feetY + b * m.unit * 0.05, m.unit, m.flip);
    return;
  }
  const visual = enemyVisual(m.kind, m.kind === 'lobber' || m.kind === 'seer');
  if (m.id === 'boss') {
    // A slow swell of the chest, about the feet.
    ctx.save();
    ctx.translate(m.feetX, m.feetY);
    ctx.scale(1, 1 + b * 0.012);
    drawCreature(ctx, creatureCache, visual, 0, false, 0, 0, m.unit, m.flip);
    ctx.restore();
    return;
  }
  drawCreature(ctx, creatureCache, visual, 0, false, m.feetX, m.feetY - Math.abs(b) * m.unit * 0.12, m.unit, m.flip);
}

function drawLampGlow(ctx: Ctx2D, m: CastMember, time: number, reduce: boolean): void {
  const f = flicker(time, reduce);
  const x = m.feetX + (m.flip ? -1 : 1) * m.unit * 0.4;
  const y = m.feetY - m.unit * 1.5;
  ctx.globalAlpha = Math.min(1, 0.55 * f);
  radial(ctx, x, y, m.unit * 6.5 * f, 'rgba(255,205,110,0.5)', 'rgba(255,205,110,0)');
  ctx.globalAlpha = 1;
}

function drawMotes(ctx: Ctx2D, W: number, H: number, time: number, reduce: boolean): void {
  for (let i = 0; i < MOTE_COUNT; i++) {
    const m = moteAt(i, time, W, H, reduce);
    ctx.globalAlpha = m.alpha * 0.25;
    ctx.fillStyle = '#ffc44d';
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = m.alpha;
    ctx.fillStyle = '#fff1b0';
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** A small hanging lantern: brass cage, lit glass, a flickering flame. */
function drawLantern(ctx: Ctx2D, cx: number, cy: number, s: number, f: number): void {
  ctx.globalAlpha = 0.5;
  radial(ctx, cx, cy, s * 1.1 * f, 'rgba(255,190,80,0.55)', 'rgba(255,190,80,0)');
  ctx.globalAlpha = 1;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Handle.
  for (const [w, c] of [[s * 0.13, INK], [s * 0.06, BRASS]] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.3, s * 0.2, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  // Cap, glass, base.
  const bw = s * 0.27;
  const top = cy - s * 0.32;
  const bot = cy + s * 0.3;
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.55, top);
  ctx.lineTo(cx + bw * 0.55, top);
  ctx.lineTo(cx + bw, top + s * 0.12);
  ctx.lineTo(cx - bw, top + s * 0.12);
  ctx.closePath();
  ctx.fillStyle = BRASS;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, s * 0.07);
  ctx.stroke();
  roundedRect(ctx, cx - bw, top + s * 0.12, bw * 2, bot - top - s * 0.2, s * 0.06);
  ctx.fillStyle = '#ffcf6a';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(cx - bw * 1.05, bot - s * 0.09, bw * 2.1, s * 0.1);
  ctx.fillStyle = BRASS;
  ctx.fill();
  ctx.stroke();
  // Cage bars.
  ctx.strokeStyle = 'rgba(5,9,11,0.55)';
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.33, top + s * 0.12);
  ctx.lineTo(cx - bw * 0.33, bot - s * 0.09);
  ctx.moveTo(cx + bw * 0.33, top + s * 0.12);
  ctx.lineTo(cx + bw * 0.33, bot - s * 0.09);
  ctx.stroke();
  // Flame.
  const fy = bot - s * 0.1;
  const fh = s * 0.34 * f;
  const fw = s * 0.11;
  ctx.beginPath();
  ctx.moveTo(cx, fy - fh);
  ctx.quadraticCurveTo(cx + fw * 1.6, fy - fh * 0.35, cx, fy);
  ctx.quadraticCurveTo(cx - fw * 1.6, fy - fh * 0.35, cx, fy - fh);
  ctx.fillStyle = '#ff9a2a';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, fy - fh * 0.62);
  ctx.quadraticCurveTo(cx + fw * 0.8, fy - fh * 0.25, cx, fy);
  ctx.quadraticCurveTo(cx - fw * 0.8, fy - fh * 0.25, cx, fy - fh * 0.62);
  ctx.fillStyle = '#fff4c2';
  ctx.fill();
}

// ---- the menu -----------------------------------------------------------------

function drawTriangle(ctx: Ctx2D, x: number, cy: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x, cy - h / 2);
  ctx.lineTo(x + h * 0.8, cy);
  ctx.lineTo(x, cy + h / 2);
  ctx.closePath();
  ctx.fillStyle = LAMP;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawRow(
  ctx: Ctx2D, r: Rect, ui: number, selected: boolean,
  entry: ReturnType<GameClient['hubEntries']>[number],
): void {
  const radius = 10;
  // Plate: deep moss-brown, ink outline, brass top-edge highlight.
  roundedRect(ctx, r.x, r.y, r.w, r.h, radius);
  ctx.globalAlpha = selected ? 0.97 : 0.88;
  ctx.fillStyle = selected ? '#2f2716' : '#16140f';
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = INK;
  ctx.lineWidth = selected ? 6 : 3;
  ctx.stroke();
  if (selected) {
    // Selection = a thick gold border AND a caret, so it never depends on hue alone.
    roundedRect(ctx, r.x, r.y, r.w, r.h, radius);
    ctx.strokeStyle = LAMP;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.strokeStyle = selected ? '#ffe3a0' : BRASS;
  ctx.globalAlpha = selected ? 0.9 : 0.45;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(r.x + radius, r.y + 4);
  ctx.lineTo(r.x + r.w - radius, r.y + 4);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const cy = r.y + r.h / 2;
  const caret = Math.round(14 * ui);
  if (selected) drawTriangle(ctx, r.x + 12, cy, caret);
  const textX = r.x + 12 + caret + 12;

  const unlockDef = UNLOCKS.find((u) => u.id === entry.id);
  const rightSize = Math.round(13 * ui);
  let right: string;
  let rightColour: string;
  if (entry.kind === 'start') { right = 'ENTER'; rightColour = INK; }
  else if (entry.owned) { right = 'OWNED'; rightColour = THEME.accent; }
  else {
    right = `${unlockDef?.cost ?? entry.cost} Motes`;
    rightColour = entry.affordable ? THEME.gold : THEME.textDim;
  }
  ctx.font = font(rightSize, 'bold');
  const rightW = ctx.measureText(right).width;
  const rightX = r.x + r.w - 14;
  if (entry.kind === 'start') {
    // A keycap: the affordance names the key.
    roundedRect(ctx, rightX - rightW - 14, cy - rightSize * 0.95, rightW + 14, rightSize * 1.9, 5);
    ctx.fillStyle = LAMP;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    label(ctx, right, rightX - 7, cy + rightSize * 0.36, rightSize, rightColour, 'right', 'bold');
  } else {
    label(ctx, right, rightX, cy + rightSize * 0.36, rightSize, rightColour, 'right', 'bold');
  }

  const rightRoom = rightW + 30;
  const maxW = r.w - (textX - r.x) - rightRoom;
  const labelSize = Math.round(16 * ui);
  const detailSize = Math.max(12, Math.round(12.5 * ui));
  ctx.font = font(labelSize, 'bold');
  const name = fitText(ctx, entry.label, maxW);
  label(ctx, name, textX, r.y + r.h * 0.44, labelSize, THEME.text, 'left', 'bold');
  ctx.font = font(detailSize, 'regular');
  const detail = fitText(ctx, entry.detail, maxW);
  label(ctx, detail, textX, r.y + r.h * 0.44 + detailSize + 4, detailSize, '#a9b8aa', 'left');
}

function drawHeader(ctx: Ctx2D, client: GameClient, g: HubGeometry): void {
  inked(ctx, 'Verdant Hollow · 15 minutes · one life', lineX(g.tagline), baselineOf(g.tagline),
    g.tagline.size, '#c8d4c4', g.tagline.align);

  // Motes, with a small glowing mote beside the number.
  const line = g.motes;
  const text = `${formatCount(client.profile.silver)} Motes`;
  ctx.font = font(line.size, 'bold');
  const tw = ctx.measureText(text).width;
  const dotW = line.size * 0.9;
  const total = dotW + tw;
  const startX = line.align === 'center' ? line.x + line.w / 2 - total / 2 : line.x;
  const by = baselineOf(line);
  const dotY = by - line.size * 0.32;
  radial(ctx, startX + dotW * 0.4, dotY, line.size * 0.55, 'rgba(255,220,130,0.6)', 'rgba(255,220,130,0)');
  ctx.fillStyle = '#fff1b0';
  ctx.beginPath();
  ctx.arc(startX + dotW * 0.4, dotY, line.size * 0.17, 0, Math.PI * 2);
  ctx.fill();
  inked(ctx, text, startX + dotW, by, line.size, THEME.gold, 'left', 'bold');

  // Its own line, stacked under the motes; never sharing a baseline with anything.
  inked(ctx,
    `${formatRuns(client.profile.runsPlayed)} · best ${formatTime(client.profile.bestSeconds)}`,
    lineX(g.stats), baselineOf(g.stats), g.stats.size, '#b3c1b3', g.stats.align);
}

function drawFooter(ctx: Ctx2D, client: GameClient, g: HubGeometry): void {
  inked(ctx, 'Arrows or W/S to move · Enter to confirm · H for controls',
    lineX(g.hint), baselineOf(g.hint), g.hint.size, '#b3c1b3', g.hint.align);
  if (!client.storageAvailable) {
    inked(ctx, 'Storage unavailable — progress will not be saved this session',
      lineX(g.notice), baselineOf(g.notice), g.notice.size, THEME.hpLow, g.notice.align);
  } else if (client.notice !== null) {
    inked(ctx, client.notice, lineX(g.notice), baselineOf(g.notice), g.notice.size, THEME.gold, g.notice.align);
  }
}

// ---- entry point ----------------------------------------------------------------

export function drawHub(ctx: Ctx2D, client: GameClient, timeMs = 0): void {
  const view = client.view;
  const W = Math.round(view.width);
  const H = Math.round(view.height);
  if (W <= 0 || H <= 0) return;
  const entries = client.hubEntries();
  const g = hubGeometry(entries.length, { width: W, height: H });
  const reduce = client.reduceMotion;
  const pal = paletteOf(client);

  // Re-bake only when the viewport size changed; drop the old surfaces so a
  // window drag cannot pile up full-screen layers.
  const key = hubBakeKey({ width: W, height: H });
  if (key !== lastKey) {
    for (const c of caches.values()) c.clear();
    lastKey = key;
  }
  const res = resolutionFor(W, H);
  const cache = cacheFor(res);

  blitLayer(ctx, cache, `${key}:r${res}:back`, W, H, (c, w, h) => paintBack(c, w, h, g, pal));
  g.cast.forEach((m, i) => { if (m.layer === 'far') drawCastMember(ctx, m, i, timeMs, reduce); });
  blitLayer(ctx, cache, `${key}:r${res}:mist`, W, H, (c, w, h) => paintMist(c, w, h, g));
  const hero = g.cast.find((m) => m.id === 'hero');
  if (hero !== undefined) drawLampGlow(ctx, hero, timeMs, reduce);
  g.cast.forEach((m, i) => { if (m.layer === 'near') drawCastMember(ctx, m, i, timeMs, reduce); });
  drawMotes(ctx, W, H, timeMs, reduce);
  blitLayer(ctx, cache, `${key}:r${res}:top`, W, H, (c, w, h) => paintTop(c, w, h, g));

  drawLantern(ctx, g.lantern.cx, g.lantern.cy, g.lantern.size, flicker(timeMs, reduce));
  drawHeader(ctx, client, g);
  for (let i = 0; i < entries.length; i++) {
    drawRow(ctx, g.rows[i]!, g.ui, i === client.hubIndex, entries[i]!);
  }
  drawFooter(ctx, client, g);
}
