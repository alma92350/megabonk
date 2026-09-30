/**
 * Combat feedback: weapon smears, streaks, orbital shards, hit sparks, kill
 * puffs, gem pops, magnet trails and a few damage numbers.
 *
 * Spawning is per sim TICK (`observe`), driven only by the previous and current
 * GameState, with variation from a hash of (entity id, tick): the same run makes
 * the same effects. Ageing is per RENDER frame in wall-clock ms (`draw`). It is
 * display-only and never writes back into sim state.
 *
 * Budget: one pooled typed-array store (hard cap), particles batched into one
 * path per (colour, alpha bucket), no shadowBlur, no allocation while drawing.
 */
import type { GameState, WeaponDef } from '@megabonk/sim';
import { lerp, type Ctx2D } from '../ctx.js';
import { Y_SQUASH, projectX, projectY } from '../projection.js';
import { PICKUP_COLORS, THEME, enemyVisual, font } from '../theme.js';
import type { WorldFrame } from '../world.js';
import { detectFx, weaponFxKind, type FxSpawn } from './detect.js';
import { hash01 } from './hash.js';
import { ParticlePool, SHAPE_CIRCLE, SHAPE_LINE, SHAPE_RECT } from './pool.js';

export const DEFAULT_CAPACITY = 640;
export const MAX_NUMBERS = 12;
const MAX_SHAPES = 24;
const MAX_KICKS = 32;
const MAX_COLORS = 64;
const TAU = Math.PI * 2;
const KICK_MS = 130;
const NUMBER_MS = 480;

interface Tint { readonly main: string; readonly hi: string }
const TINTS: Readonly<Record<string, Tint>> = {
  bonker: { main: '#ffb13b', hi: '#fff0c4' },
  dart: { main: '#4fdcff', hi: '#ffffff' },
  halo: { main: '#b98cff', hi: '#f2e6ff' },
};
const KIND_TINTS: Readonly<Record<string, Tint>> = {
  smear: TINTS.bonker!, streak: TINTS.dart!, orbit: TINTS.halo!,
};
const SPARK_WHITE = '#ffffff';
const SPARK_YELLOW = '#ffe45c';

export interface FxOptions {
  readonly reduceMotion?: boolean;
  readonly capacity?: number;
}

export type RangedLookup = Readonly<Record<string, { readonly ranged?: unknown }>>;

export class FxManager {
  readonly reduceMotion: boolean;
  private readonly pool: ParticlePool;

  // colour table
  private readonly colors: string[] = [];
  private readonly colorIdx = new Map<string, number>();

  // scratch for the batched draw (allocated once)
  private readonly sx: Float32Array;
  private readonly sy: Float32Array;
  private readonly sx2: Float32Array;
  private readonly sy2: Float32Array;
  private readonly keyOf: Uint16Array;
  private readonly order: Uint16Array;
  private readonly counts = new Uint16Array(MAX_COLORS * 8 + 1);

  // shapes: crescents (0) and rings (1)
  private readonly shKind = new Uint8Array(MAX_SHAPES);
  private readonly shAlive = new Uint8Array(MAX_SHAPES);
  private readonly shX = new Float32Array(MAX_SHAPES);
  private readonly shY = new Float32Array(MAX_SHAPES);
  private readonly shAng = new Float32Array(MAX_SHAPES);
  private readonly shR = new Float32Array(MAX_SHAPES);
  private readonly shAge = new Float32Array(MAX_SHAPES);
  private readonly shLife = new Float32Array(MAX_SHAPES);
  private readonly shColor = new Uint8Array(MAX_SHAPES);
  private readonly shHi = new Uint8Array(MAX_SHAPES);
  private liveShapes = 0;

  // damage numbers
  private readonly nAlive = new Uint8Array(MAX_NUMBERS);
  private readonly nX = new Float32Array(MAX_NUMBERS);
  private readonly nY = new Float32Array(MAX_NUMBERS);
  private readonly nAge = new Float32Array(MAX_NUMBERS);
  private readonly nVal = new Int32Array(MAX_NUMBERS);
  private readonly nCrit = new Uint8Array(MAX_NUMBERS);
  liveNumbers = 0;
  private readonly numText: string[] = [];

  // hit kicks
  private readonly kId = new Int32Array(MAX_KICKS);
  private readonly kAge = new Float32Array(MAX_KICKS);
  private readonly kDx = new Float32Array(MAX_KICKS);
  private readonly kDy = new Float32Array(MAX_KICKS);
  private readonly kAlive = new Uint8Array(MAX_KICKS);
  private readonly kMap = new Map<number, number>();
  private kicksLive = 0;

  private pulse = 0;
  private lastTime = -1;
  /** Total spawns since construction (tests and diagnostics). */
  spawned = 0;

  constructor(opts: FxOptions = {}) {
    this.reduceMotion = opts.reduceMotion === true;
    const cap = opts.capacity ?? DEFAULT_CAPACITY;
    this.pool = new ParticlePool(cap);
    const n = this.pool.cap;
    this.sx = new Float32Array(n); this.sy = new Float32Array(n);
    this.sx2 = new Float32Array(n); this.sy2 = new Float32Array(n);
    this.keyOf = new Uint16Array(n); this.order = new Uint16Array(n);
    this.colorFor('#ffffff');
  }

  get live(): number { return this.pool.live; }
  get capacity(): number { return this.pool.cap; }

  clear(): void {
    this.pool.clear();
    this.shAlive.fill(0); this.liveShapes = 0;
    this.nAlive.fill(0); this.liveNumbers = 0;
    this.kAlive.fill(0); this.kMap.clear(); this.kicksLive = 0;
    this.pulse = 0;
    this.lastTime = -1;
  }

  checksum(): number {
    let h = this.pool.checksum();
    for (let i = 0; i < MAX_SHAPES; i++) {
      if (this.shAlive[i] === 1) h = (h + Math.imul(Math.round(this.shX[i]! * 64) ^ Math.round(this.shAng[i]! * 64), 0x9e3779b1)) | 0;
    }
    for (let i = 0; i < MAX_NUMBERS; i++) {
      if (this.nAlive[i] === 1) h = (h + Math.imul(this.nVal[i]! + 1, 0x85ebca6b)) | 0;
    }
    return h;
  }

  // ---- spawning (per sim tick) --------------------------------------------

  observe(
    before: GameState,
    after: GameState,
    weapons: Readonly<Record<string, WeaponDef>>,
    enemies?: RangedLookup,
  ): void {
    // A fresh run (or a staged scene) restarts the clock: drop stale effects.
    if (after.tick < before.tick) { this.clear(); return; }
    const list = detectFx(before, after, weapons);
    for (let i = 0; i < list.length; i++) this.spawn(list[i]!, enemies);
  }

  private colorFor(c: string): number {
    const known = this.colorIdx.get(c);
    if (known !== undefined) return known;
    if (this.colors.length >= MAX_COLORS) return 0;
    this.colors.push(c);
    this.colorIdx.set(c, this.colors.length - 1);
    return this.colors.length - 1;
  }

  private tintFor(weapon: string, kind: FxSpawn['weaponKind']): Tint {
    return TINTS[weapon] ?? KIND_TINTS[kind]!;
  }

  private n(count: number): number {
    return this.reduceMotion ? Math.max(1, Math.round(count * 0.4)) : count;
  }

  private dot(
    prio: number, x: number, y: number, z: number, vx: number, vy: number, vz: number,
    size: number, life: number, color: number, shape: number, drag: number,
  ): void {
    const i = this.pool.spawn(prio);
    if (i < 0) return;
    const p = this.pool;
    p.x[i] = x; p.y[i] = y; p.z[i] = z; p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
    p.size[i] = size;
    p.life[i] = this.reduceMotion ? life * 0.65 : life;
    p.color[i] = color; p.shape[i] = shape; p.drag[i] = drag;
    this.spawned++;
  }

  private line(
    x: number, y: number, ex: number, ey: number, z: number, width: number, life: number, color: number,
  ): void {
    const i = this.pool.spawn(1);
    if (i < 0) return;
    const p = this.pool;
    p.x[i] = x; p.y[i] = y; p.z[i] = z; p.vx[i] = ex - x; p.vy[i] = ey - y;
    p.size[i] = width; p.life[i] = life; p.color[i] = color; p.shape[i] = SHAPE_LINE;
    this.spawned++;
  }

  private shape(
    kind: number, x: number, y: number, ang: number, r: number, life: number, color: number, hi: number,
  ): void {
    let slot = -1;
    for (let i = 0; i < MAX_SHAPES; i++) if (this.shAlive[i] === 0) { slot = i; break; }
    if (slot < 0) return;
    this.shAlive[slot] = 1; this.liveShapes++;
    this.shKind[slot] = kind; this.shX[slot] = x; this.shY[slot] = y; this.shAng[slot] = ang;
    this.shR[slot] = r; this.shAge[slot] = 0; this.shLife[slot] = this.reduceMotion ? life * 0.65 : life;
    this.shColor[slot] = color; this.shHi[slot] = hi;
    this.spawned++;
  }

  private number(x: number, y: number, value: number, crit: boolean): void {
    if (this.reduceMotion && !crit) return;
    let slot = -1;
    for (let i = 0; i < MAX_NUMBERS; i++) if (this.nAlive[i] === 0) { slot = i; break; }
    if (slot < 0) {
      if (!crit) return;
      let oldest = 0;
      for (let i = 1; i < MAX_NUMBERS; i++) if (this.nAge[i]! > this.nAge[oldest]!) oldest = i;
      slot = oldest;
      this.liveNumbers--;
    }
    this.nAlive[slot] = 1; this.liveNumbers++;
    this.nX[slot] = x; this.nY[slot] = y; this.nAge[slot] = 0;
    this.nVal[slot] = Math.max(1, Math.round(value)); this.nCrit[slot] = crit ? 1 : 0;
  }

  private kick(id: number, dx: number, dy: number): void {
    if (this.reduceMotion) return;
    let slot = this.kMap.get(id) ?? -1;
    if (slot < 0) {
      for (let i = 0; i < MAX_KICKS; i++) if (this.kAlive[i] === 0) { slot = i; break; }
      if (slot < 0) return;
      this.kAlive[slot] = 1; this.kicksLive++;
      this.kMap.set(id, slot);
    }
    this.kId[slot] = id; this.kAge[slot] = 0; this.kDx[slot] = dx; this.kDy[slot] = dy;
  }

  /** Slot of the hit-kick for this enemy id, or -1. Cheap when nothing is kicked. */
  kickFor(id: number): number {
    return this.kicksLive === 0 ? -1 : (this.kMap.get(id) ?? -1);
  }
  /** 1 at the moment of impact, easing to 0. */
  kickAmount(slot: number): number {
    const t = 1 - this.kAge[slot]! / KICK_MS;
    return t <= 0 ? 0 : t * t;
  }
  kickDirX(slot: number): number { return this.kDx[slot]!; }
  kickDirY(slot: number): number { return this.kDy[slot]!; }

  private spawn(f: FxSpawn, enemies: RangedLookup | undefined): void {
    switch (f.type) {
      case 'hit': this.spawnHit(f); break;
      case 'kill': this.spawnKill(f, enemies); break;
      case 'swing': this.spawnSwing(f); break;
      case 'collect': this.spawnCollect(f); break;
      case 'fly': this.spawnFly(f); break;
    }
  }

  private spawnHit(f: FxSpawn): void {
    const tint = this.tintFor(f.weapon, f.weaponKind);
    const cw = this.colorFor(SPARK_WHITE);
    const cy = this.colorFor(SPARK_YELLOW);
    const ct = this.colorFor(tint.main);
    const count = this.n(f.crit ? 7 : 5);
    for (let k = 0; k < count; k++) {
      const a = hash01(f.id, f.tick, k * 3 + 1) * TAU;
      const sp = 3.5 + hash01(f.id, f.tick, k * 3 + 2) * 5;
      // Half of the burst is thrown back along the blow, half scatters.
      const vx = Math.cos(a) * sp * 0.6 + f.dx * sp * 0.7;
      const vy = Math.sin(a) * sp * 0.6 + f.dy * sp * 0.7;
      const life = 90 + hash01(f.id, f.tick, k * 3 + 3) * 110;
      const col = k % 3 === 0 ? cw : k % 3 === 1 ? cy : (f.weapon === '' ? cw : ct);
      this.dot(1, f.x, f.y, 0.5, vx, vy, 2.5 + hash01(f.id, f.tick, k + 40) * 3,
        0.075 + hash01(f.id, f.tick, k + 60) * 0.05, life, col, SHAPE_RECT, 5);
    }
    if (f.crit) this.shape(1, f.x, f.y, 0, 0.9, 150, cy, cw);
    this.kick(f.id, f.dx, f.dy);
    this.number(f.x, f.y, f.amount, f.crit);

    if (f.weaponKind === 'streak') {
      const hi = this.colorFor(tint.hi);
      // tinted body + white core, from just in front of the muzzle to the target
      const mx = f.sx + f.dx * 0.9;
      const my = f.sy + f.dy * 0.9;
      this.line(mx, my, f.x, f.y, 0.75, 0.2, 130, ct);
      this.line(mx, my, f.x, f.y, 0.75, 0.08, 110, hi);
    }
  }

  private spawnSwing(f: FxSpawn): void {
    const tint = this.tintFor(f.weapon, f.weaponKind);
    if (f.weaponKind === 'orbit') {
      if (!this.reduceMotion && f.amount > 0) this.pulse = 1;
      return;
    }
    if (f.amount <= 0) return;
    const ct = this.colorFor(tint.main);
    const ch = this.colorFor(tint.hi);
    if (f.weaponKind === 'smear') {
      this.shape(0, f.x, f.y, Math.atan2(f.dy, f.dx), f.range * 0.92, 170, ct, ch);
    } else {
      // muzzle puff
      const count = this.n(4);
      for (let k = 0; k < count; k++) {
        const j = (hash01(f.tick, k, 7) - 0.5) * 1.2;
        const sp = 3 + hash01(f.tick, k, 9) * 3;
        const a = Math.atan2(f.dy, f.dx) + j;
        this.dot(1, f.x + f.dx * 0.8, f.y + f.dy * 0.8, 0.75, Math.cos(a) * sp, Math.sin(a) * sp, 0,
          0.11 + hash01(f.tick, k, 11) * 0.06, 100, k % 2 === 0 ? ch : ct, SHAPE_CIRCLE, 8);
      }
    }
  }

  private spawnKill(f: FxSpawn, enemies: RangedLookup | undefined): void {
    const ranged = enemies?.[f.kind]?.ranged !== undefined;
    const v = enemyVisual(f.kind, ranged);
    const body = this.colorFor(v.body);
    const light = this.colorFor(v.light);
    const shade = this.colorFor(v.shade);
    const r = Math.max(0.3, f.range * v.scale);
    // a soft body-coloured flash, then dust and leaf-shaped flecks
    this.dot(1, f.x, f.y, 0.4, 0, 0, 0, r * 0.95, 150, body, SHAPE_CIRCLE, 0);
    const count = this.n(9);
    for (let k = 0; k < count; k++) {
      const a = hash01(f.id, f.tick, k * 2 + 101) * TAU;
      const sp = 1.6 + hash01(f.id, f.tick, k * 2 + 102) * 3.2;
      const col = k % 3 === 0 ? light : k % 3 === 1 ? body : shade;
      const leaf = k % 3 === 2;
      this.dot(1, f.x, f.y, 0.3, Math.cos(a) * sp, Math.sin(a) * sp, 1.5 + hash01(f.id, f.tick, k + 120) * 2.5,
        r * (leaf ? 0.2 : 0.3) * (0.7 + hash01(f.id, f.tick, k + 140) * 0.6),
        170 + hash01(f.id, f.tick, k + 160) * 90, col, leaf ? SHAPE_RECT : SHAPE_CIRCLE, 4);
    }
    // XP gem pop
    const xp = this.colorFor(PICKUP_COLORS.xp);
    const wh = this.colorFor(SPARK_WHITE);
    const gems = this.n(5);
    for (let k = 0; k < gems; k++) {
      const a = hash01(f.id, f.tick, k + 200) * TAU;
      this.dot(1, f.x, f.y, 0.25, Math.cos(a) * 2.4, Math.sin(a) * 2.4, 3.5, 0.08, 200,
        k % 2 === 0 ? xp : wh, SHAPE_RECT, 3);
    }
    this.shape(1, f.x, f.y, 0, 0.7, 200, xp, wh);
  }

  private spawnCollect(f: FxSpawn): void {
    const pc = PICKUP_COLORS[f.kind as keyof typeof PICKUP_COLORS] ?? PICKUP_COLORS.xp;
    const c = this.colorFor(pc);
    const w = this.colorFor(SPARK_WHITE);
    const count = this.n(6);
    for (let k = 0; k < count; k++) {
      const a = hash01(f.id, f.tick, k + 300) * TAU;
      const sp = 2 + hash01(f.id, f.tick, k + 320) * 2.5;
      this.dot(1, f.x, f.y, 0.3, Math.cos(a) * sp, Math.sin(a) * sp, 2, 0.1, 190,
        k % 2 === 0 ? c : w, SHAPE_CIRCLE, 4);
    }
    this.shape(1, f.x, f.y, 0, 1.15, 220, c, w);
  }

  private spawnFly(f: FxSpawn): void {
    if (((f.tick + f.id) & 1) !== 0) return;
    const pc = PICKUP_COLORS[f.kind as keyof typeof PICKUP_COLORS] ?? PICKUP_COLORS.xp;
    this.dot(0, f.x, f.y, 0.3, 0, 0, 0, 0.12, 170, this.colorFor(pc), SHAPE_CIRCLE, 0);
  }

  // ---- ageing (per render frame) ------------------------------------------

  update(dtMs: number): void {
    const dt = Number.isFinite(dtMs) ? Math.max(0, Math.min(dtMs, 100)) : 0;
    if (dt === 0) return;
    this.pool.update(dt);
    for (let i = 0; i < MAX_SHAPES; i++) {
      if (this.shAlive[i] === 0) continue;
      this.shAge[i] = this.shAge[i]! + dt;
      if (this.shAge[i]! >= this.shLife[i]!) { this.shAlive[i] = 0; this.liveShapes--; }
    }
    for (let i = 0; i < MAX_NUMBERS; i++) {
      if (this.nAlive[i] === 0) continue;
      this.nAge[i] = this.nAge[i]! + dt;
      if (this.nAge[i]! >= NUMBER_MS) { this.nAlive[i] = 0; this.liveNumbers--; }
    }
    if (this.kicksLive > 0) {
      for (let i = 0; i < MAX_KICKS; i++) {
        if (this.kAlive[i] === 0) continue;
        this.kAge[i] = this.kAge[i]! + dt;
        if (this.kAge[i]! >= KICK_MS) {
          this.kAlive[i] = 0; this.kicksLive--;
          if (this.kMap.get(this.kId[i]!) === i) this.kMap.delete(this.kId[i]!);
        }
      }
    }
    this.pulse *= Math.exp(-dt / 140);
  }

  // ---- drawing --------------------------------------------------------------

  draw(ctx: Ctx2D, frame: WorldFrame): void {
    const t = frame.time;
    const dt = this.lastTime < 0 ? 0 : Math.min(50, Math.max(0, t - this.lastTime));
    this.lastTime = t;
    this.update(dt);

    this.drawOrbitals(ctx, frame);
    if (this.liveShapes > 0) this.drawShapes(ctx, frame);
    if (this.pool.live > 0) this.drawParticles(ctx, frame);
    if (this.liveNumbers > 0) this.drawNumbers(ctx, frame);
  }

  private drawOrbitals(ctx: Ctx2D, frame: WorldFrame): void {
    const { state, prev, alpha, cam, view } = frame;
    const player = state.player;
    let ox = player.pos.x;
    let oy = player.pos.y;
    if (prev !== null) {
      ox = lerp(prev.player.pos.x, ox, alpha);
      oy = lerp(prev.player.pos.y, oy, alpha);
    }
    const cx = projectX(ox, cam, view);
    const zoom = cam.zoom;
    const cy = projectY(oy, 0.55, cam, view);
    const spin = frame.time * (this.reduceMotion ? 0.0011 : 0.0024);

    for (let wi = 0; wi < player.weapons.length; wi++) {
      const w = player.weapons[wi]!;
      const def = frame.content.weapons[w.id];
      if (def === undefined || weaponFxKind(def.kind) !== 'orbit') continue;
      const tint = TINTS[w.id] ?? KIND_TINTS.orbit!;
      const count = Math.min(8, Math.max(1, def.targets + def.targetsPerLevel * (w.level - 1)));
      const orbit = def.range * player.stats.area * 0.42 * zoom;
      const ry = orbit * Y_SQUASH;
      const size = zoom * 0.2 * (1 + this.pulse * 0.6);

      ctx.save();
      // faint orbit guide so the loop reads as a path, not stray dots
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = tint.main;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, orbit, ry, 0, 0, TAU);
      ctx.stroke();

      // trail: three fading layers behind each shard, one path per layer
      ctx.fillStyle = tint.main;
      for (let layer = 0; layer < 3; layer++) {
        ctx.globalAlpha = 0.5 - layer * 0.15;
        ctx.beginPath();
        for (let k = 0; k < count; k++) {
          const a = spin + (k * TAU) / count - (layer + 1) * 0.16;
          const px = cx + Math.cos(a) * orbit;
          const py = cy + Math.sin(a) * ry;
          const r = size * (0.85 - layer * 0.22);
          ctx.moveTo(px + r, py);
          ctx.arc(px, py, r, 0, TAU);
        }
        ctx.fill();
      }
      // shards: diamond in the weapon colour with a bright core
      ctx.globalAlpha = 1;
      ctx.beginPath();
      for (let k = 0; k < count; k++) {
        const a = spin + (k * TAU) / count;
        const px = cx + Math.cos(a) * orbit;
        const py = cy + Math.sin(a) * ry;
        ctx.moveTo(px, py - size * 1.5);
        ctx.lineTo(px + size, py);
        ctx.lineTo(px, py + size * 1.5);
        ctx.lineTo(px - size, py);
        ctx.closePath();
      }
      ctx.fill();
      ctx.strokeStyle = THEME.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = tint.hi;
      ctx.beginPath();
      for (let k = 0; k < count; k++) {
        const a = spin + (k * TAU) / count;
        const px = cx + Math.cos(a) * orbit;
        const py = cy + Math.sin(a) * ry;
        ctx.moveTo(px + size * 0.4, py);
        ctx.arc(px, py, size * 0.4, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    }
  }

  private drawShapes(ctx: Ctx2D, frame: WorldFrame): void {
    const { cam, view } = frame;
    const zoom = cam.zoom;
    ctx.save();
    for (let i = 0; i < MAX_SHAPES; i++) {
      if (this.shAlive[i] === 0) continue;
      const t = this.shAge[i]! / this.shLife[i]!;
      const cx = projectX(this.shX[i]!, cam, view);
      const cy = projectY(this.shY[i]!, 0.45, cam, view);
      const col = this.colors[this.shColor[i]!]!;
      const hi = this.colors[this.shHi[i]!]!;
      if (this.shKind[i] === 1) {
        // expanding ring
        const e = 1 - (1 - t) * (1 - t);
        const rx = this.shR[i]! * zoom * (0.3 + 0.7 * e);
        ctx.globalAlpha = (1 - t) * 0.85;
        ctx.strokeStyle = hi;
        ctx.lineWidth = Math.max(1.5, 3 * (1 - t));
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, rx * Y_SQUASH, 0, 0, TAU);
        ctx.stroke();
        continue;
      }
      // crescent: the leading edge sweeps across the arc, the tail follows it
      const span = 1.35;
      const lead = Math.min(1, t / 0.45);
      const tail = Math.max(0, (t - 0.2) / 0.8);
      const mid = this.shAng[i]!;
      const a0 = mid - span + 2 * span * tail;
      const a1 = mid - span + 2 * span * lead;
      if (a1 - a0 < 0.05) continue;
      const r = this.shR[i]! * zoom;
      const ry = r * Y_SQUASH;
      const am = (a0 + a1) / 2;
      const inner = 0.22 + 0.2 * (1 - (a1 - a0) / (2 * span));
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * ry);
      ctx.ellipse(cx, cy, r, ry, 0, a0, a1, false);
      ctx.quadraticCurveTo(
        cx + Math.cos(am) * r * inner, cy + Math.sin(am) * ry * inner,
        cx + Math.cos(a0) * r, cy + Math.sin(a0) * ry,
      );
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = (1 - t) * 0.95;
      ctx.strokeStyle = hi;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, ry, 0, a0, a1, false);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawParticles(ctx: Ctx2D, frame: WorldFrame): void {
    const { cam, view } = frame;
    const p = this.pool;
    const n = p.cap;
    const counts = this.counts;
    counts.fill(0);
    const w = view.width + 40;
    const h = view.height + 40;
    let total = 0;

    for (let i = 0; i < n; i++) {
      if (p.alive[i] === 0) continue;
      const x = projectX(p.x[i]!, cam, view);
      const y = projectY(p.y[i]!, p.z[i]!, cam, view);
      if (x < -20 || y < -20 || x > w || y > h) {
        this.keyOf[i] = 0xffff;
        continue;
      }
      const a = 1 - p.age[i]! / p.life[i]!;
      const bucket = Math.min(3, (a * 4) | 0);
      const isLine = p.shape[i] === SHAPE_LINE ? 1 : 0;
      const key = (((p.color[i]! << 2) | bucket) << 1) | isLine;
      this.keyOf[i] = key;
      this.sx[i] = x; this.sy[i] = y;
      if (isLine === 1) {
        // head races to the end in the first 40% of life, the tail follows
        const t = p.age[i]! / p.life[i]!;
        const head = Math.min(1, t / 0.4);
        const tail = Math.max(0, (t - 0.2) / 0.8);
        const x0 = p.x[i]!; const y0 = p.y[i]!;
        this.sx[i] = projectX(x0 + p.vx[i]! * tail, cam, view);
        this.sy[i] = projectY(y0 + p.vy[i]! * tail, p.z[i]!, cam, view);
        this.sx2[i] = projectX(x0 + p.vx[i]! * head, cam, view);
        this.sy2[i] = projectY(y0 + p.vy[i]! * head, p.z[i]!, cam, view);
      }
      counts[key] = counts[key]! + 1;
      total++;
    }
    if (total === 0) return;

    // counting sort by key into `order`
    let run = 0;
    const maxKey = this.colors.length * 8;
    for (let k = 0; k < maxKey; k++) { const c = counts[k]!; counts[k] = run; run += c; }
    for (let i = 0; i < n; i++) {
      if (p.alive[i] === 0) continue;
      const key = this.keyOf[i]!;
      if (key === 0xffff) continue;
      const at = counts[key]!; this.order[at] = i; counts[key] = at + 1;
    }
    // counts[k] is now the END of key k's run; the start is the previous run's end.
    const zoom = cam.zoom;
    ctx.save();
    ctx.lineCap = 'round';
    let start = 0;
    for (let key = 0; key < maxKey; key++) {
      const end = counts[key]!;
      if (end === start) continue;
      const isLine = (key & 1) === 1;
      const bucket = (key >> 1) & 3;
      const color = this.colors[key >> 3]!;
      ctx.globalAlpha = 0.28 + bucket * 0.24;
      ctx.beginPath();
      if (isLine) {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, p.size[this.order[start]!]! * zoom);
        for (let s = start; s < end; s++) {
          const i = this.order[s]!;
          ctx.moveTo(this.sx[i]!, this.sy[i]!);
          ctx.lineTo(this.sx2[i]!, this.sy2[i]!);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        for (let s = start; s < end; s++) {
          const i = this.order[s]!;
          const a = 1 - p.age[i]! / p.life[i]!;
          const r = Math.max(1, p.size[i]! * zoom * (0.5 + 0.5 * a));
          const x = this.sx[i]!; const y = this.sy[i]!;
          if (p.shape[i] === SHAPE_CIRCLE) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
          else ctx.rect(x - r, y - r, r * 2, r * 2);
        }
        ctx.fill();
      }
      start = end;
    }
    ctx.restore();
  }

  private numString(v: number): string {
    let s = this.numText[v];
    if (s === undefined) { s = String(v); if (v < 4096) this.numText[v] = s; }
    return s;
  }

  private drawNumbers(ctx: Ctx2D, frame: WorldFrame): void {
    const { cam, view } = frame;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = THEME.ink;
    for (let pass = 0; pass < 2; pass++) {
      ctx.font = font(pass === 0 ? 11 : 17, 'bold');
      ctx.lineWidth = pass === 0 ? 3 : 4;
      ctx.fillStyle = pass === 0 ? '#ffffff' : SPARK_YELLOW;
      for (let i = 0; i < MAX_NUMBERS; i++) {
        if (this.nAlive[i] === 0 || this.nCrit[i] !== pass) continue;
        const t = this.nAge[i]! / NUMBER_MS;
        const x = projectX(this.nX[i]!, cam, view);
        const y = projectY(this.nY[i]!, 1.4 + t * 1.4, cam, view);
        if (x < -30 || y < -30 || x > view.width + 30 || y > view.height + 30) continue;
        ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
        const s = this.numString(this.nVal[i]!);
        ctx.strokeText(s, x, y);
        ctx.fillText(s, x, y);
      }
    }
    ctx.restore();
  }
}
