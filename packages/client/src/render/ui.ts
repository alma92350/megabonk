/** Shared UI furniture: slab panels, bars, meters, text. "Stamped brass on slate". */

import { roundedRect, type Ctx2D } from './ctx.js';
import { THEME, font } from './theme.js';

export function panel(
  ctx: Ctx2D,
  x: number, y: number, w: number, h: number,
  opts: { radius?: number; fill?: string; edge?: string; alpha?: number } = {},
): void {
  if (w <= 0 || h <= 0) return;
  ctx.globalAlpha = opts.alpha ?? 0.94;
  ctx.fillStyle = opts.fill ?? THEME.panel;
  roundedRect(ctx, x, y, w, h, opts.radius ?? 6);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = opts.edge ?? THEME.panelEdge;
  ctx.lineWidth = 1.5;
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
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
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

/** All-caps tracked kicker, the theme's section marker. */
export function kicker(
  ctx: Ctx2D, text: string, x: number, y: number, size: number,
  colour: string = THEME.textDim,
  align: 'left' | 'center' | 'right' = 'left',
): void {
  ctx.font = font(size, 'bold');
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colour;
  // Tracking via ctx.letterSpacing where the browser has it. Drawing character
  // by character would also work but costs one fillText per glyph, which is the
  // sort of thing that quietly eats a frame budget in a HUD redrawn at 60 Hz.
  const previous = ctx.letterSpacing;
  const supported = typeof previous === 'string';
  if (supported) ctx.letterSpacing = `${(size * 0.12).toFixed(2)}px`;
  ctx.fillText(text, x, y);
  if (supported) ctx.letterSpacing = previous;
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
  ctx.fillStyle = THEME.ink;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
}
