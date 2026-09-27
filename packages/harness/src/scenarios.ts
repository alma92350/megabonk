/**
 * Derived run configurations for measurement.
 *
 * These exist because two of the PRD §2.3 targets cannot be measured on a normal
 * run of the shipped content:
 *
 *  - "headless full run (15 game-minutes) < 10 s" needs a run that actually
 *    reaches 54,000 ticks. With today's balance the baseline policy dies at
 *    roughly t=140 s, so timing a real run would time a two-minute run and report
 *    a flattering number.
 *  - "sim step with 2000 live entities < 8 ms p95" needs 2000 live entities, which
 *    normal waves never reach.
 *
 * Both overrides are CONTENT-level (a modified `ContentBundle` passed through
 * `RunConfig`), never sim-level: the simulation stays untouched and content-agnostic.
 */

import type { ContentBundle, EnemyDef, RunConfig } from '@megabonk/sim';

/** Zero enemy contact damage, so any policy survives to the biome duration. */
export function harmlessContent(content: ContentBundle): ContentBundle {
  const enemies: Record<string, EnemyDef> = {};
  for (const [id, def] of Object.entries(content.enemies)) {
    enemies[id] = { ...def, damage: 0 };
  }
  return { ...content, enemies };
}

/**
 * A run that always reaches the full 15 game-minutes. Used for the full-run wall
 * clock budget and for the golden entries that need to exercise late waves.
 */
export function survivableConfig(config: RunConfig): RunConfig {
  return { ...config, content: harmlessContent(config.content) };
}

/**
 * A swarm that saturates `MAX_ENTITIES` within a few hundred ticks, for the
 * 2000-entity step budget. One enemy kind only, so the measurement is not also
 * measuring wave-table composition; no bosses or merchants, so no phase changes
 * perturb the samples; harmless, so the player cannot die mid-measurement.
 */
export function swarmConfig(config: RunConfig, spawnRate = 30_000): RunConfig {
  const base = harmlessContent(config.content);
  const biome = base.biomes[config.biomeId];
  if (!biome) throw new Error(`swarmConfig: unknown biome ${config.biomeId}`);
  const enemyId = Object.keys(base.enemies).find((id) => base.enemies[id]?.isBoss !== true);
  if (!enemyId) throw new Error('swarmConfig: content has no non-boss enemy');
  return {
    ...config,
    content: {
      ...base,
      biomes: {
        ...base.biomes,
        [config.biomeId]: {
          ...biome,
          durationSeconds: 100_000,
          waves: [{ fromSeconds: 0, spawnRate, enemies: [[enemyId, 1]] }],
          bosses: [],
          merchantAtSeconds: [],
        },
      },
    },
  };
}

/** Enemies that cannot die, so a measurement window holds a fixed population. */
export function immortalContent(content: ContentBundle): ContentBundle {
  const enemies: Record<string, EnemyDef> = {};
  for (const [id, def] of Object.entries(content.enemies)) {
    enemies[id] = { ...def, damage: 0, hp: 1e12 };
  }
  return { ...content, enemies };
}

/**
 * Swarm variant for benchmarking: enemies are harmless AND unkillable, so the
 * live-entity count is stable across a measurement window instead of decaying as
 * weapons clear the ring. Weapon, spatial and contact systems all still run, so
 * the measured cost is a real tick and not a stripped-down one.
 */
export function benchSwarmConfig(config: RunConfig, spawnRate = 30_000): RunConfig {
  const swarm = swarmConfig({ ...config, content: immortalContent(config.content) }, spawnRate);
  return swarm;
}

/** The same swarm with spawning switched off, to hold a population exactly. */
export function frozenConfig(config: RunConfig): RunConfig {
  const biome = config.content.biomes[config.biomeId];
  if (!biome) throw new Error(`frozenConfig: unknown biome ${config.biomeId}`);
  return {
    ...config,
    content: {
      ...config.content,
      biomes: {
        ...config.content.biomes,
        [config.biomeId]: { ...biome, waves: [{ fromSeconds: 0, spawnRate: 0, enemies: biome.waves[0]!.enemies }] },
      },
    },
  };
}
