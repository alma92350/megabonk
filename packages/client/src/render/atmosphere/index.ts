/**
 * Atmosphere: boss presence, ambient motes and warm chest light.
 *
 * Same pattern as the combat fx: spawn per sim tick from (before, after) via
 * `observe`, age per render frame in wall-clock ms via `advance`, display-only.
 * The world pass finds the instance through the FxManager it already receives
 * (`atmosphereOf(frame.fx)`), so nothing new has to be threaded through the
 * renderer. Fixed pools, no allocation while drawing, no shadowBlur.
 *
 * Colour: the boss reads in ember orange and dust brown. Hot pink stays
 * reserved for enemy shots.
 */
import type { Enemy, GameState } from '@megabonk/sim';
import { Y_SQUASH, projectX, projectY, visibleWorldBounds, type Viewport } from '../projection.js';
import type { Ctx2D } from '../ctx.js';
import { hash01 } from '../fx/hash.js';
import { glowPulse } from '../props/motion.js';
import { CHEST_GLOW } from '../props/palette.js';
import type { WorldFrame } from '../world.js';
import type { FxManager } from '../fx/manager.js';
import {
  ENTRANCE_MS, detectBossSpawns, entranceProgress, entranceScale, phaseTell, telegraphRadius,
} from './boss.js';
import { drawMotes } from './motes.js';

export { ENTRANCE_MS, detectBossSpawns, entranceProgress, entranceScale, phaseTell, telegraphRadius } from './boss.js';
export { MOTE_COUNT, drawMotes, moteAt, moteAlpha } from './motes.js';

const MAX_BOSSES = 4;
const RIM_MS = 450;
const RIM_PEAK = 0.5;
const RUMBLE_TICKS = 50;
const RUMBLE_PEAK = 0.03;
const RING_MS = 1300;
const TAU = Math.PI * 2;
const EMBER = '#ff7a3d';
const DUST = '#1c120d';

export interface AtmosphereOptions { readonly reduceMotion?: boolean }

export class Atmosphere {
  readonly reduceMotion: boolean;
  private readonly seen = new Set<number>();
  private readonly bId = new Int32Array(MAX_BOSSES);
  private readonly bAge = new Float32Array(MAX_BOSSES);
  private readonly bX = new Float32Array(MAX_BOSSES);
  private readonly bY = new Float32Array(MAX_BOSSES);
  private readonly bR = new Float32Array(MAX_BOSSES);
  private readonly bAlive = new Uint8Array(MAX_BOSSES);
  private rimAge = RIM_MS;
  private rumbleTicks = 0;
  private lastTime = -1;
  /** Bosses announced since construction (tests and diagnostics). */
  announced = 0;

  constructor(opts: AtmosphereOptions = {}) {
    this.reduceMotion = opts.reduceMotion === true;
  }

  get bossCount(): number {
    let n = 0;
    for (let i = 0; i < MAX_BOSSES; i++) if (this.bAlive[i] === 1) n++;
    return n;
  }

  clear(): void {
    this.seen.clear();
    this.bAlive.fill(0);
    this.rimAge = RIM_MS;
    this.rumbleTicks = 0;
    this.lastTime = -1;
  }

  /** Per sim tick. Derives everything from the two states; never writes back. */
  observe(before: GameState, after: GameState): void {
    if (after.tick < before.tick) { this.clear(); return; }
    const list = detectBossSpawns(before, after, this.seen);
    for (let k = 0; k < list.length; k++) {
      const e = list[k]!;
      let slot = -1;
      for (let i = 0; i < MAX_BOSSES; i++) if (this.bAlive[i] === 0) { slot = i; break; }
      if (slot < 0) slot = 0;
      this.bAlive[slot] = 1; this.bId[slot] = e.id; this.bAge[slot] = 0;
      this.bX[slot] = e.pos.x; this.bY[slot] = e.pos.y; this.bR[slot] = e.radius;
      this.rimAge = 0;
      this.rumbleTicks = RUMBLE_TICKS;
      this.announced++;
    }
  }

  /** Per render frame: age entrances and the rim from the frame clock (ms). */
  advance(timeMs: number): void {
    const dt = this.lastTime < 0 ? 0 : Math.max(0, Math.min(250, timeMs - this.lastTime));
    this.lastTime = timeMs;
    if (dt === 0) return;
    if (this.rimAge < RIM_MS) this.rimAge += dt;
    for (let i = 0; i < MAX_BOSSES; i++) {
      if (this.bAlive[i] === 0) continue;
      this.bAge[i] = this.bAge[i]! + dt;
      if (this.bAge[i]! > RING_MS + 200) this.bAlive[i] = 0;
    }
  }

  /** Screen-shake amount for one sim tick of the arrival rumble (drains to 0). */
  takeRumble(): number {
    if (this.rumbleTicks <= 0) return 0;
    const k = this.rumbleTicks / RUMBLE_TICKS;
    this.rumbleTicks--;
    return RUMBLE_PEAK * k * (this.reduceMotion ? 0.25 : 1);
  }

  rimAlpha(): number {
    if (this.rimAge >= RIM_MS) return 0;
    const k = 1 - this.rimAge / RIM_MS;
    return RIM_PEAK * k * k * (this.reduceMotion ? 0.3 : 1);
  }

  /** Entrance scale for a boss id: 1 unless it is still arriving. */
  bossScale(id: number): number {
    for (let i = 0; i < MAX_BOSSES; i++) {
      if (this.bAlive[i] === 1 && this.bId[i] === id) {
        return entranceScale(entranceProgress(this.bAge[i]!));
      }
    }
    return 1;
  }

  private entrance(id: number): number {
    for (let i = 0; i < MAX_BOSSES; i++) {
      if (this.bAlive[i] === 1 && this.bId[i] === id) return entranceProgress(this.bAge[i]!);
    }
    return 1;
  }

  /** Ground layer, before the sorted sprites: chest light, crack rings, contact-reach telegraph. */
  drawGround(ctx: Ctx2D, frame: WorldFrame): void {
    this.drawChestLight(ctx, frame);
    this.drawCracks(ctx, frame);
    this.drawTelegraph(ctx, frame);
  }

  private drawChestLight(ctx: Ctx2D, frame: WorldFrame): void {
    const { state, cam, view, time } = frame;
    const list = state.interactables;
    if (list.length === 0) return;
    const b = visibleWorldBounds(cam, view, 3);
    const reduce = frame.reduceMotion === true;
    let any = false;
    ctx.fillStyle = CHEST_GLOW;
    ctx.beginPath();
    let pulse = 1;
    for (let i = 0; i < list.length; i++) {
      const it = list[i]!;
      if (it.kind !== 'chest' || it.used) continue;
      if (it.pos.x < b.minX || it.pos.x > b.maxX || it.pos.y < b.minY || it.pos.y > b.maxY) continue;
      const x = projectX(it.pos.x, cam, view), y = projectY(it.pos.y, 0, cam, view);
      const r = 1.9 * cam.zoom;
      ctx.moveTo(x + r, y);
      ctx.ellipse(x, y, r, r * Y_SQUASH, 0, 0, TAU);
      pulse = glowPulse(time, it.id, reduce);
      any = true;
    }
    if (any) {
      ctx.globalAlpha = 0.07 + 0.04 * pulse;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawCracks(ctx: Ctx2D, frame: WorldFrame): void {
    const { cam, view } = frame;
    for (let i = 0; i < MAX_BOSSES; i++) {
      if (this.bAlive[i] === 0) continue;
      const age = this.bAge[i]!;
      const t = Math.min(1, age / RING_MS);
      const fade = 1 - t * t;
      const x = projectX(this.bX[i]!, cam, view), y = projectY(this.bY[i]!, 0, cam, view);
      const R = this.bR[i]! * cam.zoom;
      // Dust and scorch under the arrival.
      ctx.fillStyle = DUST;
      ctx.globalAlpha = 0.5 * fade;
      ctx.beginPath();
      ctx.ellipse(x, y, R * (1.0 + t * 1.4), R * (1.0 + t * 1.4) * Y_SQUASH, 0, 0, TAU);
      ctx.fill();
      // Three shock rings expanding at staggered starts.
      ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const tk = Math.max(0, Math.min(1, (age - k * 130) / 900));
        if (tk <= 0) continue;
        const rr = R * (0.7 + tk * (2.4 + k * 0.9));
        ctx.strokeStyle = k === 0 ? '#ffb070' : '#b0704a';
        ctx.globalAlpha = Math.min(1, (1 - tk) * 1.3) * (k === 0 ? 1 : 0.85);
        ctx.lineWidth = Math.max(2, (7 - k * 1.5) * (1 - tk) * (cam.zoom / 32) + 1.5);
        ctx.beginPath();
        ctx.ellipse(x, y, rr, rr * Y_SQUASH, 0, 0, TAU);
        ctx.stroke();
      }
      // Jagged cracks radiating outward (one path).
      ctx.beginPath();
      const reach = R * (1.2 + Math.min(1, age / 500) * 2.2);
      for (let c = 0; c < 9; c++) {
        const a = (c / 9) * TAU + hash01(this.bId[i]!, c, 1) * 0.5;
        const ca = Math.cos(a), sa = Math.sin(a);
        ctx.moveTo(x + ca * R * 0.5, y + sa * R * 0.5 * Y_SQUASH);
        const bend = (hash01(this.bId[i]!, c, 2) - 0.5) * 0.7;
        const mx = 0.55 * reach, ex = reach * (0.8 + hash01(this.bId[i]!, c, 3) * 0.3);
        ctx.lineTo(x + (ca - sa * bend) * mx, y + (sa + ca * bend) * mx * Y_SQUASH);
        ctx.lineTo(x + ca * ex, y + sa * ex * Y_SQUASH);
      }
      // Ember seeping out of the fissures, then the dark crack on top.
      ctx.strokeStyle = EMBER;
      ctx.globalAlpha = 0.55 * fade;
      ctx.lineWidth = Math.max(3, 6 * (cam.zoom / 32));
      ctx.stroke();
      ctx.strokeStyle = '#0d0806';
      ctx.globalAlpha = 0.9 * fade;
      ctx.lineWidth = Math.max(1.5, 3 * (cam.zoom / 32));
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 1;
    }
  }

  private drawTelegraph(ctx: Ctx2D, frame: WorldFrame): void {
    const { state, prev, alpha, cam, view, time } = frame;
    const enemies = state.enemies;
    const reduce = frame.reduceMotion === true;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      if (!e.isBoss || e.dyingFor !== undefined) continue;
      const was = prev?.enemies[i];
      const ex = was !== undefined && was.id === e.id ? was.pos.x + (e.pos.x - was.pos.x) * alpha : e.pos.x;
      const ey = was !== undefined && was.id === e.id ? was.pos.y + (e.pos.y - was.pos.y) * alpha : e.pos.y;
      const x = projectX(ex, cam, view), y = projectY(ey, 0, cam, view);
      const r = telegraphRadius(e.radius) * cam.zoom;
      const near = Math.hypot(state.player.pos.x - e.pos.x, state.player.pos.y - e.pos.y) < telegraphRadius(e.radius) + 3;
      const period = near ? 620 : 1400;
      const s = reduce ? 0.6 : 0.5 + 0.5 * Math.sin((time / period) * TAU + e.id);
      const appear = entranceProgress(this.bossAge(e.id));
      ctx.fillStyle = EMBER;
      ctx.globalAlpha = (0.07 + 0.06 * s) * appear;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * Y_SQUASH, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = EMBER;
      ctx.globalAlpha = Math.min(1, 0.55 + 0.35 * s + (near ? 0.1 : 0)) * appear;
      ctx.lineWidth = 3.5 * Math.max(1, cam.zoom / 32);
      ctx.setLineDash([9, 8]);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * Y_SQUASH, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  private bossAge(id: number): number {
    for (let i = 0; i < MAX_BOSSES; i++) {
      if (this.bAlive[i] === 1 && this.bId[i] === id) return this.bAge[i]!;
    }
    return ENTRANCE_MS;
  }

  /**
   * Under half health the boss's eyes flare and an ember aura seeps out at its
   * feet. A cheap overlay: the baked creature sprite is never touched.
   */
  drawBossTell(ctx: Ctx2D, frame: WorldFrame, e: Enemy, x: number, y: number, unit: number, headY = y - unit * 1.6): void {
    const tell = phaseTell(e.hp, e.maxHp);
    if (tell <= 0) return;
    const reduce = frame.reduceMotion === true;
    const s = reduce ? 0.7 : 0.55 + 0.45 * Math.sin(frame.time * 0.008 + e.id);
    // Aura at the feet.
    ctx.fillStyle = EMBER;
    ctx.globalAlpha = tell * (0.12 + 0.1 * s);
    ctx.beginPath();
    ctx.ellipse(x, y, unit * 1.9, unit * 1.9 * Y_SQUASH, 0, 0, TAU);
    ctx.fill();
    // Eye flare: halo then hot core.
    const ex = unit * 0.3, er = unit * 0.17;
    ctx.fillStyle = EMBER;
    ctx.globalAlpha = tell * (0.35 + 0.25 * s);
    ctx.beginPath();
    ctx.moveTo(x - ex + er * 2, headY); ctx.arc(x - ex, headY, er * 2, 0, TAU);
    ctx.moveTo(x + ex + er * 2, headY); ctx.arc(x + ex, headY, er * 2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffe2a8';
    ctx.globalAlpha = Math.min(1, tell * (0.7 + 0.3 * s));
    ctx.beginPath();
    ctx.moveTo(x - ex + er * 0.7, headY); ctx.arc(x - ex, headY, er * 0.7, 0, TAU);
    ctx.moveTo(x + ex + er * 0.7, headY); ctx.arc(x + ex, headY, er * 0.7, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawMotes(ctx: Ctx2D, frame: WorldFrame): void {
    drawMotes(ctx, frame);
  }

  /** Red rim pulse on arrival. One gradient, only while it is alive. */
  drawRim(ctx: Ctx2D, view: Viewport): void {
    const a = this.rimAlpha();
    if (a <= 0.005 || view.width <= 0 || view.height <= 0) return;
    const cx = view.width / 2, cy = view.height / 2;
    const grad = ctx.createRadialGradient(cx, cy, Math.min(cx, cy) * 0.55, cx, cy, Math.hypot(cx, cy));
    grad.addColorStop(0, 'rgba(160,20,10,0)');
    grad.addColorStop(1, 'rgba(160,20,10,1)');
    ctx.globalAlpha = a;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, view.width, view.height);
    ctx.globalAlpha = 1;
  }
}

// ---- registry: the world pass reaches the instance through the FxManager ----

const registry = new WeakMap<FxManager, Atmosphere>();

export function attachAtmosphere(fx: FxManager, atmo: Atmosphere): void {
  registry.set(fx, atmo);
}

export function atmosphereOf(fx: FxManager | undefined): Atmosphere | null {
  return fx === undefined ? null : (registry.get(fx) ?? null);
}
