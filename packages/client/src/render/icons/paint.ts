/**
 * Painting helpers for icons, in the world's language: thick dark ink outline,
 * flat cel shading (one shadow tone, light from the top-left), a bright
 * highlight tick. Icons are authored in a 64x64 box centred on (0, 0); the
 * usable area is about +-29 so the outline never clips.
 *
 * No gradients, no shadowBlur: an icon is baked once and blitted.
 */

import { roundedRect, type Ctx2D } from '../ctx.js';

export const INK = '#05090b';

export interface Tone {
  readonly base: string;
  readonly shade: string;
  readonly light: string;
}

export type PathFn = (ctx: Ctx2D) => void;

/** Outline weight (in 64-box units) for the icon being painted. */
let lw = 4.5;

export function inkWeight(): number {
  return lw;
}

/** Run `fn` with a given outline weight; small bakes use a heavier line. */
export function withInk(weight: number, fn: () => void): void {
  const prev = lw;
  lw = weight;
  try {
    fn();
  } finally {
    lw = prev;
  }
}

const SHADE = 3.4;

/**
 * Fill a silhouette with cel shading and an ink outline. `angle` is the rotation
 * the caller already applied to the context, so the shadow crescent stays
 * bottom-right in screen space.
 */
export function cel(ctx: Ctx2D, path: PathFn, tone: Tone, angle = 0): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  path(ctx);
  ctx.fillStyle = tone.shade;
  ctx.fill();
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = -SHADE, dy = -SHADE;
  ctx.save();
  path(ctx);
  ctx.clip();
  ctx.translate(dx * c + dy * s, -dx * s + dy * c);
  path(ctx);
  ctx.fillStyle = tone.base;
  ctx.fill();
  ctx.restore();
  path(ctx);
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;
  ctx.stroke();
}

/** A bright tick, the rim-light on the top-left contour. */
export function tick(ctx: Ctx2D, x1: number, y1: number, x2: number, y2: number, colour: string, w = 2.4): void {
  ctx.strokeStyle = colour;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** A thick line with an ink outline (handles, stems, legs). */
export function stick(
  ctx: Ctx2D, path: PathFn, width: number, colour: string, cap: 'round' | 'butt' = 'round',
): void {
  ctx.lineCap = cap;
  ctx.lineJoin = 'round';
  path(ctx);
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + lw;
  ctx.stroke();
  path(ctx);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function poly(...pts: number[]): PathFn {
  return (ctx) => {
    ctx.beginPath();
    ctx.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
    ctx.closePath();
  };
}

export function circle(x: number, y: number, r: number): PathFn {
  return (ctx) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
  };
}

export function ellipse(x: number, y: number, rx: number, ry: number): PathFn {
  return (ctx) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.closePath();
  };
}

export function rrect(x: number, y: number, w: number, h: number, r: number): PathFn {
  return (ctx) => roundedRect(ctx, x, y, w, h, r);
}

/** A four-point sparkle. */
export function sparkle(x: number, y: number, r: number): PathFn {
  const i = r * 0.28;
  return poly(x, y - r, x + i, y - i, x + r, y, x + i, y + i, x, y + r, x - i, y + i, x - r, y, x - i, y - i);
}

export const TONES = {
  wood: { base: '#bf7b3d', shade: '#8c522a', light: '#e8b06c' },
  leaf: { base: '#62c04c', shade: '#3f8f3a', light: '#b0ec92' },
  steel: { base: '#b9c8d3', shade: '#7f94a5', light: '#f0f8fd' },
  brass: { base: '#f2b83c', shade: '#c0821f', light: '#ffe790' },
  leather: { base: '#a8622f', shade: '#74401d', light: '#d99257' },
  cyan: { base: '#6fd0f6', shade: '#3f9fd2', light: '#d2f3ff' },
  teal: { base: '#5fb0ae', shade: '#3e8286', light: '#b0e8e2' },
  plum: { base: '#8c4c96', shade: '#63356f', light: '#c283cc' },
  bone: { base: '#f0ead8', shade: '#bdb59d', light: '#ffffff' },
  flame: { base: '#ff8b2b', shade: '#e2531d', light: '#ffd35e' },
  glass: { base: '#d6f1ec', shade: '#9fcfc8', light: '#ffffff' },
  green: { base: '#58d26e', shade: '#33a04b', light: '#b4f5b8' },
  burlap: { base: '#d6ab68', shade: '#a67a3d', light: '#f3d698' },
  stone: { base: '#a3aeb8', shade: '#6f7d8b', light: '#dfe6ec' },
  plate: { base: '#aebdb4', shade: '#718579', light: '#e6f0ea' },
  gold: { base: '#ffc44d', shade: '#d9962a', light: '#fff1aa' },
  blue: { base: '#5a8ce6', shade: '#3960b8', light: '#a9c8ff' },
  dark: { base: '#4a2f1c', shade: '#2e1c10', light: '#7a5030' },
} as const satisfies Record<string, Tone>;
