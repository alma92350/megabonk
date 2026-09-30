/**
 * Fixed-size particle store. Structure-of-arrays, no per-particle objects, a
 * free-list for O(1) spawn, and a hard cap. Positions are world units; `z` is
 * height above the ground (lifted by the projection). Ages are wall-clock ms.
 */

/** 0 = square, 1 = circle, 2 = line (x,y start; vx,vy are the endpoint DELTA). */
export const SHAPE_RECT = 0;
export const SHAPE_CIRCLE = 1;
export const SHAPE_LINE = 2;

const GRAVITY = 14;

export class ParticlePool {
  readonly cap: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly size: Float32Array;
  readonly drag: Float32Array;
  readonly color: Uint8Array;
  readonly shape: Uint8Array;
  readonly alive: Uint8Array;
  private readonly free: Uint16Array;
  private freeTop: number;
  private readonly lowLimit: number;
  live = 0;

  constructor(cap: number) {
    this.cap = Math.max(1, Math.min(cap | 0, 65535));
    const n = this.cap;
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.age = new Float32Array(n); this.life = new Float32Array(n);
    this.size = new Float32Array(n); this.drag = new Float32Array(n);
    this.color = new Uint8Array(n); this.shape = new Uint8Array(n); this.alive = new Uint8Array(n);
    this.free = new Uint16Array(n);
    for (let i = 0; i < n; i++) this.free[i] = n - 1 - i;
    this.freeTop = n;
    // Cosmetic trails and dust may fill only three quarters: hits always fit.
    this.lowLimit = Math.max(1, Math.floor(n * 0.75));
  }

  /** Returns a slot (fields reset, caller fills them) or -1 when full. prio 0 = cosmetic. */
  spawn(prio: number): number {
    if (this.freeTop === 0) return -1;
    if (prio <= 0 && this.live >= this.lowLimit) return -1;
    const i = this.free[--this.freeTop]!;
    this.alive[i] = 1;
    this.live++;
    this.age[i] = 0; this.z[i] = 0; this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0;
    this.drag[i] = 0; this.life[i] = 150; this.size[i] = 0.1;
    this.color[i] = 0; this.shape[i] = SHAPE_RECT;
    return i;
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    const n = this.cap;
    for (let i = 0; i < n; i++) {
      if (this.alive[i] === 0) continue;
      const a = this.age[i]! + dtMs;
      if (a >= this.life[i]!) {
        this.alive[i] = 0;
        this.free[this.freeTop++] = i;
        this.live--;
        continue;
      }
      this.age[i] = a;
      if (this.shape[i] === SHAPE_LINE) continue;
      const k = Math.max(0, 1 - this.drag[i]! * dt);
      this.vx[i] = this.vx[i]! * k;
      this.vy[i] = this.vy[i]! * k;
      this.x[i] = this.x[i]! + this.vx[i]! * dt;
      this.y[i] = this.y[i]! + this.vy[i]! * dt;
      if (this.vz[i] !== 0 || this.z[i]! > 0) {
        this.vz[i] = this.vz[i]! - GRAVITY * dt;
        const z = this.z[i]! + this.vz[i]! * dt;
        if (z <= 0) { this.z[i] = 0; this.vz[i] = 0; } else this.z[i] = z;
      }
    }
  }

  clear(): void {
    this.alive.fill(0);
    for (let i = 0; i < this.cap; i++) this.free[i] = this.cap - 1 - i;
    this.freeTop = this.cap;
    this.live = 0;
  }

  /** Order-independent fingerprint of the live set, for determinism tests. */
  checksum(): number {
    let h = 0;
    for (let i = 0; i < this.cap; i++) {
      if (this.alive[i] === 0) continue;
      let v = Math.imul(Math.round(this.x[i]! * 64), 73856093)
        ^ Math.imul(Math.round(this.y[i]! * 64), 19349663)
        ^ Math.imul(this.color[i]! + 1, 83492791)
        ^ Math.imul(Math.round(this.age[i]! * 4) + this.shape[i]!, 2654435761);
      v ^= v >>> 13;
      h = (h + Math.imul(v, 0x5bd1e995)) | 0;
    }
    return h;
  }
}
