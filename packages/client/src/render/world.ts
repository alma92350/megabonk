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
  PICKUP_COLORS,
  PROJECTILE_CORE,
  PROJECTILE_HEAD,
  PROJECTILE_TRAIL,
  THEME,
  enemyVisual,
  font,
} from './theme.js';
import { pathContactShadow, pathEnemy } from './shapes.js';

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
    else if (s.kind === 'interactable') radius = 0.8;
    else radius = 0.6;
    pathContactShadow(ctx, projectX(s.wx, cam, view), projectY(s.wy, 0, cam, view), radius * cam.zoom);
  }
  ctx.fill();
}

function drawObstacle(ctx: Ctx2D, frame: WorldFrame, index: number): void {
  const o = frame.state.map.obstacles[index];
  if (o === undefined) return;
  const { cam, view, palette } = frame;
  const x = projectX(o.pos.x, cam, view);
  const baseY = projectY(o.pos.y, 0, cam, view);
  const topY = projectY(o.pos.y, o.height, cam, view);
  const rx = o.radius * cam.zoom;
  const ry = rx * Y_SQUASH;

  // Extruded side wall: two verticals plus the base arc. Darker than the cap, so
  // the height reads without any lighting model.
  ctx.fillStyle = palette.fog;
  ctx.beginPath();
  ctx.moveTo(x - rx, topY);
  ctx.lineTo(x - rx, baseY);
  ctx.ellipse(x, baseY, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + rx, topY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = palette.obstacle;
  ctx.beginPath();
  ctx.ellipse(x, topY, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Rim light along the top-left, the single global light direction.
  ctx.strokeStyle = palette.accent;
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  ctx.ellipse(x, topY, rx * 0.92, ry * 0.92, 0, Math.PI * 1.05, Math.PI * 1.85);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawPickup(ctx: Ctx2D, frame: WorldFrame, index: number): void {
  const p = frame.state.pickups[index];
  if (p === undefined) return;
  const { cam, view, time } = frame;
  const x = projectX(p.pos.x, cam, view);
  const bob = Math.sin(time * 0.004 + p.id) * 0.12;
  const y = projectY(p.pos.y, 0.25 + bob, cam, view);
  const r = (p.kind === 'xp' ? 0.2 : 0.24) * cam.zoom;

  ctx.fillStyle = PICKUP_COLORS[p.kind];
  ctx.beginPath();
  if (p.kind === 'xp') {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.8, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.8, y);
    ctx.closePath();
  } else if (p.kind === 'gold') {
    ctx.ellipse(x, y, r, r * 0.78, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(x - r * 0.32, y - r, r * 0.64, r * 2);
    ctx.rect(x - r, y - r * 0.32, r * 2, r * 0.64);
  }
  ctx.fill();
}

function drawInteractable(ctx: Ctx2D, frame: WorldFrame, index: number): void {
  const it = frame.state.interactables[index];
  if (it === undefined) return;
  const { cam, view, time } = frame;
  const x = projectX(it.pos.x, cam, view);
  const groundY = projectY(it.pos.y, 0, cam, view);
  const u = cam.zoom;
  const spent = it.used;

  if (it.kind === 'chest') {
    // A hard-edged strongbox: lid, body, a bright clasp. Spent chests lose the
    // clasp glow and the lid hangs open, so "already looted" reads at distance.
    const w = 0.55 * u;
    const h = 0.42 * u;
    const top = groundY - h * 1.35;
    ctx.fillStyle = spent ? '#2b2f2c' : '#5a4326';
    ctx.beginPath();
    ctx.rect(x - w, top, w * 2, h * 1.35);
    ctx.fill();
    ctx.fillStyle = spent ? '#3a4039' : THEME.gold;
    ctx.globalAlpha = spent ? 0.7 : 1;
    ctx.beginPath();
    if (spent) {
      // Open lid, tipped back.
      ctx.moveTo(x - w, top);
      ctx.lineTo(x - w * 0.75, top - h * 0.75);
      ctx.lineTo(x + w * 1.1, top - h * 0.55);
      ctx.lineTo(x + w, top);
    } else {
      ctx.moveTo(x - w, top);
      ctx.quadraticCurveTo(x, top - h * 0.95, x + w, top);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = THEME.ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - w, top, w * 2, h * 1.35);
    if (!spent) {
      const pulse = 0.55 + 0.45 * Math.sin(time * 0.006);
      ctx.fillStyle = THEME.crit;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.rect(x - w * 0.14, top + h * 0.2, w * 0.28, h * 0.6);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    return;
  }

  // Shrine: a standing monolith with a floating rune. Lit while usable, dark and
  // cracked once spent.
  const w = 0.34 * u;
  const h = 1.5 * u;
  ctx.fillStyle = spent ? '#242b28' : '#33403c';
  ctx.beginPath();
  ctx.moveTo(x - w, groundY);
  ctx.lineTo(x - w * 0.72, groundY - h);
  ctx.lineTo(x + w * 0.72, groundY - h);
  ctx.lineTo(x + w, groundY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (spent) {
    ctx.strokeStyle = '#141a18';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, groundY - h * 0.9);
    ctx.lineTo(x + w * 0.2, groundY - h * 0.45);
    ctx.lineTo(x - w * 0.3, groundY - h * 0.1);
    ctx.stroke();
    return;
  }

  const pulse = 0.5 + 0.5 * Math.sin(time * 0.0035 + it.id);
  const runeY = groundY - h * 0.62;
  ctx.fillStyle = THEME.advisor;
  ctx.globalAlpha = 0.45 + 0.4 * pulse;
  ctx.beginPath();
  ctx.moveTo(x, runeY - w * 0.6);
  ctx.lineTo(x + w * 0.5, runeY);
  ctx.lineTo(x, runeY + w * 0.6);
  ctx.lineTo(x - w * 0.5, runeY);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * Enemy shots must be DODGEABLE, which makes telegraphing a fairness
 * requirement rather than decoration: a tracer oriented along `vel` shows both
 * where the shot is and where it is going, and a hot head makes the leading edge
 * unambiguous. Drawn in pink, which nothing else in the palette uses.
 */
function drawProjectile(ctx: Ctx2D, frame: WorldFrame, index: number, wx: number, wy: number): void {
  const q = frame.state.projectiles[index];
  if (q === undefined) return;
  const { cam, view } = frame;
  const x = projectX(wx, cam, view);
  const y = projectY(wy, 0.4, cam, view);

  // Streak covers ~110 ms of travel: long enough to read direction, short enough
  // not to lie about where the hitbox is.
  const tailX = projectX(wx - q.vel.x * 0.11, cam, view);
  const tailY = projectY(wy - q.vel.y * 0.11, 0.4, cam, view);
  const r = Math.max(2.5, q.radius * cam.zoom);

  ctx.strokeStyle = PROJECTILE_TRAIL;
  ctx.lineWidth = r * 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(x, y);
  ctx.stroke();

  ctx.strokeStyle = PROJECTILE_CORE;
  ctx.lineWidth = r * 0.8;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.lineCap = 'butt';

  ctx.fillStyle = PROJECTILE_HEAD;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.65, 0, Math.PI * 2);
  ctx.fill();
}

function drawMerchant(ctx: Ctx2D, frame: WorldFrame): void {
  const merchant = frame.state.merchant;
  if (merchant === null) return;
  const { cam, view, time } = frame;
  const x = projectX(merchant.pos.x, cam, view);
  const y = projectY(merchant.pos.y, 0, cam, view);
  const u = cam.zoom;

  // Awning, counter, and a lantern that pulses so the player can find it.
  ctx.fillStyle = '#3b2b1f';
  ctx.beginPath();
  ctx.rect(x - u * 0.9, y - u * 0.85, u * 1.8, u * 0.85);
  ctx.fill();
  ctx.fillStyle = THEME.merchant;
  ctx.beginPath();
  ctx.moveTo(x - u * 1.15, y - u * 0.85);
  ctx.lineTo(x + u * 1.15, y - u * 0.85);
  ctx.lineTo(x + u * 0.8, y - u * 1.45);
  ctx.lineTo(x - u * 0.8, y - u * 1.45);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const pulse = 0.6 + 0.4 * Math.sin(time * 0.005);
  ctx.fillStyle = THEME.crit;
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.arc(x + u * 0.95, y - u * 1.5, u * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawEnemy(ctx: Ctx2D, frame: WorldFrame, index: number, wx: number, wy: number): void {
  const e = frame.state.enemies[index];
  if (e === undefined) return;
  const { cam, view } = frame;
  const ranged = isRanged(frame, e.kind);
  const visual = enemyVisual(e.kind, ranged);
  const x = projectX(wx, cam, view);
  const y = projectY(wy, 0, cam, view);
  const r = e.radius * visual.scale * cam.zoom;

  let alpha = 1;
  let swell = 1;
  if (e.dyingFor !== undefined) {
    const t = Math.max(0, Math.min(1, e.dyingFor / DEATH_FADE_TICKS));
    alpha = t * 0.8;
    swell = 1 + (1 - t) * 0.5;
  }
  ctx.globalAlpha = alpha;

  // Stagger doubles as the hit flash: the sim already tells us it was just hit.
  const struck = e.stagger > 0;
  ctx.fillStyle = e.dyingFor !== undefined ? THEME.crit : struck ? visual.rim : visual.body;
  pathEnemy(ctx, visual.shape, x, y, r * swell);
  ctx.fill();

  if (e.dyingFor === undefined) {
    ctx.strokeStyle = THEME.ink;
    ctx.lineWidth = e.isBoss ? 2.5 : 1.25;
    ctx.stroke();

    // Rim light: a short arc along the top edge only.
    ctx.strokeStyle = visual.rim;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = e.isBoss ? 2.5 : 1.25;
    ctx.beginPath();
    ctx.arc(x, y - r * 0.55, r * 0.82, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (ranged) {
      // A charged orb above the raised arm. Same hue as its shots, so the player
      // learns "pink means incoming" from one look.
      ctx.fillStyle = PROJECTILE_CORE;
      ctx.beginPath();
      ctx.arc(x + r * 1.1, y - r * 1.75, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (e.isBoss) drawBossPip(ctx, frame, index, x, y, r);
    else if (e.hp < e.maxHp) drawTinyBar(ctx, x, y - r * 2.1, r * 1.5, e.hp / e.maxHp);
  }
  ctx.globalAlpha = 1;
}

function drawTinyBar(ctx: Ctx2D, cx: number, y: number, halfWidth: number, frac: number): void {
  const w = halfWidth * 2;
  const h = Math.max(2, halfWidth * 0.18);
  ctx.fillStyle = THEME.hpBack;
  ctx.fillRect(cx - halfWidth, y, w, h);
  ctx.fillStyle = THEME.hp;
  ctx.fillRect(cx - halfWidth, y, w * Math.max(0, Math.min(1, frac)), h);
}

/** FR-27: bosses, and only bosses, get an exact numeric readout in-world. */
function drawBossPip(
  ctx: Ctx2D, frame: WorldFrame, index: number, x: number, y: number, r: number,
): void {
  const e = frame.state.enemies[index];
  if (e === undefined) return;
  const w = r * 2.2;
  const h = Math.max(5, r * 0.2);
  const top = y - r * 2.5;
  ctx.fillStyle = THEME.hpBack;
  ctx.fillRect(x - w / 2, top, w, h);
  ctx.fillStyle = THEME.boss;
  ctx.fillRect(x - w / 2, top, w * Math.max(0, Math.min(1, e.hp / e.maxHp)), h);
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - w / 2, top, w, h);

  ctx.font = font(Math.max(9, h * 1.6), 'bold');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = THEME.text;
  ctx.fillText(`${Math.ceil(e.hp)}/${Math.round(e.maxHp)}`, x, top - 2);
}

function drawPlayer(ctx: Ctx2D, frame: WorldFrame, wx: number, wy: number, hurt: number): void {
  const { state, cam, view, palette, time } = frame;
  const x = projectX(wx, cam, view);
  const y = projectY(wy, 0, cam, view);
  const r = 0.52 * cam.zoom;

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
  ctx.globalAlpha = 1;

  const invuln = state.player.invulnerable > 0;
  // No flashing above 3 Hz (NFR-3): a 2.5 Hz blink at most.
  const blink = invuln && Math.sin(time * 0.0157) > 0;
  ctx.globalAlpha = blink ? 0.55 : 1;

  ctx.fillStyle = hurt > 0.2 ? THEME.hpLow : '#dfe9d8';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.8, y + r * 0.35);
  ctx.lineTo(x - r * 0.85, y - r * 1.05);
  ctx.quadraticCurveTo(x, y - r * 2.0, x + r * 0.85, y - r * 1.05);
  ctx.lineTo(x + r * 0.8, y + r * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Facing: a wedge on the leading edge, so the auto-attack direction reads.
  const f = state.player.facing;
  const len = Math.hypot(f.x, f.y) || 1;
  const fx = (f.x / len) * r * 1.25;
  const fy = (f.y / len) * r * 1.25 * Y_SQUASH;
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.moveTo(x + fx, y - r * 0.75 + fy);
  ctx.lineTo(x + fx * 0.25 - fy * 0.5, y - r * 0.75 + fy * 0.25 + fx * 0.5);
  ctx.lineTo(x + fx * 0.25 + fy * 0.5, y - r * 0.75 + fy * 0.25 - fx * 0.5);
  ctx.closePath();
  ctx.fill();
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
        x + Math.cos(a) * r * 1.9,
        y - r * 0.8 + Math.sin(a) * r * 1.9 * Y_SQUASH,
        r * 0.16, r * 0.16, 0, 0, Math.PI * 2,
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

  drawFog(ctx, frame);
}

export const TICKS_PER_SEC = TICKS_PER_SECOND;
