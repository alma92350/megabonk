/**
 * Ground dressing, drawn inside the map clip by drawGround: low-contrast grass
 * tufts, clover, pebbles and the odd muted flower. Deterministic by cell hash,
 * culled to the viewport, batched to one path per colour. It must always lose
 * to a pickup, so every colour here is close to the ground colour.
 */

import { projectX, projectY, visibleWorldBounds, type Camera, type Viewport } from '../projection.js';
import type { Ctx2D } from '../ctx.js';
import type { Interactable } from '@megabonk/sim';
import { Y_SQUASH } from '../projection.js';
import {
  DECOR_CELL, DECOR_CLOVER, DECOR_FLOWER, DECOR_PEBBLE, DECOR_TUFT,
  LARGE_LOG, LARGE_RING, MAX_LARGE, largeCellRange, largeHash, largeKind, largeX, largeY, nearInteractable,
  cellHash, cellRange, decorKind, decorX, decorY,
} from './decor.js';

const range = { x0: 0, x1: 0, y0: 0, y1: 0 };
const lrange = { x0: 0, x1: 0, y0: 0, y1: 0 };
const NO_INTERACTABLES: readonly Interactable[] = [];
const TAU = Math.PI * 2;

/** Faint lit clearing under each shrine, then the rare fallen logs and mushroom rings. */
function drawLandmarks(
  ctx: Ctx2D, cam: Camera, view: Viewport, minX: number, maxX: number, minY: number, maxY: number,
  list: readonly Interactable[],
): void {
  const k = cam.zoom / 32;
  let any = false;
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const it = list[i]!;
    if (it.kind !== 'shrine') continue;
    if (it.pos.x < minX - 5 || it.pos.x > maxX + 5 || it.pos.y < minY - 5 || it.pos.y > maxY + 5) continue;
    const x = projectX(it.pos.x, cam, view), y = projectY(it.pos.y, 0, cam, view);
    const r = 4.4 * cam.zoom;
    ctx.moveTo(x + r, y);
    ctx.ellipse(x, y, r, r * Y_SQUASH, 0, 0, TAU);
    any = true;
  }
  if (any) {
    ctx.fillStyle = '#e8d9a8';
    ctx.globalAlpha = 0.045;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  largeCellRange(minX, maxX, minY, maxY, lrange);
  for (let pass = 0; pass < 4; pass++) {
    let drew = false;
    let n = 0;
    ctx.beginPath();
    for (let cy = lrange.y0; cy <= lrange.y1; cy++) {
      for (let cx = lrange.x0; cx <= lrange.x1; cx++) {
        const h = largeHash(cx, cy);
        const kind = largeKind(h);
        if (kind === 0) continue;
        if (++n > MAX_LARGE) break;
        const wx = largeX(h, cx), wy = largeY(h, cy);
        if (wx < minX || wx > maxX || wy < minY || wy > maxY) continue;
        if (nearInteractable(wx, wy, list, 3.5)) continue;
        const x = projectX(wx, cam, view), y = projectY(wy, 0, cam, view);
        if (kind === LARGE_LOG) {
          const len = (1.5 + ((h >>> 4) & 7) * 0.12) * cam.zoom;
          const th = 0.55 * cam.zoom * Y_SQUASH;
          const rot = (((h >>> 7) & 15) / 15 - 0.5) * 0.7;
          if (pass === 0) {
            ctx.moveTo(x + len, y);
            ctx.ellipse(x, y, len, th, rot, 0, TAU); drew = true;
          } else if (pass === 1) {
            ctx.moveTo(x + len * 0.55, y - th * 0.45);
            ctx.ellipse(x - len * 0.1, y - th * 0.45, len * 0.55, th * 0.4, rot, 0, TAU); drew = true;
          } else if (pass === 2) {
            const ex = x + Math.cos(rot) * len, ey = y + Math.sin(rot) * len;
            ctx.moveTo(ex + th * 0.7, ey);
            ctx.ellipse(ex, ey, th * 0.7, th * 0.85, rot, 0, TAU); drew = true;
          }
        } else if (kind === LARGE_RING) {
          const rr = 1.15 * cam.zoom;
          if (pass === 3) {
            const cr = 0.2 * cam.zoom;
            for (let c = 0; c < 8; c++) {
              const a = (c / 8) * TAU + (h & 7);
              const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * Y_SQUASH - cr * 0.8;
              ctx.moveTo(px + cr, py);
              ctx.ellipse(px, py, cr, cr * 0.7, 0, 0, TAU);
            }
            drew = true;
          } else if (pass === 1) {
            ctx.moveTo(x + rr, y);
            ctx.ellipse(x, y, rr, rr * Y_SQUASH, 0, 0, TAU); drew = true;
          }
        }
      }
    }
    if (!drew) continue;
    if (pass === 0) { ctx.fillStyle = '#3b2e25'; ctx.globalAlpha = 0.85; ctx.fill(); }
    else if (pass === 1) {
      // Moss on logs, and the darker grass ring the mushrooms stand on.
      ctx.fillStyle = '#2f4a37'; ctx.globalAlpha = 0.4; ctx.fill();
      ctx.strokeStyle = '#2f4a37'; ctx.lineWidth = Math.max(1, 1.5 * k); ctx.globalAlpha = 0.4; ctx.stroke();
    } else if (pass === 2) { ctx.fillStyle = '#54402f'; ctx.globalAlpha = 0.85; ctx.fill(); }
    else { ctx.fillStyle = '#a89f86'; ctx.globalAlpha = 0.5; ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}

export function drawGroundDecor(
  ctx: Ctx2D, cam: Camera, view: Viewport, halfExtent: number,
  interactables: readonly Interactable[] = NO_INTERACTABLES,
): void {
  const b = visibleWorldBounds(cam, view, DECOR_CELL);
  const minX = Math.max(-halfExtent, b.minX), maxX = Math.min(halfExtent, b.maxX);
  const minY = Math.max(-halfExtent, b.minY), maxY = Math.min(halfExtent, b.maxY);
  if (maxX <= minX || maxY <= minY) return;
  drawLandmarks(ctx, cam, view, minX, maxX, minY, maxY, interactables);
  cellRange(minX, maxX, minY, maxY, range);
  const k = cam.zoom / 32;

  for (let pass = 0; pass < 5; pass++) {
    let any = false;
    ctx.beginPath();
    for (let cy = range.y0; cy <= range.y1; cy++) {
      for (let cx = range.x0; cx <= range.x1; cx++) {
        const h = cellHash(cx, cy);
        const kind = decorKind(h);
        if (kind === 0) continue;
        const flowerB = kind === DECOR_FLOWER && ((h >>> 27) & 1) === 1;
        const want =
          pass === 0 ? kind === DECOR_TUFT
            : pass === 1 ? kind === DECOR_PEBBLE
              : pass === 2 ? kind === DECOR_CLOVER
                : pass === 3 ? kind === DECOR_FLOWER && !flowerB
                  : flowerB;
        if (!want) continue;
        const wx = decorX(h, cx), wy = decorY(h, cy);
        if (wx < minX || wx > maxX || wy < minY || wy > maxY) continue;
        const x = projectX(wx, cam, view);
        const y = projectY(wy, 0, cam, view);
        any = true;
        if (pass === 0) {
          const s = 1 + ((h >>> 5) & 3) * 0.18;
          ctx.moveTo(x - 3 * k, y); ctx.lineTo(x - 5 * k * s, y - 7 * k * s);
          ctx.moveTo(x, y); ctx.lineTo(x + 0.5 * k, y - 9 * k * s);
          ctx.moveTo(x + 3 * k, y); ctx.lineTo(x + 5.5 * k * s, y - 6 * k * s);
        } else if (pass === 1) {
          const r = (2.2 + ((h >>> 5) & 3) * 0.8) * k;
          ctx.moveTo(x + r, y);
          ctx.ellipse(x, y, r, r * 0.65, 0, 0, Math.PI * 2);
        } else if (pass === 2) {
          const r = 2.2 * k;
          for (let i = 0; i < 3; i++) {
            const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
            const px = x + Math.cos(a) * r * 1.1, py = y + Math.sin(a) * r * 0.75;
            ctx.moveTo(px + r, py);
            ctx.ellipse(px, py, r, r * 0.7, 0, 0, Math.PI * 2);
          }
        } else {
          const r = 1.7 * k;
          ctx.moveTo(x + r, y - 4 * k);
          ctx.arc(x, y - 4 * k, r, 0, Math.PI * 2);
        }
      }
    }
    if (!any) continue;
    if (pass === 0) {
      ctx.strokeStyle = '#2f4a37';
      ctx.lineWidth = Math.max(1, 1.5 * k);
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineCap = 'butt';
    } else {
      ctx.fillStyle = pass === 1 ? '#2f3c35' : pass === 2 ? '#2b4632' : pass === 3 ? '#8a84a6' : '#a59b78';
      ctx.globalAlpha = pass >= 3 ? 0.5 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
