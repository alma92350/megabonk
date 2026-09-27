import type { BiomeDef } from '@megabonk/sim';

/** v1 ships one biome. The shape is parameterised so adding more is authoring only. */
export const biomes: Record<string, BiomeDef> = {
  verdant: {
    id: 'verdant', name: 'Verdant Hollow',
    halfExtent: 60, obstacleCount: 22, durationSeconds: 900,
    waves: [
      { fromSeconds: 0, spawnRate: 1.4, enemies: [['grunt', 4], ['runner', 1]] },
      { fromSeconds: 90, spawnRate: 2.4, enemies: [['grunt', 4], ['runner', 2], ['brute', 1]] },
      { fromSeconds: 210, spawnRate: 3.4, enemies: [['grunt', 3], ['runner', 2], ['brute', 2], ['swarmling', 3]] },
      { fromSeconds: 360, spawnRate: 4.6, enemies: [['runner', 3], ['brute', 2], ['swarmling', 4], ['lobber', 2]] },
      { fromSeconds: 540, spawnRate: 6.0, enemies: [['brute', 3], ['swarmling', 5], ['lobber', 2], ['tank', 1]] },
      { fromSeconds: 720, spawnRate: 7.5, enemies: [['brute', 3], ['swarmling', 6], ['tank', 2], ['runner', 3]] },
    ],
    bosses: [
      { atSeconds: 300, enemyId: 'warden' },
      { atSeconds: 600, enemyId: 'warden' },
      { atSeconds: 870, enemyId: 'warden' },
    ],
    merchantAtSeconds: [120, 330, 600],
    palette: {
      ground: '#1d2a22', groundAlt: '#22322a', fog: '#0c1310',
      obstacle: '#3c5245', accent: '#8fe08a',
    },
  },
};
