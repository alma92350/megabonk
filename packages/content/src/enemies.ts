import type { EnemyDef } from '@megabonk/sim';

export const enemies: Record<string, EnemyDef> = {
  grunt: { id: 'grunt', name: 'Grunt', hp: 12, damage: 4, speed: 2.2, radius: 0.45, xp: 2, gold: 1 },
  runner: { id: 'runner', name: 'Runner', hp: 8, damage: 3, speed: 3.6, radius: 0.35, xp: 2, gold: 1 },
  brute: { id: 'brute', name: 'Brute', hp: 46, damage: 10, speed: 1.7, radius: 0.75, xp: 6, gold: 3 },
  lobber: { id: 'lobber', name: 'Lobber', hp: 20, damage: 7, speed: 1.9, radius: 0.5, xp: 4, gold: 2 },
  swarmling: { id: 'swarmling', name: 'Swarmling', hp: 5, damage: 2, speed: 2.9, radius: 0.28, xp: 1, gold: 1 },
  tank: { id: 'tank', name: 'Hulk', hp: 120, damage: 14, speed: 1.3, radius: 1.0, xp: 14, gold: 8 },
  warden: {
    id: 'warden', name: 'The Warden', hp: 900, damage: 18, speed: 1.6, radius: 1.7,
    xp: 90, gold: 70, isBoss: true,
  },
};
