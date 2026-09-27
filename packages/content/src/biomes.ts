import type { BiomeDef } from '@megabonk/sim';

/**
 * v1 ships one biome. The pacing contract, per 3-minute segment:
 *
 *   0–180 s   LEARN.    Grunts and Runners only at first, 3 damage a hit against a
 *                       120 HP bar. Lobbers arrive at 60 s and teach the one lesson
 *                       that matters: you cannot hold a position.
 *  180–360 s  COMMIT.   Brutes and Stalkers. Stalkers (3.1 speed) outrun an
 *                       unbooted player, so the first real build decision —
 *                       mobility or armour — is forced here. Boss at 300 s.
 *  360–540 s  SQUEEZE.  Hulks and Seers. Spawn rate crosses 6/s while enemy HP is
 *                       up 2.0x, so a build that has not started multiplying is
 *                       now losing ground. This is where runs are lost.
 *  540–720 s  HOLD.     8/s and rising. Boss at 600 s. Survivable only with a
 *                       maxed weapon plus two multiplier lines.
 *  720–900 s  BURN.     10/s authored, ~17/s after the in-phase ramp. Pure
 *                       throughput check, final boss at 870 s.
 *
 * Spawn rates are authored monotonically non-decreasing (the validator enforces
 * it, because the sim's AC-5.1 guarantee depends on it) and `spawnRateAt` adds a
 * further +35%/minute ramp inside each phase, so escalation is smooth rather than
 * stepping every 90 seconds.
 */
export const biomes: Record<string, BiomeDef> = {
  verdant: {
    id: 'verdant', name: 'Verdant Hollow',
    halfExtent: 60,
    // Raised from 22: obstacles of height >= 2 now block enemy projectiles and
    // line of sight, so density is a combat variable. 26 gives a kiting player
    // real cover to break a Seer's sightline without walling in the arena.
    obstacleCount: 26,
    durationSeconds: 900,
    waves: [
      { fromSeconds: 0, spawnRate: 2.4, enemies: [['grunt', 6], ['runner', 3], ['lobber', 1]] },
      { fromSeconds: 60, spawnRate: 3.0, enemies: [['grunt', 6], ['runner', 3], ['swarmling', 2], ['lobber', 1]] },
      { fromSeconds: 150, spawnRate: 3.6, enemies: [['grunt', 5], ['runner', 3], ['swarmling', 3], ['lobber', 1], ['brute', 1]] },
      { fromSeconds: 270, spawnRate: 4.2, enemies: [['grunt', 4], ['runner', 3], ['swarmling', 4], ['lobber', 2], ['brute', 2], ['stalker', 1]] },
      { fromSeconds: 420, spawnRate: 4.8, enemies: [['runner', 3], ['swarmling', 5], ['lobber', 2], ['brute', 3], ['stalker', 2], ['seer', 1], ['tank', 1]] },
      { fromSeconds: 600, spawnRate: 5.8, enemies: [['runner', 3], ['swarmling', 6], ['lobber', 2], ['brute', 3], ['stalker', 3], ['seer', 2], ['tank', 2]] },
      { fromSeconds: 780, spawnRate: 6.8, enemies: [['runner', 3], ['swarmling', 7], ['brute', 4], ['stalker', 4], ['seer', 2], ['tank', 3]] },
    ],
    bosses: [
      { atSeconds: 300, enemyId: 'warden' },
      { atSeconds: 600, enemyId: 'warden' },
      { atSeconds: 870, enemyId: 'warden' },
    ],
    // Four visits, up from three: with five shrines also drawing on gold, three
    // merchants left the late-run economy with nothing to buy.
    merchantAtSeconds: [120, 330, 570, 780],
    // Chests are the pacing tool: four free offers rolled at +8 Luck, placed at
    // least 10 units from spawn, so the reward for breaking your kiting lane is a
    // rarity spike rather than raw stats. Four rather than six because each one is
    // worth a level's pick and six made the mid-game curve outrun the wave table.
    chestCount: 4,
    // Five shrines against four merchant visits: gold should be spendable roughly
    // every 100 seconds for a player who is actually collecting it.
    shrineCount: 5,
    palette: {
      ground: '#1d2a22', groundAlt: '#22322a', fog: '#0c1310',
      obstacle: '#3c5245', accent: '#8fe08a',
    },
  },
};
