/**
 * The drawing surface, as an interface.
 *
 * Tests run under `environment: 'node'` — there is no DOM and no canvas. Every
 * draw routine therefore takes a `Ctx2D` rather than a
 * `CanvasRenderingContext2D`, so a counting fake can be injected. A real 2D
 * context satisfies this shape structurally; main.ts casts once at the boundary.
 */

export interface GradientLike {
  addColorStop(offset: number, color: string): void;
}

export interface Ctx2D {
  fillStyle: string | GradientLike;
  strokeStyle: string | GradientLike;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  lineJoin: string;
  lineCap: string;
  globalCompositeOperation: string;
  shadowBlur: number;
  shadowColor: string;

  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(angle: number): void;

  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number, ccw?: boolean): void;
  ellipse(
    x: number, y: number, rx: number, ry: number,
    rotation: number, start: number, end: number, ccw?: boolean,
  ): void;
  rect(x: number, y: number, w: number, h: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;

  fill(): void;
  stroke(): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  setLineDash(segments: number[]): void;

  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): { width: number };

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike;
  createRadialGradient(
    x0: number, y0: number, r0: number, x1: number, y1: number, r1: number,
  ): GradientLike;
}

/** Rounded rectangle without relying on `roundRect`, which older Safari lacks. */
export function roundedRect(
  ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number,
): void {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
