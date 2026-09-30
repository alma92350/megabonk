/**
 * Enemy shots. Hot pink, and nothing else in the game is pink.
 *
 * Danger must be readable at speed and against every background, so a shot is:
 *  - a glowing orb (baked halo + ink-ringed head with a white-hot core);
 *  - a tapered comet trail behind it (long enough to show direction, and it
 *    lengthens with speed);
 *  - a ground marker: a ring under the orb and a faint line ahead on the
 *    ground, so the player can judge the shot's line, not just its position.
 */

import type { Projectile } from '@megabonk/sim';
import type { Ctx2D } from '../ctx.js';
import { Y_SQUASH, projectX, projectY, type Camera, type Viewport } from '../projection.js';
import type { SpriteCache } from '../atlas.js';
import { PROJECTILE_CORE, PROJECTILE_HEAD } from '../theme.js';
import { glowPulse } from './motion.js';
import { Prop, paintHalo, propCache } from './bake.js';
import { HOSTILE_GLOW, INK, rgba } from './palette.js';

const AIR_Z = 0.5;
const TRAIL_SECONDS = 0.17;

function paintHead(ctx: Ctx2D): void {
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fillStyle = PROJECTILE_CORE;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-1, -1, 5.6, 0, Math.PI * 2);
  ctx.fillStyle = PROJECTILE_HEAD;
  ctx.fill();
}

const HALO = new Prop('pj:halo', 100, 100, (c) => paintHalo(c, HOSTILE_GLOW, 50, 0.9));
const HEAD = new Prop('pj:head', 26, 26, paintHead);

export function drawProjectileProp(
  ctx: Ctx2D, q: Projectile, cam: Camera, view: Viewport, wx: number, wy: number,
  time: number, reduce: boolean, cache: SpriteCache = propCache,
): void {
  const zoom = cam.zoom;
  const x = projectX(wx, cam, view);
  const y = projectY(wy, AIR_Z, cam, view);
  const gx = x;
  const gy = projectY(wy, 0, cam, view);
  const R = Math.max(5, q.radius * zoom * 1.25);
  const speed = Math.hypot(q.vel.x, q.vel.y);

  // Ground marker first (it is on the floor, under everything).
  ctx.lineCap = 'round';
  if (speed > 0.01) {
    const ax = projectX(wx + q.vel.x * 0.32, cam, view);
    const ay = projectY(wy + q.vel.y * 0.32, 0, cam, view);
    ctx.strokeStyle = rgba(HOSTILE_GLOW, 0.32);
    ctx.lineWidth = Math.max(2, R * 0.4);
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(ax, ay);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(HOSTILE_GLOW, 0.6);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(gx, gy, R * 1.1, R * 1.1 * Y_SQUASH, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Comet trail: two tapered layers, wide+faint under narrow+bright.
  if (speed > 0.01) {
    const tx = projectX(wx - q.vel.x * TRAIL_SECONDS, cam, view);
    const ty = projectY(wy - q.vel.y * TRAIL_SECONDS, AIR_Z, cam, view);
    const dx = x - tx, dy = y - ty;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      const nx = -dy / len, ny = dx / len;
      ctx.fillStyle = rgba(PROJECTILE_CORE, 0.3);
      ctx.beginPath();
      ctx.moveTo(x + nx * R * 1.15, y + ny * R * 1.15);
      ctx.lineTo(tx, ty);
      ctx.lineTo(x - nx * R * 1.15, y - ny * R * 1.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = rgba(PROJECTILE_CORE, 0.85);
      ctx.beginPath();
      ctx.moveTo(x + nx * R * 0.6, y + ny * R * 0.6);
      ctx.lineTo(x - dx * 0.75 / 1, y - dy * 0.75);
      ctx.lineTo(x - nx * R * 0.6, y - ny * R * 0.6);
      ctx.closePath();
      ctx.fill();
    }
  }

  const s = R / 10;
  const pulse = glowPulse(time, q.id, reduce);
  // Sizes vary with the projectile's radius, so these are scaled blits (few per frame).
  const bucket = (zoom / 32);
  HALO.draw(ctx, cache, zoom, x, y, 0.55 + 0.4 * pulse, (s * 1.5) / bucket, (s * 1.5) / bucket);
  HEAD.draw(ctx, cache, zoom, x, y, 1, s / bucket, s / bucket);
}
