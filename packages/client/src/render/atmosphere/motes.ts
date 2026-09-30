/**
 * Ambient motes: 24 slow embers/lantern-dust, world-anchored with a touch of
 * parallax. Position is a pure function of (index, camera, time): a hashed home
 * in a repeating tile, slow drift and a lazy sway, wrapped around the camera.
 * No Math.random, no state, no allocation; culled to the viewport and the map.
 * Warm ember-orange and pale lantern white at low alpha: never pink, never gem
 * cyan, never coin gold, always subordinate to a pickup.
 */
import { Y_SQUASH, projectX, projectY } from '../projection.js';
import type { Ctx2D } from '../ctx.js';
import { hash01 } from '../fx/hash.js';
import type { WorldFrame } from '../world.js';

export const MOTE_COUNT = 24;
export const MOTE_HALO = '#ffb46b';
export const MOTE_CORE = '#fff1d6';
const TAU = Math.PI * 2;

export interface MoteOut { x: number; y: number; a: number; r: number }

const wrap = (v: number, size: number): number => ((v % size) + size) % size - size / 2;

/** World position (x, y on the ground plane) of mote `i`, within rw x rh of the camera. */
export function moteAt(
  i: number, camX: number, camY: number, timeMs: number, rw: number, rh: number, reduce: boolean, out: MoteOut,
): void {
  const t = timeMs * 0.001 * (reduce ? 0.25 : 1);
  const hx = hash01(i, 11) * rw, hy = hash01(i, 12) * rh;
  const par = 0.86 + hash01(i, 13) * 0.14;
  const vx = (hash01(i, 14) - 0.3) * 0.5, vy = (hash01(i, 15) - 0.6) * 0.32;
  const ph = hash01(i, 16) * TAU;
  const lx = hx + vx * t + Math.sin(t * 0.7 + ph) * 0.7;
  const ly = hy + vy * t + Math.cos(t * 0.5 + ph) * 0.5;
  out.x = camX + wrap(lx - camX * par, rw);
  out.y = camY + wrap(ly - camY * par, rh);
  out.a = moteAlpha(i, timeMs, reduce);
  out.r = 1.0 + hash01(i, 17) * 0.9;
}

/** Peak 0.55: a low, slow breathing glow. Reduced motion holds it steady. */
export function moteAlpha(i: number, timeMs: number, reduce: boolean): number {
  const base = 0.28 + hash01(i, 18) * 0.22;
  if (reduce) return base;
  return base * (0.65 + 0.35 * Math.sin(timeMs * 0.0011 + hash01(i, 19) * TAU)) + 0.05;
}

const m: MoteOut = { x: 0, y: 0, a: 0, r: 0 };
const sx = new Float32Array(MOTE_COUNT);
const sy = new Float32Array(MOTE_COUNT);
const sr = new Float32Array(MOTE_COUNT);
const sa = new Float32Array(MOTE_COUNT);

export function drawMotes(ctx: Ctx2D, frame: WorldFrame): void {
  const { cam, view, state, time } = frame;
  const reduce = frame.reduceMotion === true;
  if (view.width <= 0 || view.height <= 0 || cam.zoom <= 0) return;
  const half = state.map.halfExtent;
  const rw = view.width / cam.zoom + 4;
  const rh = view.height / (cam.zoom * Y_SQUASH) + 4;
  const step = reduce ? 2 : 1;
  let n = 0;
  for (let i = 0; i < MOTE_COUNT; i += step) {
    moteAt(i, cam.x, cam.y, time, rw, rh, reduce, m);
    if (m.x < -half || m.x > half || m.y < -half || m.y > half) continue;
    const z = 0.5 + hash01(i, 20) * 1.3;
    const x = projectX(m.x, cam, view), y = projectY(m.y, z, cam, view);
    if (x < -8 || x > view.width + 8 || y < -8 || y > view.height + 8) continue;
    sx[n] = x; sy[n] = y; sr[n] = m.r * (cam.zoom / 32); sa[n] = m.a;
    n++;
  }
  if (n === 0) return;

  ctx.fillStyle = MOTE_HALO;
  ctx.globalAlpha = 0.16;
  ctx.beginPath();
  for (let i = 0; i < n; i++) { ctx.moveTo(sx[i]! + sr[i]! * 4.2, sy[i]!); ctx.arc(sx[i]!, sy[i]!, sr[i]! * 4.2, 0, TAU); }
  ctx.fill();

  ctx.fillStyle = MOTE_CORE;
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = pass === 0 ? 0.32 : 0.6;
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < n; i++) {
      if ((sa[i]! > 0.4) !== (pass === 1)) continue;
      any = true;
      ctx.moveTo(sx[i]! + sr[i]!, sy[i]!);
      ctx.arc(sx[i]!, sy[i]!, sr[i]!, 0, TAU);
    }
    if (any) ctx.fill();
  }
  ctx.globalAlpha = 1;
}
