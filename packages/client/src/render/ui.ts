/**
 * Shared UI furniture, in the world's language: bark-brown panels with a 3 px ink
 * outline, 10-12 px corners and a brass highlight on the top edge only (bible
 * section 11).
 */

import { roundedRect, type Ctx2D } from './ctx.js';
import { THEME, font } from './theme.js';

/** Default panel corner radius; small requests are raised to MIN_RADIUS. */
export const PANEL_RADIUS = 11;
const MIN_RADIUS = 9;
export const PANEL_INK = 3;

export interface PanelOptions {
  readonly radius?: number;
  readonly fill?: string;
  /**
   * An accent colour (rarity, gold, advisor...). Drawn as an inner rim so colour
   * stays a cue on top of the ink outline. Omit for a plain panel, which gets the
   * brass top highlight instead.
   */
  readonly edge?: string;
  readonly alpha?: number;
  /** Small tiles: thinner outline and rim so a 36 px tile still has room inside. */
  readonly compact?: boolean;
}

export function panel(
  ctx: Ctx2D,
  x: number, y: number, w: number, h: number,
  opts: PanelOptions = {},
): void {
  if (w <= 0 || h <= 0) return;
  const compact = opts.compact === true;
  const r = compact ? 8 : opts.radius === undefined ? PANEL_RADIUS : Math.max(MIN_RADIUS, opts.radius);
  const inkW = compact ? 2.5 : PANEL_INK;

  ctx.globalAlpha = opts.alpha ?? 0.96;
  ctx.fillStyle = opts.fill ?? THEME.bark;
  roundedRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.globalAlpha = 1;

  const accent = opts.edge !== undefined && opts.edge !== THEME.panelEdge ? opts.edge : null;
  if (accent !== null) {
    const inset = compact ? 3.6 : 6;
    ctx.strokeStyle = accent;
    ctx.lineWidth = compact ? 1.8 : 2;
    roundedRect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(2, r - inset + 1));
    ctx.stroke();
  } else if (w > r * 2 + 8) {
    // Brass highlight, top edge only.
    const hy = y + inkW + 1.5;
    ctx.strokeStyle = THEME.brassHi;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = compact ? 1.4 : 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + r, hy);
    ctx.lineTo(x + w - r, hy);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }

  // The ink outline goes last so nothing paints over the silhouette.
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = inkW;
  roundedRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

export function bar(
  ctx: Ctx2D,
  x: number, y: number, w: number, h: number,
  frac: number,
  fill: string,
  back: string,
): void {
  if (w <= 0 || h <= 0) return;
  const r = Math.min(h / 2, 5);
  const f = Math.max(0, Math.min(1, frac));
  ctx.fillStyle = back;
  roundedRect(ctx, x, y, w, h, r);
  ctx.fill();
  if (f > 0) {
    ctx.fillStyle = fill;
    roundedRect(ctx, x, y, Math.max(h, w * f), h, r);
    ctx.fill();
    if (w * f > 8 && h >= 6) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + r * 0.7, y + 1.4, Math.max(0, w * f - r * 1.4), Math.max(1, h * 0.18));
      ctx.globalAlpha = 1;
    }
  }
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 2.5;
  roundedRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

export function label(
  ctx: Ctx2D,
  text: string,
  x: number, y: number,
  size: number,
  colour: string,
  align: 'left' | 'center' | 'right' = 'left',
  weight: 'regular' | 'bold' = 'regular',
): void {
  ctx.font = font(size, weight);
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

/** Small bold section marker. Not letter-spaced: the world's type is chunky, not tracked. */
export function kicker(
  ctx: Ctx2D, text: string, x: number, y: number, size: number,
  colour: string = THEME.textDim,
  align: 'left' | 'center' | 'right' = 'left',
): void {
  ctx.font = font(size, 'bold');
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

/** A chunky display heading: fat ink outline under a flat fill, like the world's sprites. */
export function heading(
  ctx: Ctx2D, text: string, x: number, y: number, size: number,
  colour: string,
  align: 'left' | 'center' | 'right' = 'left',
): void {
  ctx.font = font(size, 'bold');
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = Math.max(3, size * 0.24);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

/** A physical key cap: a light rounded slab on a darker base, ink outlined. */
export function keycap(ctx: Ctx2D, x: number, y: number, w: number, h: number, text: string): void {
  const lift = 3;
  ctx.fillStyle = THEME.keycapEdge;
  roundedRect(ctx, x, y + lift, w, h - lift, 6);
  ctx.fill();
  ctx.fillStyle = THEME.keycap;
  roundedRect(ctx, x, y, w, h - lift, 6);
  ctx.fill();
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 2.5;
  roundedRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  ctx.font = font(13, 'bold');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = THEME.ink;
  ctx.fillText(text, x + w / 2, y + (h - lift) / 2 + 5);
}

/** Word-wrap into at most `maxLines` lines, returning the lines drawn. */
export function paragraph(
  ctx: Ctx2D,
  text: string,
  x: number, y: number, maxWidth: number,
  size: number,
  colour: string,
  maxLines = 4,
  align: 'left' | 'center' = 'left',
): number {
  ctx.font = font(size, 'regular');
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colour;
  const words = text.split(' ');
  let line = '';
  let drawn = 0;
  let cursorY = y;
  for (const word of words) {
    const candidate = line.length === 0 ? word : `${line} ${word}`;
    if (ctx.measureText(candidate).width > maxWidth && line.length > 0) {
      ctx.fillText(line, x, cursorY);
      drawn++;
      cursorY += size * 1.25;
      line = word;
      if (drawn >= maxLines) return drawn;
    } else {
      line = candidate;
    }
  }
  if (line.length > 0 && drawn < maxLines) {
    ctx.fillText(line, x, cursorY);
    drawn++;
  }
  return drawn;
}

/** Full-screen scrim behind a modal screen. */
export function scrim(ctx: Ctx2D, width: number, height: number, alpha = 0.72): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = THEME.barkDeep;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
}
