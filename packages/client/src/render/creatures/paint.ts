/**
 * Painter's toolbox. Everything is authored in "sprite units" with the anchor at
 * (0, 0) (the feet), +x to the right, -y up, body roughly one unit wide either
 * side. These run when a sprite is BAKED (once per kind per frame), or per
 * entity only in the un-baked fallback, so they may allocate freely — the
 * per-entity hot path never calls them.
 *
 * Shading model: three tones from one light at the upper left. Every part is
 * filled with its shade, the base tone is laid over it shifted toward the light,
 * leaving a shadow crescent lower-right, then a soft highlight, then one ink
 * outline. That is the whole style; it is what makes flat shapes read as volume.
 */

import type { Ctx2D } from '../ctx.js';
import { RANGED_GLOW, type EnemyVisual } from './visuals.js';

export const TAU = Math.PI * 2;
export const INK = '#080810';
/** Outline weight in sprite units: chunky, so silhouettes survive downscaling. */
export const LW = 0.13;

export interface Pal {
  readonly body: string;
  readonly shade: string;
  readonly light: string;
  readonly rim: string;
  readonly accent: string;
  readonly dark: string;
  readonly white: string;
  readonly pupil: string;
  readonly glow: string;
  readonly ink: string;
  /** Extra shade of the accent, for two-tone trim. */
  readonly accentShade: string;
}

/** Everything a routine needs to paint one frame. */
export interface Pose {
  readonly c: Ctx2D;
  readonly p: Pal;
  /** Cycle position 0..1. */
  readonly t: number;
  /** sin / cos of the cycle, and a 0..1 bounce (|sin|). */
  readonly s: number;
  readonly k: number;
  readonly bounce: number;
}

export function makePose(c: Ctx2D, p: Pal, frame: number, frames: number): Pose {
  const t = frame / frames;
  const s = Math.sin(t * TAU);
  return { c, p, t, s, k: Math.cos(t * TAU), bounce: Math.abs(s) };
}

export function mix(a: string, b: string, f: number): string {
  const x = parseInt(a.slice(1, 7), 16), y = parseInt(b.slice(1, 7), 16);
  const ch = (sh: number): number => Math.round(((x >> sh) & 255) * (1 - f) + ((y >> sh) & 255) * f);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

const palCache = new Map<string, Pal>();

/** variant 0 = normal, 1 = white hit-flash. Cached: pals are made once, not per frame. */
export function palFor(v: EnemyVisual, variant: 0 | 1): Pal {
  const key = `${v.id}:${variant}`;
  let p = palCache.get(key);
  if (p === undefined) {
    p = variant === 1
      ? {
          body: '#ffffff', shade: '#c9d2dc', light: '#ffffff', rim: '#ffffff', accent: '#ffffff',
          dark: '#8894a4', white: '#ffffff', pupil: '#8894a4', glow: '#ffffff', ink: INK, accentShade: '#c9d2dc',
        }
      : {
          body: v.body, shade: v.shade, light: v.light, rim: v.rim, accent: v.accent, dark: v.dark,
          white: '#fffdf4', pupil: '#120c1a', glow: v.ranged ? RANGED_GLOW : '#ffe14a', ink: INK,
          accentShade: mix(v.accent, '#000000', 0.32),
        };
    palCache.set(key, p);
  }
  return p;
}

function ellPath(c: Ctx2D, x: number, y: number, rx: number, ry: number, rot: number): void {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.001, rx), Math.max(0.001, ry), rot, 0, TAU);
}

function outline(c: Ctx2D, ink: string, w = LW): void {
  c.strokeStyle = ink;
  c.lineWidth = w;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.stroke();
}

/** A shaded, outlined ellipse: the workhorse body part. */
export function ell(
  { c, p }: Pose, x: number, y: number, rx: number, ry: number,
  base: string = p.body, shade: string = p.shade, light: string = p.light, rot = 0,
): void {
  ellPath(c, x, y, rx, ry, rot);
  c.fillStyle = shade;
  c.fill();
  c.save();
  ellPath(c, x, y, rx, ry, rot);
  c.clip();
  ellPath(c, x - rx * 0.2, y - ry * 0.22, rx * 1.02, ry * 1.0, rot);
  c.fillStyle = base;
  c.fill();
  c.globalAlpha = 0.55;
  ellPath(c, x - rx * 0.4, y - ry * 0.46, rx * 0.4, ry * 0.26, rot - 0.3);
  c.fillStyle = light;
  c.fill();
  c.restore();
  ellPath(c, x, y, rx, ry, rot);
  outline(c, p.ink);
}

/** Flat-coloured outlined ellipse (no shading): small details. */
export function dot(
  { c, p }: Pose, x: number, y: number, rx: number, ry: number, fill: string, ink = true, rot = 0,
): void {
  ellPath(c, x, y, rx, ry, rot);
  c.fillStyle = fill;
  c.fill();
  if (ink) outline(c, p.ink, LW * 0.85);
}

function trace(c: Ctx2D, pts: readonly number[], closed = true): void {
  c.beginPath();
  c.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!);
  if (closed) c.closePath();
}

/** A shaded, outlined polygon given as x,y pairs. */
export function poly(
  { c, p }: Pose, pts: readonly number[],
  base: string = p.body, shade: string = p.shade, light: string = p.light,
): void {
  trace(c, pts);
  c.fillStyle = shade;
  c.fill();
  c.save();
  trace(c, pts);
  c.clip();
  c.translate(-0.13, -0.15);
  trace(c, pts);
  c.fillStyle = base;
  c.fill();
  c.translate(0.13, 0.15);
  // A thin top-left edge light.
  c.globalAlpha = 0.5;
  c.translate(-0.05, -0.08);
  trace(c, pts, false);
  c.strokeStyle = light;
  c.lineWidth = 0.09;
  c.stroke();
  c.restore();
  trace(c, pts);
  outline(c, p.ink);
}

/** Flat polygon with ink outline (spikes, teeth, horns). */
export function flat({ c, p }: Pose, pts: readonly number[], fill: string, ink = true): void {
  trace(c, pts);
  c.fillStyle = fill;
  c.fill();
  if (ink) outline(c, p.ink, LW * 0.8);
}

/** A thick ink stroke: limbs, brows, antennae. */
export function line(
  { c, p }: Pose, pts: readonly number[], w: number, colour: string = p.ink,
): void {
  trace(c, pts, false);
  c.strokeStyle = colour;
  c.lineWidth = w;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.stroke();
}

/** A limb: ink under-stroke plus a coloured stroke on top, so it has an outline. */
export function limb(pose: Pose, pts: readonly number[], w: number, colour: string): void {
  line(pose, pts, w + LW * 1.6, pose.p.ink);
  line(pose, pts, w, colour);
}

export interface EyeOpts {
  /** Look direction, -1..1 each. */
  readonly lx?: number;
  readonly ly?: number;
  /** 0 = none, otherwise the sign of the brow's inner side (+1 for a left eye). */
  readonly brow?: number;
  /** 0..1 how steeply the brow slants. */
  readonly angry?: number;
  /** Squint: fraction of the eye closed from the top (0..0.6). */
  readonly lid?: number;
  /** Colour override for a glowing eye. */
  readonly glow?: string;
}

/** An eye: white, ink-ringed, big pupil, catch-light. Reads at 20 px. */
export function eye(pose: Pose, x: number, y: number, r: number, o: EyeOpts = {}): void {
  const { c, p } = pose;
  const lx = o.lx ?? 0.35, ly = o.ly ?? 0.1;
  if (o.glow !== undefined) {
    // Glowing eye: halo, coloured disc, hot core. Dark socket first.
    dot(pose, x, y, r * 1.15, r * 1.25, p.dark);
    c.globalAlpha = 0.3;
    dot(pose, x, y, r * 1.6, r * 1.7, o.glow, false);
    c.globalAlpha = 1;
    dot(pose, x, y, r * 0.95, r * 1.05, o.glow, false);
    dot(pose, x + lx * r * 0.2, y + ly * r * 0.2, r * 0.45, r * 0.5, '#ffffff', false);
  } else {
    dot(pose, x, y, r, r * 1.12, p.white);
    dot(pose, x + lx * r * 0.42, y + ly * r * 0.3, r * 0.58, r * 0.66, p.pupil, false);
    dot(pose, x + lx * r * 0.42 - r * 0.2, y + ly * r * 0.3 - r * 0.24, r * 0.2, r * 0.2, '#ffffff', false);
  }
  const lid = o.lid ?? 0;
  if (lid > 0) {
    // A heavy upper lid in the skin colour: squinting, menacing.
    c.save();
    ellPath(c, x, y, r * 1.05, r * 1.17, 0);
    c.clip();
    c.fillStyle = p.body;
    c.fillRect(x - r * 2, y - r * 2, r * 4, r * 2 + r * (lid * 2.2 - 1.1));
    c.restore();
    line(pose, [x - r * 1.05, y - r * (1.1 - lid * 2.2), x + r * 1.05, y - r * (1.1 - lid * 2.2)], LW * 1.1);
  }
  const s = o.brow ?? 0;
  if (s !== 0) {
    const a = o.angry ?? 0.6;
    line(
      pose,
      [x - s * r * 1.3, y - r * (1.25 + a * 0.5), x + s * r * 1.0, y - r * (1.25 - a * 0.7)],
      LW * 1.45,
    );
  }
}

/** A grinning mouth with two fangs pointing up. */
export function fangMouth(pose: Pose, x: number, y: number, w: number, h: number): void {
  const { c, p } = pose;
  c.beginPath();
  c.moveTo(x - w, y - h * 0.3);
  c.quadraticCurveTo(x, y + h * 1.6, x + w, y - h * 0.3);
  c.quadraticCurveTo(x, y - h * 0.9, x - w, y - h * 0.3);
  c.closePath();
  c.fillStyle = p.dark;
  c.fill();
  outline(c, p.ink, LW * 0.8);
  flat(pose, [x - w * 0.62, y - h * 0.15, x - w * 0.3, y - h * 0.15, x - w * 0.46, y + h * 0.5], p.white, false);
  flat(pose, [x + w * 0.62, y - h * 0.15, x + w * 0.3, y - h * 0.15, x + w * 0.46, y + h * 0.5], p.white, false);
}

/** The glowing orb held by ranged enemies, in the same pink as their shots. */
export function orb(pose: Pose, x: number, y: number, r: number): void {
  const { c, p } = pose;
  c.globalAlpha = 0.28;
  dot(pose, x, y, r * 2.0, r * 2.0, p.glow, false);
  c.globalAlpha = 0.5;
  dot(pose, x, y, r * 1.45, r * 1.45, p.glow, false);
  c.globalAlpha = 1;
  dot(pose, x, y, r, r, p.glow);
  dot(pose, x, y, r * 0.5, r * 0.5, '#ffffff', false);
}

/** Soft face-side lighting on an already-drawn part: a tiny catch-light streak. */
export function glint(pose: Pose, x: number, y: number, r: number): void {
  dot(pose, x, y, r, r * 0.55, '#ffffff', false, -0.6);
}
