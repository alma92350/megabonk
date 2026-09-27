import { describe, expect, it } from 'vitest';
import type { GameState, Offer } from '@megabonk/sim';
import { GameClient } from '../src/app.js';
import { clearAdvice, setAdvice } from '../src/advice.js';
import { drawFrame } from '../src/render/renderer.js';
import { cardMarkerFor, layoutCards, shouldShowReroll } from '../src/render/upgrade.js';
import { fakeCtx } from './fake-ctx.js';

const view = { width: 960, height: 600 };

function newClient(): GameClient {
  return new GameClient({ storage: null, viewport: view, seedSource: () => 7 });
}

function withOffer(state: GameState): GameState {
  const offer: Offer = {
    source: 'level',
    openedTick: state.tick,
    rerollsUsed: 0,
    options: [
      { kind: 'weapon', id: 'dart', rarity: 'legendary', name: 'Dartgun', description: 'Long range needle.' },
      { kind: 'tome', id: 'hide', rarity: 'epic', name: 'Tome of Hide', description: 'Tougher.' },
      { kind: 'gold', id: 'gold', rarity: 'common', name: 'Coin Purse', description: '+40 gold.', goldAmount: 40 },
    ],
  };
  return { ...state, phase: 'offer', offer, queuedOffers: 1 };
}

describe('upgrade card layout', () => {
  it('lays out three non-overlapping cards inside the viewport', () => {
    const cards = layoutCards(3, view);
    expect(cards).toHaveLength(3);
    for (const c of cards) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.width).toBeLessThanOrEqual(view.width);
      expect(c.y + c.height).toBeLessThanOrEqual(view.height);
    }
    for (let i = 1; i < cards.length; i++) {
      expect(cards[i]!.x).toBeGreaterThanOrEqual(cards[i - 1]!.x + cards[i - 1]!.width);
    }
  });

  it('is horizontally centred', () => {
    const cards = layoutCards(3, view);
    const left = cards[0]!.x;
    const right = cards[2]!.x + cards[2]!.width;
    expect(left).toBeCloseTo(view.width - right, 6);
  });

  it('copes with a narrow phone-sized viewport and with odd counts', () => {
    for (const v of [{ width: 360, height: 640 }, { width: 2560, height: 1440 }]) {
      for (const n of [1, 2, 3, 4]) {
        const cards = layoutCards(n, v);
        expect(cards).toHaveLength(n);
        for (const c of cards) {
          expect(c.width).toBeGreaterThan(0);
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.x + c.width).toBeLessThanOrEqual(v.width + 1e-6);
        }
      }
    }
  });

  it('returns nothing for zero cards', () => {
    expect(layoutCards(0, view)).toEqual([]);
  });

  it('shows the reroll affordance only when rerolls remain', () => {
    expect(shouldShowReroll(0)).toBe(false);
    expect(shouldShowReroll(1)).toBe(true);
    expect(shouldShowReroll(-1)).toBe(false);
  });

  it('marks only the advised card, and no card when there is no advice', () => {
    expect(cardMarkerFor(1, null)).toBe(false);
    expect(cardMarkerFor(1, { pickIndex: 1, headline: 'x', rationale: 'y', status: 'ready' })).toBe(true);
    expect(cardMarkerFor(0, { pickIndex: 1, headline: 'x', rationale: 'y', status: 'ready' })).toBe(false);
    expect(cardMarkerFor(0, { pickIndex: null, headline: 'x', rationale: 'y', status: 'pending' })).toBe(false);
  });
});

describe('drawFrame against a fake 2D context', () => {
  it('draws the hub without throwing and balances save/restore', () => {
    const { ctx, fake } = fakeCtx();
    const c = newClient();
    drawFrame(ctx, c);
    expect(fake.balanced).toBe(true);
    expect(fake.calls.fillRect).toBeGreaterThan(0);
    expect(fake.texts.join(' ')).toMatch(/silver/i);
  });

  it('draws a live run with entities', () => {
    const { ctx, fake } = fakeCtx();
    const c = newClient();
    c.startRun();
    for (let i = 0; i < 600; i++) c.advance(1000 / 60);
    drawFrame(ctx, c);
    expect(fake.balanced).toBe(true);
    expect(c.state!.enemies.length).toBeGreaterThan(0);
    expect(fake.calls.fill).toBeGreaterThan(c.state!.enemies.length);
    expect(fake.texts.join(' ')).toMatch(/\d+:\d\d/);
  });

  it('never sets a per-entity shadow blur (performance guard)', () => {
    const { ctx, fake } = fakeCtx();
    const c = newClient();
    c.startRun();
    for (let i = 0; i < 600; i++) c.advance(1000 / 60);
    drawFrame(ctx, c);
    expect(fake.shadowBlur).toBe(0);
  });

  it('draws the upgrade screen with rarity label text for every card (AC-19.1)', () => {
    const { ctx, fake } = fakeCtx();
    const c = newClient();
    c.startRun();
    c.state = withOffer(c.state!);
    drawFrame(ctx, c);
    const text = fake.texts.join(' ');
    expect(text).toMatch(/LEGENDARY/);
    expect(text).toMatch(/EPIC/);
    expect(text).toMatch(/COMMON/);
    expect(fake.balanced).toBe(true);
  });

  it('AC-21.1: renders no advisor overlay when no advice is set', () => {
    clearAdvice();
    const { ctx, fake } = fakeCtx();
    const c = newClient();
    c.startRun();
    c.state = withOffer(c.state!);
    drawFrame(ctx, c);
    expect(fake.texts.join(' ')).not.toMatch(/ADVISOR/i);
  });

  it('renders the advisor overlay once advice arrives', () => {
    setAdvice({ pickIndex: 0, headline: 'Take the Dartgun', rationale: 'Ranged damage is your gap.' });
    const { ctx, fake } = fakeCtx();
    const c = newClient();
    c.startRun();
    c.state = withOffer(c.state!);
    drawFrame(ctx, c);
    const text = fake.texts.join(' ');
    expect(text).toMatch(/ADVISOR/i);
    expect(text).toMatch(/Dartgun/);
    clearAdvice();
  });

  it('renders a pending advisor without blocking (AC-21.2)', () => {
    setAdvice({ status: 'pending' });
    const { ctx, fake } = fakeCtx();
    const c = newClient();
    c.startRun();
    c.state = withOffer(c.state!);
    expect(() => drawFrame(ctx, c)).not.toThrow();
    expect(fake.texts.join(' ')).toMatch(/ADVISOR/i);
    clearAdvice();
  });

  it('draws the pause and summary screens', () => {
    const c = newClient();
    c.startRun();
    c.onKey('Escape', true);
    c.onKey('Escape', false);
    c.advance(1000 / 60);
    const paused = fakeCtx();
    drawFrame(paused.ctx, c);
    expect(paused.fake.texts.join(' ')).toMatch(/paused/i);

    c.state = { ...c.state!, phase: 'ended', outcome: 'died' };
    c.advance(1000 / 60);
    c.onKey('Escape', true);
    c.onKey('Escape', false);
    c.advance(1000 / 60);
    expect(c.screen).toBe('summary');
    const done = fakeCtx();
    drawFrame(done.ctx, c);
    expect(done.fake.texts.join(' ')).toMatch(/silver/i);
    expect(done.fake.balanced).toBe(true);
  });

  it('survives a degenerate viewport', () => {
    const c = new GameClient({ storage: null, viewport: { width: 0, height: 0 }, seedSource: () => 1 });
    c.startRun();
    const { ctx } = fakeCtx();
    expect(() => drawFrame(ctx, c)).not.toThrow();
  });

  it('damps motion when prefers-reduced-motion is set', () => {
    const loud = new GameClient({ storage: null, viewport: view, seedSource: () => 1, reduceMotion: false });
    const calm = new GameClient({ storage: null, viewport: view, seedSource: () => 1, reduceMotion: true });
    for (const c of [loud, calm]) {
      c.startRun();
      c.shake(1);
    }
    expect(calm.fx.shake).toBeLessThan(loud.fx.shake);
  });
});

describe('projectiles and interactables are drawn, not dotted in', () => {
  it('draws a tracer for every visible enemy projectile', () => {
    const bare = fakeCtx();
    const c = newClient();
    c.startRun();
    drawFrame(bare.ctx, c);
    const strokesWithoutShots = bare.fake.calls.stroke ?? 0;

    c.state = {
      ...c.state!,
      projectiles: [
        { id: 1, pos: { x: 1, y: 1 }, vel: { x: 6, y: 0 }, damage: 5, radius: 0.25, ttl: 60 },
        { id: 2, pos: { x: -2, y: 2 }, vel: { x: 0, y: -6 }, damage: 5, radius: 0.25, ttl: 60 },
      ],
    };
    const shots = fakeCtx();
    drawFrame(shots.ctx, c);
    // Two strokes per tracer (trail + core), so the count must rise by at least 4.
    expect((shots.fake.calls.stroke ?? 0)).toBeGreaterThanOrEqual(strokesWithoutShots + 4);
    expect(shots.fake.balanced).toBe(true);
  });

  it('culls projectiles that are off screen', () => {
    const c = newClient();
    c.startRun();
    c.state = {
      ...c.state!,
      projectiles: [
        { id: 1, pos: { x: 500, y: 500 }, vel: { x: 1, y: 1 }, damage: 5, radius: 0.25, ttl: 60 },
      ],
    };
    const { ctx } = fakeCtx();
    expect(() => drawFrame(ctx, c)).not.toThrow();
  });

  it('draws chests and shrines, used and unused, without throwing', () => {
    const c = newClient();
    c.startRun();
    c.state = {
      ...c.state!,
      interactables: [
        { id: 1, kind: 'chest', pos: { x: 1, y: 1 }, used: false },
        { id: 2, kind: 'chest', pos: { x: 2, y: 1 }, used: true },
        { id: 3, kind: 'shrine', pos: { x: -1, y: 2 }, used: false, shrineId: 'haste' },
        { id: 4, kind: 'shrine', pos: { x: -2, y: 2 }, used: true, shrineId: 'haste' },
      ],
    };
    const { ctx, fake } = fakeCtx();
    drawFrame(ctx, c);
    expect(fake.balanced).toBe(true);
    expect(fake.calls.fill).toBeGreaterThan(0);
  });

  it('shows buff time remaining in the HUD', () => {
    const c = newClient();
    c.startRun();
    c.state = {
      ...c.state!,
      tick: 120,
      player: { ...c.state!.player, buffs: [{ id: 'haste', expiresAtTick: 300, mods: [] }] },
    };
    const { ctx, fake } = fakeCtx();
    drawFrame(ctx, c);
    expect(fake.texts.join(' ')).toMatch(/3s/);
  });

  it('marks a chest offer as a reward rather than a level-up', () => {
    const c = newClient();
    c.startRun();
    const level = withOffer(c.state!);
    c.state = { ...level, offer: { ...level.offer!, source: 'chest' } };
    const { ctx, fake } = fakeCtx();
    drawFrame(ctx, c);
    const text = fake.texts.join(' ');
    expect(text).toMatch(/CHEST/i);
    expect(text).not.toMatch(/LEVEL UP/);
  });
});
