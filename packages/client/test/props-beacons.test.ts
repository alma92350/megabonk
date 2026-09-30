import { describe, expect, it } from 'vitest';
import type { GameState } from '@megabonk/sim';
import { BEACON_INSET, BEACON_INSET_Y, beaconAlpha, beaconPlacement, drawBeacons, type Placement } from '../src/render/props/beacons.js';
import { fakeCtx } from './fake-ctx.js';

const view = { width: 1280, height: 800 };

describe('reward beacons', () => {
  it('pins off-screen targets inside the inset rectangle, pointing at them', () => {
    const out: Placement = { x: 0, y: 0, angle: 0 };
    for (const [sx, sy] of [[3000, 400], [-2000, 400], [640, -5000], [640, 9000], [4000, 3000], [-900, -900]] as const) {
      expect(beaconPlacement(sx, sy, view, BEACON_INSET, BEACON_INSET_Y, out)).toBe(true);
      expect(out.x).toBeGreaterThanOrEqual(BEACON_INSET - 1e-6);
      expect(out.x).toBeLessThanOrEqual(view.width - BEACON_INSET + 1e-6);
      expect(out.y).toBeGreaterThanOrEqual(BEACON_INSET_Y - 1e-6);
      expect(out.y).toBeLessThanOrEqual(view.height - BEACON_INSET_Y + 1e-6);
      expect(Math.cos(out.angle) * (sx - 640) + Math.sin(out.angle) * (sy - 400)).toBeGreaterThan(0);
    }
  });

  it('does not draw a beacon for something already on screen', () => {
    const out: Placement = { x: 0, y: 0, angle: 0 };
    expect(beaconPlacement(600, 380, view, BEACON_INSET, BEACON_INSET_Y, out)).toBe(false);
    // Just past the edge, its sprite is still partly visible: no beacon yet.
    expect(beaconPlacement(view.width + 30, 400, view, BEACON_INSET, BEACON_INSET_Y, out)).toBe(false);
    expect(beaconPlacement(640, 400, { width: 40, height: 40 }, BEACON_INSET, BEACON_INSET_Y, out)).toBe(false);
  });

  it('fades with distance but never below a readable floor', () => {
    let last = 1;
    for (let d = 0; d < 300; d += 5) {
      const a = beaconAlpha(d);
      expect(a).toBeLessThanOrEqual(last + 1e-9);
      expect(a).toBeGreaterThanOrEqual(0.6);
      last = a;
    }
  });

  it('draws only armed, off-screen things, balanced', () => {
    const state = {
      interactables: [
        { id: 1, kind: 'chest', pos: { x: 80, y: 0 }, used: false },
        { id: 2, kind: 'chest', pos: { x: -80, y: 0 }, used: true },
        { id: 3, kind: 'shrine', pos: { x: 0, y: 70 }, used: false, shrineId: 'forge' },
        { id: 4, kind: 'shrine', pos: { x: 0, y: 0 }, used: false, shrineId: 'forge' },
      ],
      merchant: { pos: { x: 0, y: -80 }, stock: [] },
    } as unknown as GameState;
    const { ctx, fake } = fakeCtx();
    drawBeacons(ctx, state, { x: 0, y: 0, zoom: 32 }, view, 100, false);
    // Chest + shrine + merchant: three badges, each a ring stroke plus an arrow stroke.
    expect(fake.calls.stroke).toBe(6);
    expect(fake.balanced).toBe(true);
    expect(fake.globalAlpha).toBe(1);
  });
});
