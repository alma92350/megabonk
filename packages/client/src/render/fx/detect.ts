/**
 * Derive display feedback from two consecutive sim states. Pure: the output is a
 * function of (before, after, weapons) only; nothing here mutates either state.
 */
import type { Enemy, GameState, Pickup, SimEvent, WeaponDef } from '@megabonk/sim';

export type FxSpawnType = 'swing' | 'hit' | 'kill' | 'collect' | 'fly';
export type WeaponFxKind = 'smear' | 'streak' | 'orbit';

export interface FxSpawn {
  readonly type: FxSpawnType;
  /** Enemy id, pickup id, or weapon index for a swing. */
  readonly id: number;
  readonly tick: number;
  /** Where it happened (the struck enemy, the pickup, or the hero for a swing). */
  readonly x: number;
  readonly y: number;
  /** Unit direction: hero -> target for hits, aim for swings, motion for fly. */
  readonly dx: number;
  readonly dy: number;
  /** Hero position at the time (source of streaks). */
  readonly sx: number;
  readonly sy: number;
  /** Damage dealt (hit), hits landed (swing). */
  readonly amount: number;
  readonly crit: boolean;
  /** Enemy kind or pickup kind. */
  readonly kind: string;
  readonly weapon: string;
  readonly weaponKind: WeaponFxKind;
  /** World range of the weapon (swing) or enemy radius (kill). */
  readonly range: number;
}

export function weaponFxKind(kind: string): WeaponFxKind {
  if (kind === 'projectile') return 'streak';
  if (kind === 'orbital') return 'orbit';
  return 'smear';
}

const beforeById = new Map<number, Enemy>();
const afterPickupIds = new Set<number>();
const beforePickupById = new Map<number, Pickup>();

function make(
  type: FxSpawnType, id: number, tick: number, x: number, y: number,
  o: Partial<FxSpawn> = {},
): FxSpawn {
  return {
    type, id, tick, x, y, dx: 0, dy: 0, sx: x, sy: y, amount: 0, crit: false,
    kind: '', weapon: '', weaponKind: 'smear', range: 0, ...o,
  };
}

function critDamageFor(events: readonly SimEvent[], weapon: string, dealt: number): boolean {
  for (const e of events) {
    if (e.type !== 'crit' || e.data === undefined) continue;
    if (e.data.weapon !== weapon) continue;
    const d = e.data.damage;
    if (typeof d === 'number' && Math.abs(d - dealt) < 1e-4) return true;
  }
  return false;
}

export function detectFx(
  before: GameState,
  after: GameState,
  weapons: Readonly<Record<string, WeaponDef>>,
): FxSpawn[] {
  const out: FxSpawn[] = [];
  if (after.tick <= before.tick) return out;
  const tick = after.tick;
  const player = after.player;
  const px = player.pos.x;
  const py = player.pos.y;

  // Weapons that swung: cooldown went UP (a reset), never merely ticked down.
  const swung: number[] = [];
  const bw = before.player.weapons;
  for (let i = 0; i < player.weapons.length; i++) {
    const w = player.weapons[i]!;
    const b = bw[i];
    if (b !== undefined && b.id === w.id && w.cooldown > b.cooldown) swung.push(i);
  }
  const hitsBySwing = new Int32Array(swung.length);
  const aimX = new Float64Array(swung.length);
  const aimY = new Float64Array(swung.length);

  // Enemy deltas. Index-aligned fast path; falls back to an id map on mismatch.
  let mapBuilt = false;
  const be = before.enemies;
  const ae = after.enemies;
  for (let i = 0; i < ae.length; i++) {
    const e = ae[i]!;
    let b: Enemy | undefined = be[i];
    if (b === undefined || b.id !== e.id) {
      if (!mapBuilt) {
        beforeById.clear();
        for (let j = 0; j < be.length; j++) beforeById.set(be[j]!.id, be[j]!);
        mapBuilt = true;
      }
      b = beforeById.get(e.id);
    }
    if (b === undefined || b.dyingFor !== undefined) continue;

    const dealt = b.hp - e.hp;
    const killed = e.dyingFor !== undefined;
    if (dealt > 1e-6) {
      const ex = e.pos.x - px;
      const ey = e.pos.y - py;
      const dist = Math.hypot(ex, ey) || 1;
      // Attribute to the first swinging weapon that could reach it, else the first.
      let si = -1;
      for (let k = 0; k < swung.length; k++) {
        const def = weapons[player.weapons[swung[k]!]!.id];
        if (def !== undefined && def.range * player.stats.area + e.radius >= dist) { si = k; break; }
      }
      if (si < 0 && swung.length > 0) si = 0;
      const wid = si >= 0 ? player.weapons[swung[si]!]!.id : '';
      const def = wid === '' ? undefined : weapons[wid];
      if (si >= 0) { hitsBySwing[si]!++; aimX[si] = aimX[si]! + ex / dist; aimY[si] = aimY[si]! + ey / dist; }
      out.push(make('hit', e.id, tick, e.pos.x, e.pos.y, {
        dx: ex / dist, dy: ey / dist, sx: px, sy: py, amount: dealt,
        crit: wid !== '' && critDamageFor(after.events, wid, dealt),
        kind: e.kind, weapon: wid, weaponKind: weaponFxKind(def?.kind ?? 'melee'), range: dist,
      }));
    }
    if (killed) {
      out.push(make('kill', e.id, tick, e.pos.x, e.pos.y, { kind: e.kind, range: e.radius }));
    }
  }

  for (let k = 0; k < swung.length; k++) {
    const w = player.weapons[swung[k]!]!;
    const def = weapons[w.id];
    let dx = aimX[k]!;
    let dy = aimY[k]!;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) { dx /= len; dy /= len; } else { dx = player.facing.x; dy = player.facing.y; }
    out.push(make('swing', swung[k]!, tick, px, py, {
      dx, dy, amount: hitsBySwing[k]!, weapon: w.id,
      weaponKind: weaponFxKind(def?.kind ?? 'melee'),
      range: def === undefined ? 3 : def.range * player.stats.area,
    }));
  }

  // Pickups: flying (moved) and collected (vanished inside the pickup radius).
  const bp = before.pickups;
  const ap = after.pickups;
  if (bp.length > 0) {
    afterPickupIds.clear();
    for (let i = 0; i < ap.length; i++) afterPickupIds.add(ap[i]!.id);
    beforePickupById.clear();
    for (let i = 0; i < bp.length; i++) beforePickupById.set(bp[i]!.id, bp[i]!);
    const reach = player.stats.pickupRadius + 0.6;
    for (let i = 0; i < bp.length; i++) {
      const p = bp[i]!;
      if (!afterPickupIds.has(p.id)) {
        if (Math.hypot(p.pos.x - px, p.pos.y - py) <= reach) {
          out.push(make('collect', p.id, tick, p.pos.x, p.pos.y, { kind: p.kind, sx: px, sy: py }));
        }
      }
    }
    for (let i = 0; i < ap.length; i++) {
      const p = ap[i]!;
      const b = beforePickupById.get(p.id);
      if (b === undefined) continue;
      const mx = p.pos.x - b.pos.x;
      const my = p.pos.y - b.pos.y;
      if (mx * mx + my * my > 1e-6) {
        const m = Math.hypot(mx, my);
        out.push(make('fly', p.id, tick, b.pos.x, b.pos.y, { dx: mx / m, dy: my / m, kind: p.kind }));
      }
    }
  }
  return out;
}
