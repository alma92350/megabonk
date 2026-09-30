/**
 * The silhouette vocabulary.
 *
 * Rarity sigils and contact shadows. Creatures are baked sprites (see ./creatures/).
 */

import type { Ctx2D } from './ctx.js';
import type { RarityShape } from './theme.js';

// Enemy silhouettes now live in ./creatures/ (baked sprites with faces and shading).

/** AC-19.1 cue 2: the rarity sigils. Five shapes, no two alike in silhouette. */
export function pathRaritySigil(ctx: Ctx2D, shape: RarityShape, x: number, y: number, r: number): void {
  switch (shape) {
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
    case 'shield':
      ctx.beginPath();
      ctx.moveTo(x - r, y - r * 0.85);
      ctx.lineTo(x + r, y - r * 0.85);
      ctx.lineTo(x + r, y + r * 0.1);
      ctx.quadraticCurveTo(x + r, y + r, x, y + r);
      ctx.quadraticCurveTo(x - r, y + r, x - r, y + r * 0.1);
      ctx.closePath();
      break;
    case 'star':
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        const radius = i % 2 === 0 ? r : r * 0.45;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    case 'crown':
      ctx.beginPath();
      ctx.moveTo(x - r, y + r * 0.7);
      ctx.lineTo(x - r, y - r * 0.5);
      ctx.lineTo(x - r * 0.5, y);
      ctx.lineTo(x, y - r * 0.9);
      ctx.lineTo(x + r * 0.5, y);
      ctx.lineTo(x + r, y - r * 0.5);
      ctx.lineTo(x + r, y + r * 0.7);
      ctx.closePath();
      break;
    case 'disc':
    default:
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.closePath();
      break;
  }
}

/** A flat contact ellipse. Adds a whole dimension for the price of one fill. */
export function pathContactShadow(ctx: Ctx2D, x: number, y: number, rx: number): void {
  const ry = Math.max(1, rx * 0.42);
  // moveTo FIRST. Every shadow in the frame shares one path for batching, and
  // ellipse() appends to the current subpath: without this, each ellipse is
  // joined to the previous one by a straight line, and the fill renders those
  // connectors as long black wedges across the screen. The batching optimisation
  // is what makes this necessary — a per-entity beginPath would hide it.
  ctx.moveTo(x + rx, y);
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}
