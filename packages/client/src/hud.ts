/**
 * FR-18 HUD model.
 *
 * AC-18.1: the HUD holds no independent state. This is a pure projection of a
 * GameState snapshot plus the content bundle (for display names), so the only
 * way the HUD can be wrong is if the snapshot is.
 */

import { TICKS_PER_SECOND, xpForLevel, type ContentBundle, type GameState } from '@megabonk/sim';
import { formatCount, formatInt, formatTime } from './format.js';

export type LoadoutKind = 'weapon' | 'tome' | 'item';

export interface LoadoutEntry {
  readonly kind: LoadoutKind;
  readonly id: string;
  readonly name: string;
  /** Weapons carry a level 1..5; tomes and items carry stacks. */
  readonly level: number;
  readonly stacks: number;
  readonly rarity: string | null;
}

export interface BossReadout {
  readonly name: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly frac: number;
  /** FR-27: bosses, and only bosses, show a numeric bar. */
  readonly text: string;
}

export interface BuffReadout {
  readonly id: string;
  readonly name: string;
  readonly secondsLeft: number;
  readonly text: string;
}

export interface HudModel {
  readonly hp: number;
  readonly maxHp: number;
  readonly hpFrac: number;
  readonly hpText: string;
  readonly level: number;
  readonly xpInto: number;
  readonly xpNeed: number;
  readonly xpFrac: number;
  readonly seconds: number;
  readonly timeText: string;
  readonly goldText: string;
  readonly killsText: string;
  readonly rerolls: number;
  readonly weapons: readonly LoadoutEntry[];
  readonly tomes: readonly LoadoutEntry[];
  readonly items: readonly LoadoutEntry[];
  readonly boss: BossReadout | null;
  /** FR-14 timed shrine buffs. Countdown derived from TICKS, never Date.now. */
  readonly buffs: readonly BuffReadout[];
  /** Chest offers waiting to be opened, shown as a reward pip. */
  readonly pendingChests: number;
}

function frac(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

export function buildHud(state: GameState, content: ContentBundle): HudModel {
  const p = state.player;
  const maxHp = p.stats.maxHp;
  const xpNeed = xpForLevel(p.level);

  const weapons: LoadoutEntry[] = [];
  for (const w of p.weapons) {
    weapons.push({
      kind: 'weapon',
      id: w.id,
      name: content.weapons[w.id]?.name ?? w.id,
      level: w.level,
      stacks: w.level,
      rarity: null,
    });
  }

  const tomes: LoadoutEntry[] = [];
  const items: LoadoutEntry[] = [];
  for (const h of p.items) {
    const tome = content.tomes[h.id];
    const entry: LoadoutEntry = {
      kind: tome ? 'tome' : 'item',
      id: h.id,
      name: tome?.name ?? content.items[h.id]?.name ?? h.id,
      level: h.stacks,
      stacks: h.stacks,
      rarity: h.rarity,
    };
    (tome ? tomes : items).push(entry);
  }

  // The boss bar tracks the toughest live boss; a dying one is excluded so the
  // bar disappears the moment it dies rather than hanging on through the fade.
  let boss: BossReadout | null = null;
  for (const e of state.enemies) {
    if (!e.isBoss || e.dyingFor !== undefined || e.hp <= 0) continue;
    if (boss !== null && e.maxHp <= boss.maxHp) continue;
    boss = {
      name: content.enemies[e.kind]?.name ?? e.kind,
      hp: e.hp,
      maxHp: e.maxHp,
      frac: frac(e.hp, e.maxHp),
      text: `${formatInt(e.hp)} / ${formatInt(e.maxHp)}`,
    };
  }

  // AC-14.1: buff expiry is a tick, so the countdown is sim time. Using wall
  // clock here would drift the moment the tab throttles or the game pauses.
  const buffs: BuffReadout[] = [];
  for (const b of state.player.buffs) {
    const ticksLeft = Math.max(0, b.expiresAtTick - state.tick);
    const secondsLeft = ticksLeft / TICKS_PER_SECOND;
    buffs.push({
      id: b.id,
      name: content.shrines?.[b.id]?.name ?? b.id,
      secondsLeft,
      text: `${Math.ceil(secondsLeft)}s`,
    });
  }

  const seconds = state.tick / TICKS_PER_SECOND;

  return {
    hp: p.hp,
    maxHp,
    hpFrac: frac(p.hp, maxHp),
    hpText: `${formatInt(Math.max(0, p.hp))} / ${formatInt(maxHp)}`,
    level: p.level,
    xpInto: p.xp,
    xpNeed,
    xpFrac: frac(p.xp, xpNeed),
    seconds,
    timeText: formatTime(seconds),
    goldText: formatCount(p.gold),
    killsText: formatCount(state.kills),
    rerolls: p.rerolls,
    weapons,
    tomes,
    items,
    boss,
    buffs,
    pendingChests: Math.max(0, state.queuedChestOffers),
  };
}
