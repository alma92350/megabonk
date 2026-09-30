/**
 * The reward language, as data.
 *
 * Three rules keep the screen readable at a glance:
 *   WANT   = warm/bright, glowing, and a distinct SHAPE per kind (gem / coin / cross);
 *   HURT   = hot pink, and nothing else is pink;
 *   SCENERY = dark, desaturated, calm.
 * Colour is never the only cue: XP is a faceted gem, gold a round coin, heal a
 * cross. The maths here (hue, luminance, contrast) exists so tests can defend
 * those rules with numbers instead of taste.
 */

import type { PickupKind } from '@megabonk/sim';
import { PICKUP_COLORS, PROJECTILE_CORE } from '../theme.js';

// ---- colour maths ----------------------------------------------------------

export interface Rgb { readonly r: number; readonly g: number; readonly b: number }

export function parseHex(hex: string): Rgb {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  const full = h.length === 3 ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! : h.slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** `rgba(r,g,b,a)` from a hex colour. Only used at bake time, never per frame. */
export function rgba(hex: string, a: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Hue in degrees [0, 360). Greys report 0; check saturation before trusting it. */
export function hueOf(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Shortest angular distance between two hues, in degrees [0, 180]. */
export function hueDistance(a: string, b: string): number {
  const d = Math.abs(hueOf(a) - hueOf(b)) % 360;
  return d > 180 ? 360 - d : d;
}

export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// ---- pickups ---------------------------------------------------------------

export type PickupShape = 'gem' | 'coin' | 'cross';

export interface PickupVisual {
  readonly kind: PickupKind;
  /** Silhouette id: the second cue after colour. */
  readonly shape: PickupShape;
  readonly core: string;
  readonly light: string;
  readonly dark: string;
  readonly glow: string;
  /** Number of size tiers this kind has. */
  readonly tiers: number;
}

export const PICKUP_VISUALS: Readonly<Record<PickupKind, PickupVisual>> = Object.freeze({
  xp: { kind: 'xp', shape: 'gem', core: PICKUP_COLORS.xp, light: '#d8fbff', dark: '#0b6f96', glow: '#38d6ff', tiers: 4 },
  gold: { kind: 'gold', shape: 'coin', core: PICKUP_COLORS.gold, light: '#fff3ae', dark: '#a8650c', glow: '#ffb62e', tiers: 3 },
  heal: { kind: 'heal', shape: 'cross', core: PICKUP_COLORS.heal, light: '#e2ffee', dark: '#0f7a44', glow: '#4dffa0', tiers: 1 },
});

const FALLBACK_PICKUP = PICKUP_VISUALS.xp;

export function pickupVisual(kind: string): PickupVisual {
  return (PICKUP_VISUALS as Readonly<Record<string, PickupVisual>>)[kind] ?? FALLBACK_PICKUP;
}

/** Upper bounds (exclusive) of each tier below the last, by value. */
const XP_TIERS = [3, 8, 25] as const;
const GOLD_TIERS = [5, 20] as const;

function tierFrom(bounds: readonly number[], value: number): number {
  const v = Number.isFinite(value) ? value : 0;
  let t = 0;
  while (t < bounds.length && v >= bounds[t]!) t++;
  return t;
}

/** Monotonic non-decreasing in `value`, and always within [0, tiers - 1]. */
export function pickupTier(kind: string, value: number): number {
  if (kind === 'xp') return tierFrom(XP_TIERS, value);
  if (kind === 'gold') return tierFrom(GOLD_TIERS, value);
  return 0;
}

// ---- shrines ---------------------------------------------------------------

export type RuneGlyph = 'flame' | 'wing' | 'shield' | 'coin' | 'star';

export interface ShrineTint {
  readonly id: string;
  readonly color: string;
  readonly light: string;
  readonly glyph: RuneGlyph;
}

/**
 * One tint + one glyph per shrine, chosen from what the shrine DOES (see
 * packages/content/src/shrines.ts): forge = fire, fleetfoot = wind, bulwark =
 * shield, avarice = coin. Warm gold/orange and bright violet/azure only: they
 * pop off a moss ground and never approach hostile pink.
 */
export const SHRINE_TINTS: Readonly<Record<string, ShrineTint>> = Object.freeze({
  forge: { id: 'forge', color: '#ff8a2a', light: '#ffd9a8', glyph: 'flame' },
  fleetfoot: { id: 'fleetfoot', color: '#6fb0ff', light: '#d3e6ff', glyph: 'wing' },
  bulwark: { id: 'bulwark', color: '#c496ff', light: '#e9d8ff', glyph: 'shield' },
  avarice: { id: 'avarice', color: '#ffd23f', light: '#fff2b0', glyph: 'coin' },
});

export const FALLBACK_SHRINE_TINT: ShrineTint = Object.freeze({
  id: 'unknown', color: '#d6a2ff', light: '#f3e4ff', glyph: 'star',
});

export function shrineTint(shrineId: string | undefined): ShrineTint {
  if (shrineId === undefined) return FALLBACK_SHRINE_TINT;
  return SHRINE_TINTS[shrineId] ?? FALLBACK_SHRINE_TINT;
}

// ---- global palette --------------------------------------------------------

export const CHEST_GLOW = '#ffc23a';
export const MERCHANT_GLOW = '#ffd070';
export const HOSTILE = PROJECTILE_CORE;
export const HOSTILE_GLOW = '#ff2f63';
export const INK = '#05090b';
/** The Verdant Hollow ground, for contrast checks (content/biomes.ts). */
export const GROUND_REFERENCE = '#1d2a22';
