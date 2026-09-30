/**
 * Obstacles: a mossy forest. Low ones are squat boulders and cut stumps
 * (passable-looking; they do not block shots), tall ones are broad-crowned
 * trees and rock spires (they block sight and shots, and look like it).
 *
 * All muted, low-saturation and dark: scenery recedes, rewards pop. One hard ink
 * outline, light from the upper left.
 */

import type { Obstacle } from '@megabonk/sim';
import type { Ctx2D } from '../ctx.js';
import { Y_SQUASH, Z_LIFT } from '../projection.js';
import type { SpriteCache } from '../atlas.js';
import { U, obstacleStyle, seedOf, type ObstacleStyle } from './obstacleStyle.js';
import { Prop, inkStroke, polygon, propCache } from './bake.js';

const ROCK = '#3f4a44';
const ROCK_DARK = '#252d29';
const ROCK_LIGHT = '#57655b';
const MOSS = '#3f5c37';
const MOSS_LIGHT = '#557a48';
const BARK = '#4a3a2b';
const BARK_DARK = '#2f241a';
const LEAF_DARK = '#1c3624';
const LEAF_MID = '#284b31';
const LEAF_LIGHT = '#376340';

function mossBlobs(ctx: Ctx2D, pts: readonly number[], r: number): void {
  ctx.fillStyle = MOSS;
  ctx.beginPath();
  for (let i = 0; i + 1 < pts.length; i += 2) {
    ctx.moveTo(pts[i]! + r, pts[i + 1]!);
    ctx.ellipse(pts[i]!, pts[i + 1]!, r, r * 0.6, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = MOSS_LIGHT;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  for (let i = 0; i + 1 < pts.length; i += 2) {
    ctx.moveTo(pts[i]! - r * 0.2 + r * 0.55, pts[i + 1]! - r * 0.2);
    ctx.ellipse(pts[i]! - r * 0.2, pts[i + 1]! - r * 0.2, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}

function paintBoulder(ctx: Ctx2D, st: ObstacleStyle): void {
  const rx = st.rB * U;
  const ry = rx * Y_SQUASH;
  const lift = st.hB * U * Z_LIFT;
  const top = lift * 0.9 + rx * 0.3;
  const v = st.variant === 0 ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(-rx, 0);
  ctx.quadraticCurveTo(-rx * 1.05, -top * 1.05, -rx * 0.3 * v, -top);
  ctx.quadraticCurveTo(rx * 0.55 * v, -top * 1.2, rx * 0.98, -top * 0.5);
  ctx.quadraticCurveTo(rx * 1.06, -top * 0.1, rx, 0);
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = ROCK;
  ctx.fill();
  // Shaded underside and right flank.
  ctx.fillStyle = ROCK_DARK;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(rx, 0);
  ctx.quadraticCurveTo(rx * 1.06, -top * 0.1, rx * 0.98, -top * 0.5);
  ctx.quadraticCurveTo(rx * 0.5, -top * 0.4, rx * 0.3, 0);
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = ROCK_LIGHT;
  ctx.beginPath();
  ctx.ellipse(-rx * 0.38, -top * 0.62, rx * 0.34, top * 0.24, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Moss cap draped over the top.
  mossBlobs(ctx, [-rx * 0.2 * v, -top * 0.93, rx * 0.35, -top * 0.9, -rx * 0.62, -top * 0.6], rx * 0.3);
  // Outline.
  ctx.beginPath();
  ctx.moveTo(-rx, 0);
  ctx.quadraticCurveTo(-rx * 1.05, -top * 1.05, -rx * 0.3 * v, -top);
  ctx.quadraticCurveTo(rx * 0.55 * v, -top * 1.2, rx * 0.98, -top * 0.5);
  ctx.quadraticCurveTo(rx * 1.06, -top * 0.1, rx, 0);
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
  ctx.closePath();
  inkStroke(ctx, 2);
  // A crack.
  ctx.strokeStyle = ROCK_DARK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rx * 0.2, -top * 0.55);
  ctx.lineTo(rx * 0.1, -top * 0.3);
  ctx.lineTo(rx * 0.24, -top * 0.12);
  ctx.stroke();
}

function paintStump(ctx: Ctx2D, st: ObstacleStyle): void {
  const rx = st.rB * U * 0.9;
  const ry = rx * Y_SQUASH;
  const lift = st.hB * U * Z_LIFT;
  // Side wall + root flare.
  ctx.beginPath();
  ctx.moveTo(-rx * 1.12, 2);
  ctx.quadraticCurveTo(-rx, -lift * 0.3, -rx, -lift);
  ctx.lineTo(rx, -lift);
  ctx.quadraticCurveTo(rx, -lift * 0.3, rx * 1.12, 2);
  ctx.ellipse(0, 0, rx * 1.12, ry * 1.1, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = BARK;
  ctx.fill();
  ctx.fillStyle = BARK_DARK;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(rx * 0.2, -lift, rx * 0.85, lift);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = BARK_DARK;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-rx * 0.5, -lift + 2); ctx.lineTo(-rx * 0.5, -3);
  ctx.moveTo(-rx * 0.1, -lift + 2); ctx.lineTo(-rx * 0.1, -6);
  ctx.stroke();
  // Cut top with growth rings.
  ctx.beginPath();
  ctx.ellipse(0, -lift, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#6f5c40';
  ctx.fill();
  inkStroke(ctx, 2);
  ctx.strokeStyle = '#574730';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, -lift, rx * 0.65, ry * 0.65, 0, 0, Math.PI * 2);
  ctx.moveTo(rx * 0.3, -lift);
  ctx.ellipse(0, -lift, rx * 0.3, ry * 0.3, 0, 0, Math.PI * 2);
  ctx.stroke();
  mossBlobs(ctx, [rx * 0.55, -lift + ry * 0.1, -rx * 0.75, -lift * 0.3], rx * 0.28);
}

function paintTree(ctx: Ctx2D, st: ObstacleStyle): void {
  const rx = st.rB * U;
  const lift = st.hB * U * Z_LIFT;
  const R = rx;
  const tw = rx * 0.32;
  const trunkTop = lift * 0.9;
  // Trunk with a root flare.
  ctx.beginPath();
  ctx.moveTo(-tw * 1.9, 3);
  ctx.quadraticCurveTo(-tw * 0.9, -6, -tw, -trunkTop * 0.5);
  ctx.lineTo(-tw * 0.85, -trunkTop);
  ctx.lineTo(tw * 0.85, -trunkTop);
  ctx.lineTo(tw, -trunkTop * 0.5);
  ctx.quadraticCurveTo(tw * 0.9, -6, tw * 1.9, 3);
  ctx.ellipse(0, 3, tw * 1.9, tw * 0.9, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = BARK;
  ctx.fill();
  ctx.fillStyle = BARK_DARK;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(tw * 0.15, -trunkTop, tw * 1.2, trunkTop);
  ctx.globalAlpha = 1;
  inkStroke(ctx, 2);

  // Crown: overlapping blobs. Ink halo first so the union gets ONE outline.
  const cy = -(lift * 0.8 + R * 0.5);
  const v = st.variant === 0 ? 1 : -1;
  const blobs = [
    [-0.55 * v, 0.2, 0.62], [0.55 * v, 0.22, 0.6], [0, 0.32, 0.6],
    [-0.38 * v, -0.28, 0.6], [0.4 * v, -0.3, 0.58], [0, -0.55, 0.55],
  ] as const;
  ctx.fillStyle = '#05090b';
  ctx.beginPath();
  for (const b of blobs) {
    ctx.moveTo(b[0] * R + b[2] * R + 2.4, cy + b[1] * R * 0.9);
    ctx.arc(b[0] * R, cy + b[1] * R * 0.9, b[2] * R + 2.4, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = LEAF_DARK;
  ctx.beginPath();
  for (const b of blobs) {
    ctx.moveTo(b[0] * R + b[2] * R, cy + b[1] * R * 0.9);
    ctx.arc(b[0] * R, cy + b[1] * R * 0.9, b[2] * R, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = LEAF_MID;
  ctx.beginPath();
  for (const b of blobs) {
    const r = b[2] * R * 0.78;
    const bx = b[0] * R - R * 0.05, by = cy + b[1] * R * 0.9 - R * 0.06;
    ctx.moveTo(bx + r, by);
    ctx.arc(bx, by, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = LEAF_LIGHT;
  ctx.beginPath();
  for (const b of blobs) {
    if (b[1] > 0.1) continue;
    const r = b[2] * R * 0.42;
    const bx = b[0] * R - R * 0.14, by = cy + b[1] * R * 0.9 - R * 0.16;
    ctx.moveTo(bx + r, by);
    ctx.arc(bx, by, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

function paintCrag(ctx: Ctx2D, st: ObstacleStyle): void {
  const rx = st.rB * U;
  const ry = rx * Y_SQUASH;
  const lift = st.hB * U * Z_LIFT;
  const ht = lift * 1.35 + rx * 0.5;
  const s = st.variant === 0 ? 1 : -1;
  ctx.save();
  ctx.scale(s, 1);
  const outline = [
    -rx, 0, -rx * 0.92, -ht * 0.33, -rx * 0.55, -ht * 0.62, -rx * 0.2, -ht * 0.82, 0, -ht,
    rx * 0.28, -ht * 0.78, rx * 0.62, -ht * 0.55, rx * 0.95, -ht * 0.28, rx, 0,
  ];
  const trace = (): void => {
    ctx.beginPath();
    ctx.moveTo(outline[0]!, outline[1]!);
    for (let i = 2; i + 1 < outline.length; i += 2) ctx.lineTo(outline[i]!, outline[i + 1]!);
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
    ctx.closePath();
  };
  trace();
  ctx.fillStyle = ROCK;
  ctx.fill();
  // Lit facet (left), dark facet (right).
  polygon(ctx, [-rx, 0, -rx * 0.92, -ht * 0.33, -rx * 0.55, -ht * 0.62, -rx * 0.2, -ht * 0.82, 0, -ht, -rx * 0.02, -ht * 0.4, -rx * 0.3, 0]);
  ctx.fillStyle = ROCK_LIGHT;
  ctx.globalAlpha = 0.55;
  ctx.fill();
  polygon(ctx, [0, -ht, rx * 0.28, -ht * 0.78, rx * 0.62, -ht * 0.55, rx * 0.95, -ht * 0.28, rx, 0, rx * 0.25, 0, rx * 0.1, -ht * 0.4]);
  ctx.fillStyle = ROCK_DARK;
  ctx.globalAlpha = 0.65;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ROCK_DARK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-rx * 0.02, -ht * 0.4); ctx.lineTo(rx * 0.1, -ht * 0.4);
  ctx.moveTo(-rx * 0.3, -ht * 0.2); ctx.lineTo(-rx * 0.1, -ht * 0.05);
  ctx.moveTo(-rx * 0.05, -ht * 0.4); ctx.lineTo(-rx * 0.02, -ht * 0.7);
  ctx.stroke();
  mossBlobs(ctx, [-rx * 0.55, -rx * 0.12, rx * 0.5, -rx * 0.1, rx * 0.05, -ht * 0.45], rx * 0.24);
  trace();
  inkStroke(ctx, 2);
  ctx.restore();
}

function paintObstacle(ctx: Ctx2D, st: ObstacleStyle): void {
  switch (st.kind) {
    case 'boulder': paintBoulder(ctx, st); break;
    case 'stump': paintStump(ctx, st); break;
    case 'tree': paintTree(ctx, st); break;
    default: paintCrag(ctx, st);
  }
}

const props = new Map<string, Prop>();

/** Draw an obstacle whose projected base centre is (x, baseY). */
export function drawObstacleProp(
  ctx: Ctx2D, o: Obstacle, x: number, baseY: number, zoom: number, cache: SpriteCache = propCache,
): void {
  const st = obstacleStyle(o.radius, o.height, seedOf(o.pos.x, o.pos.y));
  let prop = props.get(st.key);
  if (prop === undefined) {
    prop = new Prop(st.key, st.width, st.height, (c) => paintObstacle(c, st), { ax: 0.5, ay: st.ay });
    props.set(st.key, prop);
  }
  // Scale the bucketed sprite to the true radius so footprints match the sim.
  const r = o.radius / st.rB;
  prop.draw(ctx, cache, zoom, x, baseY, 1, r, r);
}
