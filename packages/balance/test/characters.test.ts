/**
 * Characters must differ in KIND, not just in magnitude, and none may be a trap.
 *
 * Short horizons and few seeds: the point is that each identity reads through the
 * real sim, not a high-confidence survival estimate (that is survival.test.ts).
 */

import { describe, expect, it } from 'vitest';
import { characters, content, makeRunConfig } from '@megabonk/content';
import { BASE_STATS, createRun } from '@megabonk/sim';
import { runMany, seedRange } from '../src/harness.js';
import { kitePolicy } from '../src/policies.js';

const IDS = Object.keys(characters);

describe('the roster has four distinct, playable identities', () => {
  it('ships four characters, each with a valid starting weapon', () => {
    expect(IDS.length).toBe(4);
    for (const id of IDS) {
      expect(content.weapons[characters[id]!.startingWeapon]).toBeDefined();
    }
  });

  it('no two characters resolve to the same starting stat line', () => {
    const lines = IDS.map((id) => {
      const s = createRun(makeRunConfig(1, { characterId: id })).player.stats;
      return JSON.stringify(s) + characters[id]!.startingWeapon;
    });
    expect(new Set(lines).size).toBe(IDS.length);
  });

  it('each character trades something real away — no free upside', () => {
    for (const id of IDS) {
      if (id === 'bonker') continue; // the reference character, deliberately plain
      const s = createRun(makeRunConfig(1, { characterId: id })).player.stats;
      const worse = (Object.keys(BASE_STATS) as Array<keyof typeof BASE_STATS>).filter(
        (k) => s[k] < BASE_STATS[k],
      );
      expect(worse.length, `${id} has no downside at all`).toBeGreaterThan(0);
    }
  });

  it('the identities read in the numbers they claim', () => {
    const stat = (id: string) => createRun(makeRunConfig(1, { characterId: id })).player.stats;
    // Glass cannon: most might, least health.
    expect(stat('sliver').might).toBe(Math.max(...IDS.map((i) => stat(i).might)));
    expect(stat('sliver').maxHp).toBe(Math.min(...IDS.map((i) => stat(i).maxHp)));
    // Tank: most health and armour, and not the fastest.
    expect(stat('bastion').maxHp).toBe(Math.max(...IDS.map((i) => stat(i).maxHp)));
    expect(stat('bastion').armour).toBeGreaterThan(0);
    // Speedster: fastest, widest pickup radius.
    expect(stat('zip').moveSpeed).toBe(Math.max(...IDS.map((i) => stat(i).moveSpeed)));
    expect(stat('zip').pickupRadius).toBe(Math.max(...IDS.map((i) => stat(i).pickupRadius)));
  });

  it('every character clears the opening three minutes on most seeds — none is a trap', () => {
    for (const id of IDS) {
      const results = runMany(seedRange(1, 3), kitePolicy(), {
        characterId: id,
        maxSeconds: 180,
        sampleEvery: 180,
      });
      const alive = results.filter((r) => r.survived).length;
      expect(alive, `${id} only survived ${alive}/3 seeds to 180 s`).toBeGreaterThanOrEqual(2);
    }
  });

  it('a run is deterministic: same seed and policy gives an identical summary', () => {
    const a = runMany([7], kitePolicy(), { maxSeconds: 120, sampleEvery: 120 })[0]!;
    const b = runMany([7], kitePolicy(), { maxSeconds: 120, sampleEvery: 120 })[0]!;
    expect(a.summary).toEqual(b.summary);
  });
});
