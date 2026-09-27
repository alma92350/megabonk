import { describe, expect, it } from 'vitest';
import { createRun, xpForLevel } from '@megabonk/sim';
import { content, makeRunConfig } from '@megabonk/content';
import { buildHud } from '../src/hud.js';
import { formatCount, formatSigned, formatTime } from '../src/format.js';

describe('formatTime as m:ss', () => {
  it('pads the seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(59.99)).toBe('0:59');
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(61.5)).toBe('1:01');
    expect(formatTime(900)).toBe('15:00');
    expect(formatTime(3671)).toBe('61:11');
  });

  it('never renders a negative or non-finite clock', () => {
    expect(formatTime(-5)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
});

describe('formatCount for large numbers', () => {
  it('leaves small integers alone', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(7)).toBe('7');
    expect(formatCount(999)).toBe('999');
  });

  it('abbreviates thousands and millions', () => {
    expect(formatCount(1000)).toBe('1.0k');
    expect(formatCount(1234)).toBe('1.2k');
    expect(formatCount(99999)).toBe('100k');
    expect(formatCount(1_500_000)).toBe('1.5M');
  });

  it('rounds fractions and handles junk', () => {
    expect(formatCount(12.7)).toBe('13');
    expect(formatCount(-4)).toBe('0');
    expect(formatCount(Number.NaN)).toBe('0');
  });

  it('signs deltas', () => {
    expect(formatSigned(3)).toBe('+3');
    expect(formatSigned(0)).toBe('0');
    expect(formatSigned(-2)).toBe('-2');
  });
});

describe('HUD model reads only from the snapshot (AC-18.1)', () => {
  const config = makeRunConfig(99);
  const state = createRun(config);

  it('reports hp, level, xp and the clock', () => {
    const hud = buildHud(state, content);
    expect(hud.maxHp).toBe(state.player.stats.maxHp);
    expect(hud.hp).toBe(state.player.hp);
    expect(hud.hpFrac).toBe(1);
    expect(hud.level).toBe(1);
    expect(hud.xpNeed).toBe(xpForLevel(1));
    expect(hud.xpFrac).toBe(0);
    expect(hud.timeText).toBe('0:00');
  });

  it('is a pure projection: same snapshot twice gives equal models', () => {
    expect(buildHud(state, content)).toEqual(buildHud(state, content));
  });

  it('lists the starting weapon with its level', () => {
    const hud = buildHud(state, content);
    expect(hud.weapons).toHaveLength(1);
    expect(hud.weapons[0]!.name).toBe(content.weapons.bonker!.name);
    expect(hud.weapons[0]!.level).toBe(1);
  });

  it('separates tomes from items and shows stack counts', () => {
    const withHeld = {
      ...state,
      player: {
        ...state.player,
        items: [
          { id: 'fury', rarity: 'rare' as const, stacks: 3 },
          { id: 'boots', rarity: 'common' as const, stacks: 1 },
        ],
      },
    };
    const hud = buildHud(withHeld, content);
    expect(hud.tomes.map((t) => [t.id, t.stacks])).toEqual([['fury', 3]]);
    expect(hud.items.map((t) => [t.id, t.stacks])).toEqual([['boots', 1]]);
  });

  it('falls back to the raw id for content it does not know', () => {
    const odd = {
      ...state,
      player: { ...state.player, items: [{ id: 'ghost', rarity: 'epic' as const, stacks: 2 }] },
    };
    expect(buildHud(odd, content).items[0]!.name).toBe('ghost');
  });

  it('clamps hpFrac into [0,1] even if hp goes odd', () => {
    const hurt = { ...state, player: { ...state.player, hp: -50 } };
    expect(buildHud(hurt, content).hpFrac).toBe(0);
    const over = { ...state, player: { ...state.player, hp: 1e9 } };
    expect(buildHud(over, content).hpFrac).toBe(1);
  });

  it('surfaces a boss health readout only when a boss is alive (FR-27 numeric bar)', () => {
    expect(buildHud(state, content).boss).toBeNull();
    const withBoss = {
      ...state,
      enemies: [
        { id: 1, kind: 'grunt', pos: { x: 0, y: 0 }, hp: 5, maxHp: 12, speed: 1, damage: 1, radius: 0.4, xp: 1, gold: 1, isBoss: false, attackCooldown: 0, stagger: 0 },
        { id: 2, kind: 'warden', pos: { x: 3, y: 0 }, hp: 450.4, maxHp: 900, speed: 1, damage: 1, radius: 1.7, xp: 1, gold: 1, isBoss: true, attackCooldown: 0, stagger: 0 },
      ],
    };
    const boss = buildHud(withBoss, content).boss;
    expect(boss).not.toBeNull();
    expect(boss!.name).toBe(content.enemies.warden!.name);
    expect(boss!.text).toBe('450 / 900');
    expect(boss!.frac).toBeCloseTo(0.50044, 4);
  });

  it('ignores a dying boss so the bar does not linger', () => {
    const dying = {
      ...state,
      enemies: [
        { id: 2, kind: 'warden', pos: { x: 3, y: 0 }, hp: 0, maxHp: 900, speed: 1, damage: 1, radius: 1.7, xp: 1, gold: 1, isBoss: true, attackCooldown: 0, stagger: 0, dyingFor: 4 },
      ],
    };
    expect(buildHud(dying, content).boss).toBeNull();
  });

  it('formats big gold and kill counters', () => {
    const rich = { ...state, kills: 1234, player: { ...state.player, gold: 25_000 } };
    const hud = buildHud(rich, content);
    expect(hud.killsText).toBe('1.2k');
    expect(hud.goldText).toBe('25k');
  });
});

describe('FR-14 timed buffs in the HUD', () => {
  const config = makeRunConfig(12);
  const base = createRun(config);

  it('is empty with no buffs', () => {
    expect(buildHud(base, content).buffs).toEqual([]);
  });

  it('counts the remaining time down in sim TICKS, not wall clock', () => {
    const state = {
      ...base,
      tick: 600,
      player: {
        ...base.player,
        buffs: [{ id: 'haste', expiresAtTick: 600 + 90, mods: [] }],
      },
    };
    const buff = buildHud(state, content).buffs[0]!;
    expect(buff.secondsLeft).toBeCloseTo(1.5, 6);
    expect(buff.text).toBe('2s');
    expect(buff.id).toBe('haste');
  });

  it('never reports negative time for an already-expired buff', () => {
    const state = {
      ...base,
      tick: 1000,
      player: { ...base.player, buffs: [{ id: 'haste', expiresAtTick: 10, mods: [] }] },
    };
    expect(buildHud(state, content).buffs[0]!.secondsLeft).toBe(0);
  });

  it('falls back to the raw id when the content bundle ships no shrines', () => {
    const state = {
      ...base,
      player: { ...base.player, buffs: [{ id: 'mystery', expiresAtTick: 60, mods: [] }] },
    };
    expect(buildHud(state, content).buffs[0]!.name).toBe('mystery');
  });

  it('surfaces queued chest rewards', () => {
    expect(buildHud(base, content).pendingChests).toBe(0);
    expect(buildHud({ ...base, queuedChestOffers: 2 }, content).pendingChests).toBe(2);
  });
});
