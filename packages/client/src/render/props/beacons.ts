/**
 * Off-screen beacons.
 *
 * A reward you cannot see cannot pull the eye, and the world is several screens
 * wide. Every armed chest and shrine, and the merchant, gets a small badge
 * pinned to the screen edge in the direction of the object, tinted like the
 * object itself and fading with distance. Drawn after the fog so it is never
 * dimmed. Bounded: there are only a handful of interactables per map.
 */

import type { GameState } from '@megabonk/sim';
import type { Ctx2D } from '../ctx.js';
import { projectX, projectY, type Camera, type Viewport } from '../projection.js';
import { glowPulse } from './motion.js';
import { paintGlyph } from './interactables.js';
import { CHEST_GLOW, INK, MERCHANT_GLOW, shrineTint } from './palette.js';

export const BEACON_INSET = 36;
/** Top and bottom keep clear of the HP bar, timer and hotbar. */
export const BEACON_INSET_Y = 82;
export const BEACON_RANGE = 95;
const HIDE_MARGIN = 60;

export interface Placement {
  x: number;
  y: number;
  /** Radians, screen space, pointing from the screen centre towards the target. */
  angle: number;
}

/**
 * Where to pin a badge for a target at screen (sx, sy). Returns false when the
 * target is already on screen (within `inset` of the edge), true otherwise.
 */
export function beaconPlacement(
  sx: number, sy: number, view: Viewport, insetX: number, insetY: number, out: Placement,
): boolean {
  const cx = view.width / 2, cy = view.height / 2;
  const dx = sx - cx, dy = sy - cy;
  const hw = cx - insetX, hh = cy - insetY;
  if (hw <= 0 || hh <= 0) return false;
  // Hide only when the object itself is (nearly) on screen; sprites reach ~60px above their base.
  if (Math.abs(dx) <= cx + HIDE_MARGIN && Math.abs(dy) <= cy + HIDE_MARGIN) return false;
  const t = Math.min(hw / (Math.abs(dx) || 1e-9), hh / (Math.abs(dy) || 1e-9));
  out.x = cx + dx * t;
  out.y = cy + dy * t;
  out.angle = Math.atan2(dy, dx);
  return true;
}

/** Beacon opacity by world distance: 1 when close, fading to a floor at range. */
export function beaconAlpha(distance: number): number {
  const a = 1 - distance / BEACON_RANGE;
  return a < 0.6 ? 0.6 : a > 1 ? 1 : a;
}

const place: Placement = { x: 0, y: 0, angle: 0 };

function badge(
  ctx: Ctx2D, p: Placement, color: string, alpha: number, pulse: number, icon: 'chest' | 'glyph' | 'purse',
  glyph: Parameters<typeof paintGlyph>[1],
): void {
  ctx.globalAlpha = alpha;
  // Arrow pointing outward.
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.beginPath();
  ctx.moveTo(29 + 3 * pulse, 0);
  ctx.lineTo(19, -7);
  ctx.lineTo(19, 7);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
  ctx.fillStyle = '#100d09';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = color;
  if (icon === 'chest') {
    ctx.fillRect(p.x - 8, p.y - 4, 16, 10);
    ctx.beginPath();
    ctx.moveTo(p.x - 8, p.y - 4);
    ctx.quadraticCurveTo(p.x, p.y - 12, p.x + 8, p.y - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#100d09';
    ctx.fillRect(p.x - 1.4, p.y - 2, 2.8, 5);
  } else if (icon === 'purse') {
    ctx.beginPath();
    ctx.arc(p.x, p.y + 2, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(p.x - 3.5, p.y - 9, 7, 4);
    ctx.fillStyle = '#100d09';
    ctx.beginPath();
    ctx.arc(p.x, p.y + 2, 2.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.save();
    ctx.translate(p.x, p.y);
    paintGlyph(ctx, glyph, 8);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export const BEACON_MAX = 3;

export type BeaconKind = 'chest' | 'shrine' | 'merchant';

export interface BeaconPick {
  kind: BeaconKind;
  id: number;
  dist: number;
  shrineId: string | undefined;
  x: number;
  y: number;
  angle: number;
}

const picks: BeaconPick[] = [0, 1, 2].map(() => ({
  kind: 'chest' as BeaconKind, id: 0, dist: 0, shrineId: undefined, x: 0, y: 0, angle: 0,
}));

function take(slot: number, kind: BeaconKind, id: number, dist: number, shrineId: string | undefined): void {
  const p = picks[slot]!;
  p.kind = kind; p.id = id; p.dist = dist; p.shrineId = shrineId;
  p.x = place.x; p.y = place.y; p.angle = place.angle;
}

/**
 * At most BEACON_MAX badges: the nearest armed off-screen chest, the nearest
 * armed off-screen shrine, and the merchant when present. There are never
 * XP-chevron beacons: gems are short-range and the magnet handles them.
 * Fills `out` (cleared first) with reused records; returns the count.
 */
export function selectBeacons(
  state: GameState, cam: Camera, view: Viewport, out: BeaconPick[],
): number {
  out.length = 0;
  const list = state.interactables;
  let chest = -1, chestD = Infinity, shrine = -1, shrineD = Infinity;
  for (let i = 0; i < list.length; i++) {
    const it = list[i]!;
    if (it.used) continue;
    const d = Math.hypot(it.pos.x - cam.x, it.pos.y - cam.y);
    if (it.kind === 'chest' ? d >= chestD : d >= shrineD) continue;
    const sx = projectX(it.pos.x, cam, view), sy = projectY(it.pos.y, 0, cam, view);
    if (!beaconPlacement(sx, sy, view, BEACON_INSET, BEACON_INSET_Y, place)) continue;
    if (it.kind === 'chest') {
      chest = i; chestD = d;
      take(0, 'chest', it.id, d, undefined);
    } else {
      shrine = i; shrineD = d;
      take(1, 'shrine', it.id, d, it.shrineId);
    }
  }
  if (chest >= 0) out.push(picks[0]!);
  if (shrine >= 0) out.push(picks[1]!);
  const m = state.merchant;
  if (m !== null) {
    const sx = projectX(m.pos.x, cam, view), sy = projectY(m.pos.y, 0, cam, view);
    if (beaconPlacement(sx, sy, view, BEACON_INSET, BEACON_INSET_Y, place)) {
      take(2, 'merchant', 0, Math.hypot(m.pos.x - cam.x, m.pos.y - cam.y), undefined);
      out.push(picks[2]!);
    }
  }
  return out.length;
}

const chosen: BeaconPick[] = [];

export function drawBeacons(
  ctx: Ctx2D, state: GameState, cam: Camera, view: Viewport, time: number, reduce: boolean,
): void {
  const n = selectBeacons(state, cam, view, chosen);
  for (let i = 0; i < n; i++) {
    const p = chosen[i]!;
    place.x = p.x; place.y = p.y; place.angle = p.angle;
    const a = beaconAlpha(p.dist);
    if (p.kind === 'chest') badge(ctx, place, CHEST_GLOW, a, glowPulse(time, p.id, reduce), 'chest', 'star');
    else if (p.kind === 'shrine') {
      const t = shrineTint(p.shrineId);
      badge(ctx, place, t.color, a, glowPulse(time, p.id, reduce), 'glyph', t.glyph);
    } else {
      badge(ctx, place, MERCHANT_GLOW, a, glowPulse(time, 0.7, reduce), 'purse', 'star');
    }
  }
}
