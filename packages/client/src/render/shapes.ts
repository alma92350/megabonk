/**
 * The silhouette vocabulary.
 *
 * Every actor in the game is one of these paths, filled flat, outlined in ink,
 * and rim-lit along the top. No gradients, no blur, no per-entity allocation —
 * at 1500 entities those three rules are the whole performance story.
 */

import type { Ctx2D } from './ctx.js';
import type { EnemyShape, RarityShape } from './theme.js';

export function pathBlob(ctx: Ctx2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.quadraticCurveTo(x - r, y - r * 1.55, x, y - r * 1.55);
  ctx.quadraticCurveTo(x + r, y - r * 1.55, x + r, y);
  ctx.quadraticCurveTo(x + r * 0.9, y + r * 0.55, x, y + r * 0.55);
  ctx.quadraticCurveTo(x - r * 0.9, y + r * 0.55, x - r, y);
  ctx.closePath();
}

export function pathDart(ctx: Ctx2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.9);
  ctx.lineTo(x + r * 0.85, y + r * 0.2);
  ctx.lineTo(x, y + r * 0.6);
  ctx.lineTo(x - r * 0.85, y + r * 0.2);
  ctx.closePath();
}

export function pathHulk(ctx: Ctx2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x - r * 1.05, y + r * 0.5);
  ctx.lineTo(x - r * 0.8, y - r * 1.25);
  ctx.lineTo(x - r * 0.3, y - r * 1.6);
  ctx.lineTo(x + r * 0.3, y - r * 1.6);
  ctx.lineTo(x + r * 0.8, y - r * 1.25);
  ctx.lineTo(x + r * 1.05, y + r * 0.5);
  ctx.closePath();
}

export function pathLob(ctx: Ctx2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x - r * 0.75, y + r * 0.45);
  ctx.quadraticCurveTo(x - r * 1.15, y - r * 0.9, x, y - r * 1.75);
  ctx.quadraticCurveTo(x + r * 1.15, y - r * 0.9, x + r * 0.75, y + r * 0.45);
  ctx.closePath();
}

export function pathBug(ctx: Ctx2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.55, r * 0.95, r * 0.8, 0, 0, Math.PI * 2);
  ctx.closePath();
}

export function pathSlab(ctx: Ctx2D, x: number, y: number, r: number): void {
  const w = r * 1.05;
  const h = r * 1.85;
  ctx.beginPath();
  ctx.moveTo(x - w, y + r * 0.45);
  ctx.lineTo(x - w, y - h + r * 0.35);
  ctx.lineTo(x - w * 0.55, y - h);
  ctx.lineTo(x + w * 0.55, y - h);
  ctx.lineTo(x + w, y - h + r * 0.35);
  ctx.lineTo(x + w, y + r * 0.45);
  ctx.closePath();
}

/** The boss. Broad shoulders, horned crest — legible at any crowd density. */
export function pathCrown(ctx: Ctx2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x - r * 1.15, y + r * 0.5);
  ctx.lineTo(x - r * 1.0, y - r * 0.9);
  ctx.lineTo(x - r * 1.35, y - r * 1.75);
  ctx.lineTo(x - r * 0.5, y - r * 1.3);
  ctx.lineTo(x - r * 0.25, y - r * 1.95);
  ctx.lineTo(x, y - r * 1.4);
  ctx.lineTo(x + r * 0.25, y - r * 1.95);
  ctx.lineTo(x + r * 0.5, y - r * 1.3);
  ctx.lineTo(x + r * 1.35, y - r * 1.75);
  ctx.lineTo(x + r * 1.0, y - r * 0.9);
  ctx.lineTo(x + r * 1.15, y + r * 0.5);
  ctx.closePath();
}

/** Ranged archetype: hunched, hooded, one arm raised holding an orb. */
export function pathCaster(ctx: Ctx2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x - r * 0.85, y + r * 0.45);
  ctx.lineTo(x - r * 0.7, y - r * 0.75);
  ctx.quadraticCurveTo(x - r * 0.75, y - r * 1.85, x, y - r * 1.95);
  ctx.quadraticCurveTo(x + r * 0.55, y - r * 1.9, x + r * 0.6, y - r * 1.3);
  ctx.lineTo(x + r * 1.25, y - r * 1.95);
  ctx.lineTo(x + r * 1.45, y - r * 1.6);
  ctx.lineTo(x + r * 0.8, y - r * 0.9);
  ctx.lineTo(x + r * 0.85, y + r * 0.45);
  ctx.closePath();
}

export function pathEnemy(ctx: Ctx2D, shape: EnemyShape, x: number, y: number, r: number): void {
  switch (shape) {
    case 'dart': pathDart(ctx, x, y, r); break;
    case 'hulk': pathHulk(ctx, x, y, r); break;
    case 'lob': pathLob(ctx, x, y, r); break;
    case 'bug': pathBug(ctx, x, y, r); break;
    case 'slab': pathSlab(ctx, x, y, r); break;
    case 'crown': pathCrown(ctx, x, y, r); break;
    case 'caster': pathCaster(ctx, x, y, r); break;
    case 'blob':
    default: pathBlob(ctx, x, y, r); break;
  }
}

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
  ctx.ellipse(x, y, rx, Math.max(1, rx * 0.42), 0, 0, Math.PI * 2);
}
