import { describe, expect, it } from 'vitest';
import { GameClient } from '../src/app.js';
import { drawFrame } from '../src/render/renderer.js';
import { fakeCtx } from './fake-ctx.js';

function client(w: number, h: number): GameClient {
  const c = new GameClient({ storage: null, viewport: { width: w, height: h }, seedSource: () => 7 });
  c.startRun();
  return c;
}

describe('restyled screens keep the draw contract', () => {
  for (const [w, h] of [[1280, 800], [800, 600], [360, 640]] as const) {
    it(`offer + loadout + controls + summary balanced, no blur, ${w}x${h}`, () => {
      const c = client(w, h);
      const s = c.state!;
      const items = ['fury', 'wrath', 'edge', 'hide', 'fortune', 'boots', 'spurs', 'magnet', 'lens']
        .map((id) => ({ id, rarity: 'rare' as const, stacks: 2 }));
      c.state = {
        ...s, phase: 'offer', queuedOffers: 1,
        player: { ...s.player, items },
        offer: {
          source: 'chest', openedTick: s.tick, rerollsUsed: 0,
          options: [
            { kind: 'weapon', id: 'dart', rarity: 'legendary', name: 'Dartgun', description: 'x' },
            { kind: 'tome', id: 'hide', rarity: 'epic', name: 'Rite of Hide', description: 'y' },
            { kind: 'gold', id: 'gold', rarity: 'common', name: 'Coin Purse', description: 'z', goldAmount: 40 },
          ],
        },
      };
      c.helpOpen = true;
      const { ctx, fake } = fakeCtx();
      drawFrame(ctx, c);
      expect(fake.balanced).toBe(true);
      expect(fake.shadowBlur).toBe(0);
      expect(fake.texts.join(' ')).toMatch(/CONTROLS/);
    });
  }
});
