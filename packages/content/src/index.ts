/**
 * The v1 content roster.
 *
 * This module is the ONLY place balance numbers live. packages/sim never imports
 * it — content arrives as data through RunConfig — so retuning the game is a
 * change here plus a golden-run review, never a change to simulation code.
 *
 * Export shape is a contract the client, MCP server and harness all depend on:
 *   content            the full bundle
 *   DEFAULT_CHARACTER  / DEFAULT_BIOME
 *   makeRunConfig()    the canonical way to start a run
 */

import type { ContentBundle, MetaUnlocks, RunConfig } from '@megabonk/sim';
import { weapons } from './weapons.js';
import { tomes } from './tomes.js';
import { items } from './items.js';
import { shrines } from './shrines.js';
import { enemies } from './enemies.js';
import { biomes } from './biomes.js';
import { characters } from './characters.js';

export const content: ContentBundle = { weapons, tomes, items, enemies, biomes, characters, shrines };

export const DEFAULT_CHARACTER = 'bonker';
export const DEFAULT_BIOME = 'verdant';

export interface RunOptions {
  readonly characterId?: string;
  readonly biomeId?: string;
  readonly unlocks?: MetaUnlocks;
  readonly difficulty?: number;
}

export function makeRunConfig(seed: number, opts: RunOptions = {}): RunConfig {
  return {
    seed,
    characterId: opts.characterId ?? DEFAULT_CHARACTER,
    biomeId: opts.biomeId ?? DEFAULT_BIOME,
    content,
    ...(opts.unlocks ? { unlocks: opts.unlocks } : {}),
    ...(opts.difficulty !== undefined ? { difficulty: opts.difficulty } : {}),
  };
}

export { weapons, tomes, items, shrines, enemies, biomes, characters };
export * from './schema.js';
