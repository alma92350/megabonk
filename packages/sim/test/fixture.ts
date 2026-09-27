/** Minimal content bundle for sim tests: small, explicit numbers, no real roster. */
import type { ContentBundle } from '../src/content-types.js';

export const fixture: ContentBundle = {
  weapons: {
    bonker: {
      id: 'bonker', name: 'Bonker', description: 'Hits the nearest thing.', kind: 'melee',
      maxLevel: 5, damage: 14, range: 3.2, cooldownTicks: 26, targets: 3, knockbackTicks: 6,
      damagePerLevel: 7, cooldownReductionPerLevel: 2, targetsPerLevel: 1,
    },
    dart: {
      id: 'dart', name: 'Dart', description: 'Pokes from afar.', kind: 'projectile',
      maxLevel: 5, damage: 7, range: 9, cooldownTicks: 22, targets: 1, knockbackTicks: 0,
      damagePerLevel: 4, cooldownReductionPerLevel: 2, targetsPerLevel: 0,
    },
  },
  tomes: {
    fury: {
      id: 'fury', name: 'Tome of Fury', description: 'Attack faster.', maxStacks: 5,
      mods: [{ stat: 'attackSpeed', kind: 'mult', value: 1.12 }],
    },
    fortune: {
      id: 'fortune', name: 'Tome of Fortune', description: 'Luckier.', maxStacks: 5,
      mods: [{ stat: 'luck', kind: 'flat', value: 2 }],
    },
  },
  items: {
    boots: {
      id: 'boots', name: 'Boots', description: 'Faster.',
      mods: [{ stat: 'moveSpeed', kind: 'flat', value: 0.6 }], grants: 'swift',
    },
    spurs: {
      id: 'spurs', name: 'Spurs', description: 'Much faster, with Boots.',
      mods: [{ stat: 'moveSpeed', kind: 'mult', value: 1.25, requires: 'swift' }],
    },
  },
  enemies: {
    grunt: { id: 'grunt', name: 'Grunt', hp: 12, damage: 4, speed: 2.2, radius: 0.45, xp: 2, gold: 1 },
    brute: { id: 'brute', name: 'Brute', hp: 40, damage: 12, speed: 1.8, radius: 0.7, xp: 6, gold: 3 },
    warden: {
      id: 'warden', name: 'Warden', hp: 600, damage: 20, speed: 1.6, radius: 1.6,
      xp: 80, gold: 60, isBoss: true,
    },
  },
  biomes: {
    testfield: {
      id: 'testfield', name: 'Testfield', halfExtent: 40, obstacleCount: 4, durationSeconds: 120,
      waves: [
        { fromSeconds: 0, spawnRate: 1.4, enemies: [['grunt', 1]] },
        { fromSeconds: 30, spawnRate: 2.6, enemies: [['grunt', 3], ['brute', 1]] },
      ],
      bosses: [{ atSeconds: 60, enemyId: 'warden' }],
      merchantAtSeconds: [45],
      palette: { ground: '#222', groundAlt: '#282828', fog: '#111', obstacle: '#444', accent: '#8f8' },
    },
  },
  characters: {
    tester: {
      id: 'tester', name: 'Tester', description: 'Baseline.', mods: [], startingWeapon: 'bonker',
    },
    bruiser: {
      id: 'bruiser', name: 'Bruiser', description: 'Tanky, slow.',
      mods: [
        { stat: 'maxHp', kind: 'mult', value: 1.5 },
        { stat: 'moveSpeed', kind: 'mult', value: 0.9 },
      ],
      startingWeapon: 'bonker',
    },
  },
};
