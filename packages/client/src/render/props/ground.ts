/**
 * Ground dressing, drawn inside the map clip by drawGround: low-contrast grass
 * tufts, clover, pebbles and the odd muted flower. Deterministic by cell hash,
 * culled to the viewport, batched to one path per colour. It must always lose
 * to a pickup, so every colour here is close to the ground colour.
 */

import { projectX, projectY, visibleWorldBounds, type Camera, type Viewport } from '../projection.js';
import type { Ctx2D } from '../ctx.js';
import {
  DECOR_CELL, DECOR_CLOVER, DECOR_FLOWER, DECOR_PEBBLE, DECOR_TUFT,
  cellHash, cellRange, decorKind, decorX, decorY,
} from './decor.js';

const range = { x0: 0, x1: 0, y0: 0, y1: 0 };

export function drawGroundDecor(ctx: Ctx2D, cam: Camera, view: Viewport, halfExtent: number): void {
  const b = visibleWorldBounds(cam, view, DECOR_CELL);
  const minX = Math.max(-halfExtent, b.minX), maxX = Math.min(halfExtent, b.maxX);
  const minY = Math.max(-halfExtent, b.minY), maxY = Math.min(halfExtent, b.maxY);
  if (maxX <= minX || maxY <= minY) return;
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
