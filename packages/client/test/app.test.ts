import { describe, expect, it } from 'vitest';
import { TICK_MS, TICKS_PER_SECOND, type GameState, type Offer } from '@megabonk/sim';
import { EMPTY_PROFILE, UNLOCKS, serialiseProfile } from '@megabonk/meta';
import { GameClient } from '../src/app.js';
import { clearAdvice, setAdvice } from '../src/advice.js';
import { PROFILE_KEY } from '../src/storage.js';
import { visibleWorldBounds } from '../src/render/projection.js';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
}

function client(storage: MemoryStorage | null = new MemoryStorage()): GameClient {
  return new GameClient({ storage, viewport: { width: 960, height: 600 }, seedSource: () => 1234 });
}

/** A real key press: browsers always send a keyup, and the tracker relies on it. */
function press(c: GameClient, code: string): void {
  c.onKey(code, true);
  c.onKey(code, false);
}

/**
 * Advance n frames, taking the first upgrade whenever an offer opens. Without
 * this a long run stalls on the offer screen, which is exactly what AC-19.2 says
 * it should do.
 */
function autoplay(c: GameClient, frames: number, frameMs = TICK_MS): void {
  for (let i = 0; i < frames; i++) {
    if (c.state?.phase === 'offer') press(c, 'Digit1');
    c.advance(frameMs);
  }
}

function offerState(state: GameState): GameState {
  const offer: Offer = {
    source: 'level',
    openedTick: state.tick,
    rerollsUsed: 0,
    options: [
      { kind: 'tome', id: 'fury', rarity: 'common', name: 'Tome of Fury', description: 'Faster.' },
      { kind: 'item', id: 'boots', rarity: 'rare', name: 'Stompers', description: 'Quicker.' },
      { kind: 'gold', id: 'gold', rarity: 'uncommon', name: 'Coin Purse', description: '+40 gold.', goldAmount: 40 },
    ],
  };
  return { ...state, phase: 'offer', offer, queuedOffers: 1 };
}

describe('client lifecycle', () => {
  it('starts in the meta hub with no sim state', () => {
    const c = client();
    expect(c.screen).toBe('hub');
    expect(c.state).toBeNull();
    expect(c.profile).toEqual(EMPTY_PROFILE);
  });

  it('offers the three unlocks plus a start entry, all keyboard reachable', () => {
    const entries = client().hubEntries();
    expect(entries).toHaveLength(UNLOCKS.length + 1);
    expect(entries[entries.length - 1]!.kind).toBe('start');
    for (const u of UNLOCKS) expect(entries.some((e) => e.id === u.id)).toBe(true);
  });

  it('navigates the hub with the keyboard and wraps', () => {
    const c = client();
    expect(c.hubIndex).toBe(0);
    press(c, 'ArrowUp');
    expect(c.hubIndex).toBe(c.hubEntries().length - 1);
    press(c, 'ArrowDown');
    expect(c.hubIndex).toBe(0);
  });

  it('starts a run from the hub', () => {
    const c = client();
    c.hubIndex = c.hubEntries().length - 1;
    press(c, 'Enter');
    c.advance(TICK_MS);
    expect(c.screen).toBe('run');
    expect(c.state).not.toBeNull();
    expect(c.state!.seed).toBe(1234);
  });

  it('refuses a purchase it cannot afford and says why', () => {
    const c = client();
    c.hubIndex = 0;
    press(c, 'Enter');
    expect(c.profile.purchased).toEqual([]);
    expect(c.notice).toMatch(/motes/i);
  });

  it('purchases an unlock and persists it', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, serialiseProfile({ ...EMPTY_PROFILE, silver: 1000 }));
    const c = client(storage);
    expect(c.profile.silver).toBe(1000);
    c.hubIndex = 0;
    press(c, 'Enter');
    expect(c.profile.purchased).toContain(UNLOCKS[0]!.id);
    expect(c.profile.silver).toBe(1000 - UNLOCKS[0]!.cost);
    expect(JSON.parse(storage.getItem(PROFILE_KEY)!).purchased).toContain(UNLOCKS[0]!.id);
  });

  it('applies purchased unlocks to the run (AC-16.2)', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, serialiseProfile({ ...EMPTY_PROFILE, silver: 1000, purchased: ['reroll'] }));
    const c = client(storage);
    c.startRun();
    expect(c.state!.player.rerolls).toBe(1);
  });

  it('works with no storage at all', () => {
    const c = client(null);
    expect(c.storageAvailable).toBe(false);
    expect(() => c.startRun()).not.toThrow();
    c.advance(TICK_MS);
    expect(c.state!.tick).toBe(1);
  });
});

describe('the run loop drives the sim on a fixed timestep', () => {
  it('advances exactly one tick per 60Hz frame over 600 frames', () => {
    const c = client();
    c.startRun();
    autoplay(c, 600);
    // One step() call per frame, and no time lost: the only ticks that do not
    // move the clock are the ones spent resolving an offer (AC-19.2).
    expect(c.totalTicks).toBe(600);
    expect(c.droppedTicks).toBe(0);
    expect(c.state!.tick).toBeGreaterThan(560);
    expect(c.state!.tick).toBeLessThanOrEqual(600);
  });

  it('never advances more than the catch-up clamp in one frame', () => {
    const c = client();
    c.startRun();
    c.advance(60_000);
    expect(c.state!.tick).toBeLessThanOrEqual(5);
  });

  it('keeps the camera inside the map bounds while the player runs at a wall', () => {
    const c = client();
    c.startRun();
    c.onKey('KeyD', true);
    c.onKey('KeyS', true);
    for (let i = 0; i < 3000; i++) c.advance(TICK_MS);
    const b = visibleWorldBounds(c.camera, c.view, 0);
    const half = c.state!.map.halfExtent;
    expect(b.maxX).toBeLessThanOrEqual(half + 1e-6);
    expect(b.maxY).toBeLessThanOrEqual(half + 1e-6);
    expect(b.minX).toBeGreaterThanOrEqual(-half - 1e-6);
  });

  it('sends held movement keys into the sim', () => {
    const c = client();
    c.startRun();
    const start = c.state!.player.pos.x;
    c.onKey('KeyD', true);
    for (let i = 0; i < 60; i++) c.advance(TICK_MS);
    expect(c.state!.player.pos.x).toBeGreaterThan(start + 1);
  });

  it('never writes interpolated positions back into sim state', () => {
    const c = client();
    c.startRun();
    c.onKey('KeyD', true);
    for (let i = 0; i < 40; i++) c.advance(7);
    const snapshot = JSON.parse(JSON.stringify(c.state));
    c.advance(1);
    expect(c.state!.player.pos).toEqual(snapshot.player.pos);
  });

  it('pauses on Escape and resumes on Escape', () => {
    const c = client();
    c.startRun();
    for (let i = 0; i < 10; i++) c.advance(TICK_MS);
    const at = c.state!.tick;
    press(c, 'Escape');
    for (let i = 0; i < 10; i++) c.advance(TICK_MS);
    expect(c.paused).toBe(true);
    expect(c.state!.tick).toBe(at);
    press(c, 'Escape');
    for (let i = 0; i < 10; i++) c.advance(TICK_MS);
    expect(c.state!.tick).toBeGreaterThan(at);
  });

  it('drops held keys on blur', () => {
    const c = client();
    c.startRun();
    c.onKey('KeyD', true);
    c.blur();
    const x = c.state!.player.pos.x;
    for (let i = 0; i < 60; i++) c.advance(TICK_MS);
    expect(c.state!.player.pos.x).toBeCloseTo(x, 6);
  });
});

describe('offer phase (FR-19 / AC-19.2)', () => {
  it('holds the tick while an offer is open', () => {
    const c = client();
    c.startRun();
    c.state = offerState(c.state!);
    const at = c.state.tick;
    for (let i = 0; i < 120; i++) c.advance(TICK_MS);
    expect(c.state.tick).toBe(at);
    expect(c.state.phase).toBe('offer');
  });

  it('resolves the offer on a number key', () => {
    const c = client();
    c.startRun();
    c.state = offerState(c.state!);
    press(c, 'Digit2');
    c.advance(TICK_MS);
    expect(c.state.phase).toBe('playing');
    expect(c.state.player.items.some((i) => i.id === 'boots')).toBe(true);
  });

  it('ignores an out-of-range choice rather than throwing', () => {
    const c = client();
    c.startRun();
    c.state = { ...offerState(c.state!), offer: { ...offerState(c.state!).offer!, options: [offerState(c.state!).offer!.options[0]!] } };
    press(c, 'Digit3');
    expect(() => c.advance(TICK_MS)).not.toThrow();
    expect(c.state.phase).toBe('offer');
  });

  it('only rerolls when the player has rerolls (FR-19)', () => {
    const c = client();
    c.startRun();
    c.state = offerState(c.state!);
    expect(c.state.player.rerolls).toBe(0);
    press(c, 'KeyR');
    c.advance(TICK_MS);
    expect(c.state.offer!.rerollsUsed).toBe(0);
    c.state = { ...c.state, player: { ...c.state.player, rerolls: 1 } };
    press(c, 'KeyR');
    c.advance(TICK_MS);
    expect(c.state.offer!.rerollsUsed).toBe(1);
    expect(c.state.player.rerolls).toBe(0);
  });

  it('applyCoPlayIntent resolves the SAME option index across two different offers (regression)', () => {
    // A live co-play session hit this: the bridge intent handler pressed a
    // digit key but never released it, so picking option index 2 twice in a
    // row across two separate offers silently no-op'd the second time (no
    // up->down edge left to fire on). applyCoPlayIntent taps instead of holds.
    const c = client();
    c.startRun();
    c.state = offerState(c.state!);
    c.applyCoPlayIntent({ control: true, chooseIndex: 2 });
    c.advance(TICK_MS);
    expect(c.state.phase).toBe('playing');
    expect(c.state.player.gold).toBeGreaterThan(0);

    c.state = offerState(c.state!);
    c.applyCoPlayIntent({ control: true, chooseIndex: 2 });
    c.advance(TICK_MS);
    expect(c.state.phase).toBe('playing');
  });
});

describe('AC-21.1 / AC-21.2 the advisor never touches the sim', () => {
  it('plays identically with and without advice', () => {
    clearAdvice();
    const a = client();
    a.startRun();
    a.onKey('KeyD', true);
    autoplay(a, 600);
    const without = JSON.stringify(a.state);

    setAdvice({ pickIndex: 2, headline: 'Take the third', rationale: 'It scales.' });
    const b = client();
    b.startRun();
    b.onKey('KeyD', true);
    autoplay(b, 600);
    expect(JSON.stringify(b.state)).toBe(without);
    clearAdvice();
  });

  it('a pending advisor does not block the upgrade screen', () => {
    setAdvice({ status: 'pending' });
    const c = client();
    c.startRun();
    c.state = offerState(c.state!);
    press(c, 'Digit1');
    c.advance(TICK_MS);
    expect(c.state.phase).toBe('playing');
    clearAdvice();
  });
});

describe('run summary (FR-20)', () => {
  function killPlayer(c: GameClient): void {
    c.state = { ...c.state!, player: { ...c.state!.player, hp: 0.0001, invulnerable: 0 },
      enemies: [{ id: 999, kind: 'tank', pos: { x: 0, y: 0 }, hp: 1e6, maxHp: 1e6, speed: 3, damage: 500, radius: 1, xp: 1, gold: 1, isBoss: false, attackCooldown: 0, stagger: 0 }] };
    for (let i = 0; i < 600 && c.screen === 'run'; i++) c.advance(TICK_MS);
  }

  it('produces a summary from the accumulated event log and banks silver', () => {
    const storage = new MemoryStorage();
    const c = client(storage);
    c.startRun();
    for (let i = 0; i < 300; i++) c.advance(TICK_MS);
    killPlayer(c);
    expect(c.screen).toBe('summary');
    expect(c.summary).not.toBeNull();
    expect(c.summary!.outcome).toBe('died');
    expect(c.summary!.seed).toBe(1234);
    expect(c.summary!.seconds).toBeGreaterThan(0);
    expect(c.profile.runsPlayed).toBe(1);
    expect(c.profile.silver).toBe(c.summary!.silverEarned);
    expect(storage.getItem(PROFILE_KEY)).toBeTruthy();
  });

  it('reports quest deltas', () => {
    const c = client();
    c.startRun();
    killPlayer(c);
    expect(Array.isArray(c.questDeltas)).toBe(true);
    for (const d of c.questDeltas) {
      expect(d.to).toBeGreaterThanOrEqual(d.from);
      expect(d.name.length).toBeGreaterThan(0);
    }
  });

  it('only banks the run once however many frames follow', () => {
    const c = client();
    c.startRun();
    killPlayer(c);
    const silver = c.profile.silver;
    const runs = c.profile.runsPlayed;
    for (let i = 0; i < 100; i++) c.advance(TICK_MS);
    expect(c.profile.silver).toBe(silver);
    expect(c.profile.runsPlayed).toBe(runs);
  });

  it('restarts on R and returns to the hub on Enter', () => {
    const c = client();
    c.startRun();
    killPlayer(c);
    press(c, 'KeyR');
    expect(c.screen).toBe('run');
    killPlayer(c);
    press(c, 'Enter');
    expect(c.screen).toBe('hub');
  });
});

describe('headless 600-frame smoke (no DOM, no canvas)', () => {
  it('advances ticks and produces a coherent camera and HUD', () => {
    const c = client();
    c.startRun();
    c.onKey('KeyW', true);
    autoplay(c, 600, 1000 / 60);
    expect(c.totalTicks).toBe(600);
    expect(c.state!.tick).toBeGreaterThan(560);
    expect(c.state!.tick / TICKS_PER_SECOND).toBeGreaterThan(9);
    const hud = c.hud()!;
    expect(hud.timeText).toMatch(/^\d+:\d\d$/);
    expect(hud.hpFrac).toBeGreaterThanOrEqual(0);
    expect(hud.hpFrac).toBeLessThanOrEqual(1);
    expect(hud.weapons.length).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(c.camera.x)).toBe(true);
    expect(Number.isFinite(c.camera.y)).toBe(true);
    expect(c.alpha).toBeGreaterThanOrEqual(0);
    expect(c.alpha).toBeLessThan(1);
    expect(c.state!.enemies.length).toBeGreaterThan(0);
    expect(c.events.length).toBeGreaterThan(0);
    expect(c.events[0]!.type).toBe('run_start');
  });
});
