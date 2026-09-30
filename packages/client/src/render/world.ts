/**
 * The world pass: ground, obstacles, actors, pickups, interactables.
 *
 * Performance contract, defended by the render test:
 *  - one SpriteBuffer, pooled, sorted in place (no per-frame array of objects);
 *  - every contact shadow in ONE path and ONE fill;
 *  - `shadowBlur` is never touched inside the entity loop;
 *  - bodies are grouped so the fill colour changes per KIND, not per entity.
 */

import {
  TICKS_PER_SECOND,
  type BiomePalette,
  type ContentBundle,
  type GameState,
} from '@megabonk/sim';
import { lerp, type Ctx2D } from './ctx.js';
import {
  Y_SQUASH,
  projectX,
  projectY,
  visibleWorldBounds,
  type Camera,
  type Viewport,
} from './projection.js';
import { SpriteBuffer } from './sort.js';
import {
  PROJECTILE_CORE,
  THEME,
  enemyVisual,
  font,
} from './theme.js';
import type { FxManager } from './fx/manager.js';
import { pathContactShadow } from './shapes.js';
import { animFrame, creatureCache, drawCreature, drawHero, facingFor } from './creatures/index.js';
import {
  drawBeacons, drawGroundDecor, drawInteractableProp, drawMerchantProp, drawObstacleProp,
  drawPickupProp, drawProjectileProp,
} from './props/index.js';

/** One buffer for the life of the page: the draw loop must not allocate. */
const sprites = new SpriteBuffer();

/** World units of slack beyond the viewport before an entity is culled. */
const CULL_MARGIN = 4;

const DEATH_FADE_TICKS = 8;

export interface WorldFrame {
  readonly state: GameState;
  readonly prev: GameState | null;
  readonly alpha: number;
  readonly cam: Camera;
  readonly view: Viewport;
  readonly palette: BiomePalette;
  readonly content: ContentBundle;
  readonly time: number;
  /** prefers-reduced-motion: damps pulses, bobs and twinkles in props. */
  readonly reduceMotion?: boolean;
  /** Combat effects (spawned per tick by the client, aged per frame here). */
  readonly fx?: FxManager;
}

/** A ranged enemy holds a standoff instead of swarming, so it must look different. */
function isRanged(frame: WorldFrame, kind: string): boolean {
  return frame.content.enemies[kind]?.ranged !== undefined;
}

function ix(prevValue: number | undefined, value: number, alpha: number): number {
  return prevValue === undefined ? value : lerp(prevValue, value, alpha);
}

// ---- ground ---------------------------------------------------------------

/**
 * The lattice is the only speed cue in a top-down game with no horizon, so it is
 * drawn twice: a far layer at 88% of camera parallax for depth, and a near layer
 * locked to the world for exact positional feedback.
 */
function drawLattice(
  ctx: Ctx2D,
  cam: Camera,
  view: Viewport,
  halfExtent: number,
  step: number,
  colour: string,
  width: number,
): void {
  const bounds = visibleWorldBounds(cam, view, step * 2);
  const minX = Math.max(-halfExtent, bounds.minX);
  const maxX = Math.min(halfExtent, bounds.maxX);
  const minY = Math.max(-halfExtent, bounds.minY);
  const maxY = Math.min(halfExtent, bounds.maxY);
  if (maxX <= minX || maxY <= minY) return;

  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  // Diagonals: x + y = k and x - y = k. Both project to straight screen lines,
  // and the crossing pattern reads as a tilted plane rather than graph paper.
  const sumMin = Math.ceil((minX + minY) / step) * step;
  const sumMax = maxX + maxY;
  for (let k = sumMin; k <= sumMax; k += step) {
    const x0 = Math.max(minX, k - maxY);
    const x1 = Math.min(maxX, k - minY);
    if (x1 <= x0) continue;
    ctx.moveTo(projectX(x0, cam, view), projectY(k - x0, 0, cam, view));
    ctx.lineTo(projectX(x1, cam, view), projectY(k - x1, 0, cam, view));
  }
  const diffMin = Math.ceil((minX - maxY) / step) * step;
  const diffMax = maxX - minY;
  for (let k = diffMin; k <= diffMax; k += step) {
    const x0 = Math.max(minX, k + minY);
    const x1 = Math.min(maxX, k + maxY);
    if (x1 <= x0) continue;
    ctx.moveTo(projectX(x0, cam, view), projectY(x0 - k, 0, cam, view));
    ctx.lineTo(projectX(x1, cam, view), projectY(x1 - k, 0, cam, view));
  }
  ctx.stroke();
}

export function drawGround(ctx: Ctx2D, frame: WorldFrame): void {
  const { cam, view, palette, state } = frame;
  const half = state.map.halfExtent;

  ctx.fillStyle = THEME.void;
  ctx.fillRect(0, 0, view.width, view.height);

  const left = projectX(-half, cam, view);
  const right = projectX(half, cam, view);
  const top = projectY(-half, 0, cam, view);
  const bottom = projectY(half, 0, cam, view);

  ctx.fillStyle = palette.ground;
  ctx.fillRect(left, top, right - left, bottom - top);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();

  // Far parallax layer: same maths, a camera that lags behind.
  const farCam: Camera = { x: cam.x * 0.88, y: cam.y * 0.88, zoom: cam.zoom };
  drawLattice(ctx, farCam, view, half * 1.3, 9, palette.groundAlt, 3);
  drawLattice(ctx, cam, view, half, 3, palette.groundAlt, 1);
  drawGroundDecor(ctx, cam, view, half);

  ctx.restore();

  // Map border: a bright inner rule so the wall reads as a boundary, not a bug.
  ctx.strokeStyle = palette.accent;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  ctx.strokeRect(left, top, right - left, bottom - top);
  ctx.globalAlpha = 1;
}

/** Edge vignette in the biome fog colour. One gradient per frame, not per entity. */
export function drawFog(ctx: Ctx2D, frame: WorldFrame): void {
  const { view, palette } = frame;
  if (view.width <= 0 || view.height <= 0) return;
  const cx = view.width / 2;
  const cy = view.height / 2;
  const inner = Math.min(view.width, view.height) * 0.36;
  const outer = Math.hypot(cx, cy);
  const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, palette.fog);
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.globalAlpha = 1;
  // Off-screen reward beacons sit above the fog so distance never dims them.
  drawBeacons(ctx, frame.state, frame.cam, view, frame.time, frame.reduceMotion === true);
}

// ---- the sorted pass ------------------------------------------------------

export function buildSprites(frame: WorldFrame): SpriteBuffer {
  const { state, prev, alpha, cam, view } = frame;
  const b = visibleWorldBounds(cam, view, CULL_MARGIN);
  sprites.reset();

  const obstacles = state.map.obstacles;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i]!;
    if (o.pos.x < b.minX - o.radius || o.pos.x > b.maxX + o.radius) continue;
    if (o.pos.y < b.minY - o.radius || o.pos.y > b.maxY + o.radius) continue;
    sprites.push('obstacle', i, o.pos.x, o.pos.y, 0);
  }

  const pickups = state.pickups;
  for (let i = 0; i < pickups.length; i++) {
    const p = pickups[i]!;
    if (p.pos.x < b.minX || p.pos.x > b.maxX || p.pos.y < b.minY || p.pos.y > b.maxY) continue;
    sprites.push('pickup', i, p.pos.x, p.pos.y, 0);
  }

  const interactables = state.interactables;
  for (let i = 0; i < interactables.length; i++) {
    const it = interactables[i]!;
    if (it.pos.x < b.minX - 2 || it.pos.x > b.maxX + 2) continue;
    if (it.pos.y < b.minY - 2 || it.pos.y > b.maxY + 2) continue;
    sprites.push('interactable', i, it.pos.x, it.pos.y, 0);
  }

  // Index-aligned interpolation: the sim keeps survivors in order and appends
  // spawns, so prev[i] is almost always the same entity. The id check makes the
  // rare mismatch fall back to the authoritative position rather than smear.
  const enemies = state.enemies;
  const prevEnemies = prev?.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!;
    const before = prevEnemies?.[i];
    const px = before !== undefined && before.id === e.id ? before.pos.x : undefined;
    const py = before !== undefined && before.id === e.id ? before.pos.y : undefined;
    const x = ix(px, e.pos.x, alpha);
    const y = ix(py, e.pos.y, alpha);
    if (x < b.minX - e.radius * 3 || x > b.maxX + e.radius * 3) continue;
    if (y < b.minY - e.radius * 3 || y > b.maxY + e.radius * 3) continue;
    sprites.push(e.dyingFor === undefined ? 'enemy' : 'corpse', i, x, y, 0);
  }

  // Projectiles last, so they are pushed after the enemies that fired them and
  // tie-break in front at equal depth.
  const projectiles = state.projectiles;
  const prevProjectiles = prev?.projectiles;
  for (let i = 0; i < projectiles.length; i++) {
    const q = projectiles[i]!;
    const was = prevProjectiles?.[i];
    const sameEntity = was !== undefined && was.id === q.id;
    const x = ix(sameEntity ? was.pos.x : undefined, q.pos.x, alpha);
    const y = ix(sameEntity ? was.pos.y : undefined, q.pos.y, alpha);
    if (x < b.minX - 2 || x > b.maxX + 2 || y < b.minY - 2 || y > b.maxY + 2) continue;
    sprites.push('projectile', i, x, y, 0);
  }

  if (state.merchant !== null) {
    sprites.push('merchant', 0, state.merchant.pos.x, state.merchant.pos.y, 0);
  }

  const player = state.player.pos;
  const prevPlayer = prev?.player.pos;
  sprites.push(
    'player',
    0,
    ix(prevPlayer?.x, player.x, alpha),
    ix(prevPlayer?.y, player.y, alpha),
    0,
  );

  sprites.sort();
  return sprites;
}

/** One path, one fill, every shadow in the frame. */
function drawShadows(ctx: Ctx2D, frame: WorldFrame, buffer: SpriteBuffer): void {
  const { state, cam, view } = frame;
  ctx.fillStyle = THEME.shadow;
  ctx.beginPath();
  for (const s of buffer.items()) {
    if (s.layer === 0) continue;
    let radius = 0.5;
    if (s.kind === 'obstacle') radius = state.map.obstacles[s.index]?.radius ?? 1;
    else if (s.kind === 'enemy' || s.kind === 'corpse') {
      const e = state.enemies[s.index];
      radius = (e?.radius ?? 0.5) * enemyVisual(e?.kind ?? '').scale * 0.9;
    } else if (s.kind === 'merchant') radius = 1.1;
    else if (s.kind === 'projectile') radius = 0.22;
    else if (s.kind === 'interactable') radius = 1.0;
    else radius = 0.6;
    pathContactShadow(ctx, projectX(s.wx, cam, view), projectY(s.wy, 0, cam, view), radius * cam.zoom);
  }
  ctx.fill();
}

function drawObstacle(ctx: Ctx2D, frame: WorldFrame, index: number): void {
  const o = frame.state.map.obstacles[index];
  if (o === undefined) return;
  const { cam, view } = frame;
  drawObstacleProp(ctx, o, projectX(o.pos.x, cam, view), projectY(o.pos.y, 0, cam, view), cam.zoom);
}

function drawPickup(ctx: Ctx2D, frame: WorldFrame, index: number): void {
  const p = frame.state.pickups[index];
  if (p === undefined) return;
  const { cam, view } = frame;
  drawPickupProp(
    ctx, p, projectX(p.pos.x, cam, view), projectY(p.pos.y, 0, cam, view), cam.zoom,
    frame.time, frame.reduceMotion === true,
  );
}

function drawInteractable(ctx: Ctx2D, frame: WorldFrame, index: number): void {
  const it = frame.state.interactables[index];
  if (it === undefined) return;
  const { cam, view } = frame;
  drawInteractableProp(
    ctx, it, projectX(it.pos.x, cam, view), projectY(it.pos.y, 0, cam, view), cam.zoom,
    frame.time, frame.reduceMotion === true,
  );
}

/** Enemy shots must be dodgeable: see props/projectiles.ts for the telegraphing. */
function drawProjectile(ctx: Ctx2D, frame: WorldFrame, index: number, wx: number, wy: number): void {
  const q = frame.state.projectiles[index];
  if (q === undefined) return;
  drawProjectileProp(ctx, q, frame.cam, frame.view, wx, wy, frame.time, frame.reduceMotion === true);
}

function drawMerchant(ctx: Ctx2D, frame: WorldFrame): void {
  const merchant = frame.state.merchant;
  if (merchant === null) return;
  const { cam, view } = frame;
  drawMerchantProp(
    ctx, merchant, frame.state.player.gold,
    projectX(merchant.pos.x, cam, view), projectY(merchant.pos.y, 0, cam, view), cam.zoom,
    frame.time, frame.reduceMotion === true,
  );
}

function drawEnemy(ctx: Ctx2D, frame: WorldFrame, index: number, wx: number, wy: number): void {
  const e = frame.state.enemies[index];
  if (e === undefined) return;
  const { cam, view, prev } = frame;
  const visual = enemyVisual(e.kind, isRanged(frame, e.kind));
  const x = projectX(wx, cam, view);
  const y = projectY(wy, 0, cam, view);
  // One sprite unit is one (hit radius x visual scale) of world space.
  const unit = e.radius * visual.scale * cam.zoom;

  // Facing follows movement (the sim's per-tick delta, not the interpolated one)
  // and holds when the enemy stops. Enemies never seen moving face the player.
  const before = prev?.enemies[index];
  const dx = before !== undefined && before.id === e.id ? e.pos.x - before.pos.x : 0;
  const face = facingFor(e.id, dx, frame.state.player.pos.x >= e.pos.x ? 1 : -1);
  const step = animFrame(frame.time, e.id, visual.frameMs, frame.reduceMotion === true);

  const dying = e.dyingFor !== undefined;
  let swell = 1;
  if (dying) {
    const t = Math.max(0, Math.min(1, e.dyingFor! / DEATH_FADE_TICKS));
    ctx.globalAlpha = t * 0.8;
    swell = 1 + (1 - t) * 0.5;
  }

  // Stagger doubles as the hit flash: the sim already tells us it was just hit.
  // A dying creature is a white flash that fades out.
  const kick = !dying && frame.fx !== undefined ? frame.fx.kickFor(e.id) : -1;
  if (kick >= 0) {
    // A ~130 ms squash and shove away from the blow, display-only.
    const fx = frame.fx!;
    const k = fx.kickAmount(kick);
    ctx.save();
    ctx.translate(x + fx.kickDirX(kick) * unit * 0.35 * k, y + fx.kickDirY(kick) * unit * 0.2 * k);
    ctx.scale(1 + 0.16 * k, 1 - 0.14 * k);
    drawCreature(ctx, creatureCache, visual, step, true, 0, 0, unit, face < 0, swell);
    ctx.restore();
  } else {
    drawCreature(ctx, creatureCache, visual, step, dying || e.stagger > 0, x, y, unit, face < 0, swell);
  }
  if (dying) {
    ctx.globalAlpha = 1;
    return;
  }

  // The boss's health lives in the top banner only (a second overhead bar duplicated it).
  if (!e.isBoss && e.hp < e.maxHp) {
    drawTinyBar(ctx, x, y - unit * visual.height - 5, Math.max(9, unit * 1.15), e.hp / e.maxHp);
  }
}

function drawTinyBar(ctx: Ctx2D, cx: number, y: number, halfWidth: number, frac: number): void {
  const w = halfWidth * 2;
  const h = Math.max(3, Math.min(6, halfWidth * 0.3));
  ctx.fillStyle = THEME.ink;
  ctx.fillRect(cx - halfWidth - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = THEME.hpBack;
  ctx.fillRect(cx - halfWidth, y, w, h);
  ctx.fillStyle = THEME.hp;
  ctx.fillRect(cx - halfWidth, y, w * Math.max(0, Math.min(1, frac)), h);
}

/** The hero's last horizontal facing: holds while they stand still or move vertically. */
let heroFace = 1;

function drawPlayer(ctx: Ctx2D, frame: WorldFrame, wx: number, wy: number, hurt: number): void {
  const { state, prev, cam, view, palette, time } = frame;
  const x = projectX(wx, cam, view);
  const y = projectY(wy, 0, cam, view);
  const unit = 0.67 * cam.zoom;

  // Pickup radius ring: the single most useful piece of positional information
  // in the genre, and it doubles as the player's ground anchor.
  ctx.strokeStyle = palette.accent;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 7]);
  ctx.beginPath();
  ctx.ellipse(
    x, y,
    state.player.stats.pickupRadius * cam.zoom,
    state.player.stats.pickupRadius * cam.zoom * Y_SQUASH,
    0, 0, Math.PI * 2,
  );
  ctx.stroke();
  ctx.setLineDash([]);

  // The hero's own lamp-light pool at their feet, in the signature chartreuse.
  ctx.fillStyle = '#d4ffa0';
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.ellipse(x, y, unit * 2.1, unit * 2.1 * Y_SQUASH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  ctx.ellipse(x, y, unit * 1.35, unit * 1.35 * Y_SQUASH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const invuln = state.player.invulnerable > 0;
  // No flashing above 3 Hz (NFR-3): a 2.5 Hz blink at most.
  const blink = invuln && Math.sin(time * 0.0157) > 0;
  ctx.globalAlpha = blink ? 0.55 : 1;

  // Facing: the hero visibly turns to face where they last moved.
  const fx = state.player.facing.x;
  if (fx > 0.15) heroFace = 1;
  else if (fx < -0.15) heroFace = -1;

  const p0 = prev?.player.pos;
  const moving = p0 !== undefined
    ? Math.abs(state.player.pos.x - p0.x) + Math.abs(state.player.pos.y - p0.y) > 0.002
    : false;
  const reduce = frame.reduceMotion === true;
  // Standing still: a slow breath (a 1 px rise), and the legs together.
  const step = moving ? animFrame(time, 0, 95, reduce) : 0;
  const breathe = moving || reduce ? 0 : Math.sin(time * 0.004) * unit * 0.04;
  if (invuln) {
    // A ring that swells outward while the hero is invulnerable after a hit: a hit read that is not just colour.
    const pulse = (time % 400) / 400;
    ctx.strokeStyle = '#fff6d6';
    ctx.globalAlpha = (1 - pulse) * 0.7;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(x, y, unit * (1.3 + pulse * 1.4), unit * (1.3 + pulse * 1.4) * Y_SQUASH, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = blink ? 0.55 : 1;
  }
  drawHero(ctx, creatureCache, step, hurt > 0.2 ? 2 : 0, x, y + breathe, unit, heroFace < 0);
  ctx.globalAlpha = 1;

  // Active shrine buffs read as orbiting motes (AC-14.1 is a tick countdown, so
  // the mote count comes from state, never from wall clock).
  const buffs = state.player.buffs.length;
  if (buffs > 0) {
    ctx.fillStyle = THEME.advisor;
    ctx.beginPath();
    for (let i = 0; i < buffs; i++) {
      const a = time * 0.002 + (i * Math.PI * 2) / buffs;
      ctx.ellipse(
        x + Math.cos(a) * unit * 2.3,
        y - unit * 1.5 + Math.sin(a) * unit * 2.3 * Y_SQUASH,
        unit * 0.2, unit * 0.2, 0, 0, Math.PI * 2,
      );
    }
    ctx.fill();
  }
}

export function drawWorld(ctx: Ctx2D, frame: WorldFrame, hurt: number): void {
  drawGround(ctx, frame);
  const buffer = buildSprites(frame);
  drawShadows(ctx, frame, buffer);

  for (const s of buffer.items()) {
    switch (s.kind) {
      case 'obstacle': drawObstacle(ctx, frame, s.index); break;
      case 'pickup': drawPickup(ctx, frame, s.index); break;
      case 'interactable': drawInteractable(ctx, frame, s.index); break;
      case 'merchant': drawMerchant(ctx, frame); break;
      case 'projectile': drawProjectile(ctx, frame, s.index, s.wx, s.wy); break;
      case 'enemy': case 'corpse': drawEnemy(ctx, frame, s.index, s.wx, s.wy); break;
      case 'player': drawPlayer(ctx, frame, s.wx, s.wy, hurt); break;
      default: break;
    }
  }

  // Combat feedback sits above every actor and below fog and the HUD.
  frame.fx?.draw(ctx, frame);

  drawFog(ctx, frame);
}

export const TICKS_PER_SEC = TICKS_PER_SECOND;
