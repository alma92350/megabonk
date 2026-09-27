/**
 * FR-26 autonomous mode: `npm run agent:auto -- --seed=N`
 *
 * Drives a full headless run with a scripted policy and prints the `RunSummary`.
 * AC-26.1 wants a baseline policy to complete a run without error; AC-26.2 wants
 * the same seed to produce an identical summary, which is why this CLI has no
 * clock, no randomness and no I/O other than printing.
 *
 * Note on the tool surface: FR-26 describes autonomous mode as driving the run
 * "via the MCP tool surface". `packages/mcp` owns that surface and the FR-27/FR-28
 * handicap; this CLI drives the sim directly through the harness, which makes it
 * the unhandicapped reference path. It reports `agentProfile: "<policy>"` rather
 * than claiming a handicap profile it does not apply (AC-29.1 / AC-29.4).
 */

import { TICKS_PER_SECOND } from '@megabonk/sim';
import { makeRunConfig, DEFAULT_BIOME, DEFAULT_CHARACTER } from '@megabonk/content';
import { drive, FULL_RUN_TICKS } from './drive.js';
import { POLICIES, policyByName } from './policy.js';
import { hashState } from './hash.js';
import { argWarnings, boolArg, intArg, parseArgs, stringArg } from './args.js';
import { survivableConfig } from './scenarios.js';

const KNOWN = ['seed', 'ticks', 'policy', 'json', 'character', 'biome', 'survivable', 'help', 'quiet'];
const VALUE_KEYS = ['seed', 'ticks', 'policy', 'character', 'biome'];

export interface AutoOptions {
  readonly seed: number;
  readonly ticks: number;
  readonly policy: string;
  readonly json: boolean;
  readonly characterId: string;
  readonly biomeId: string;
  readonly survivable: boolean;
  readonly help: boolean;
  readonly warnings: readonly string[];
}

/** Pure: garbage in gives documented defaults out, plus a warning list. */
export function parseAutoOptions(argv: readonly string[]): AutoOptions {
  const args = parseArgs(argv, VALUE_KEYS);
  const warnings = argWarnings(args, KNOWN);

  let policy = stringArg(args, 'policy', 'baseline');
  if (!Object.prototype.hasOwnProperty.call(POLICIES, policy)) {
    warnings.push(
      `unknown policy "${policy}", falling back to "baseline" (known: ${Object.keys(POLICIES).join(', ')})`,
    );
    policy = 'baseline';
  }

  let ticks = intArg(args, 'ticks', FULL_RUN_TICKS);
  if (ticks <= 0) {
    warnings.push(`--ticks must be positive, got ${ticks}; using ${FULL_RUN_TICKS}`);
    ticks = FULL_RUN_TICKS;
  }

  // A seed must be an integer the RNG can use; anything else becomes 0 with a
  // warning rather than a NaN that would silently make the run non-reproducible.
  const rawSeed = args.values.seed;
  let seed = intArg(args, 'seed', 0);
  if (rawSeed !== undefined && !Number.isFinite(Number(rawSeed))) {
    warnings.push(`--seed "${rawSeed}" is not a number; using 0`);
    seed = 0;
  }

  return {
    seed,
    ticks,
    policy,
    json: boolArg(args, 'json'),
    characterId: stringArg(args, 'character', DEFAULT_CHARACTER),
    biomeId: stringArg(args, 'biome', DEFAULT_BIOME),
    survivable: boolArg(args, 'survivable'),
    help: boolArg(args, 'help'),
    warnings,
  };
}

export const USAGE = `megabonk autonomous run (FR-26)

  npm run agent:auto -- --seed=N [options]

  --seed=N           run seed (default 0)
  --ticks=N          sim ticks to drive (default ${FULL_RUN_TICKS} = 15 game-minutes)
  --policy=NAME      ${Object.keys(POLICIES).join(' | ')} (default baseline)
  --character=ID     character id (default ${DEFAULT_CHARACTER})
  --biome=ID         biome id (default ${DEFAULT_BIOME})
  --survivable       zero enemy contact damage: forces a full-length run
  --json             emit the summary as JSON only
  --help             this text`;

function bar(value: number, max: number, width = 24): string {
  const filled = max <= 0 ? 0 : Math.max(0, Math.min(width, Math.round((value / max) * width)))
  return `${'#'.repeat(filled)}${'.'.repeat(width - filled)}`;
}

export interface AutoResult {
  readonly exitCode: number;
  readonly lines: readonly string[];
}

/** Pure-ish core: returns the lines instead of printing, so tests can assert them. */
export function runAuto(argv: readonly string[]): AutoResult {
  const opts = parseAutoOptions(argv);
  const lines: string[] = [];
  if (opts.help) return { exitCode: 0, lines: [USAGE] };

  for (const w of opts.warnings) lines.push(`warning: ${w}`);

  const base = makeRunConfig(opts.seed, { characterId: opts.characterId, biomeId: opts.biomeId });
  let config;
  try {
    config = opts.survivable ? survivableConfig(base) : base;
  } catch (err) {
    lines.push(`error: ${(err as Error).message}`);
    return { exitCode: 1, lines };
  }

  const started = Date.now();
  let result;
  try {
    result = drive(config, {
      ticks: opts.ticks,
      policy: policyByName(opts.policy),
      agentProfile: opts.policy,
    });
  } catch (err) {
    lines.push(`error: run failed: ${(err as Error).message}`);
    return { exitCode: 1, lines };
  }
  const wallMs = Date.now() - started;
  const s = result.summary;

  if (opts.json) {
    lines.push(
      JSON.stringify(
        {
          ...s,
          policy: opts.policy,
          ticks: result.state.tick,
          stopReason: result.stopReason,
          truncated: result.truncated,
          terminalHash: hashState(result.state),
          events: result.events.length,
          liveEnemies: result.state.enemies.length,
          wallMs,
        },
        null,
        2,
      ),
    );
    return { exitCode: 0, lines };
  }

  const mins = Math.floor(s.seconds / 60);
  const secs = (s.seconds % 60).toFixed(1).padStart(4, '0');
  lines.push(
    '',
    `=== megabonk autonomous run =============================`,
    `  seed         ${s.seed}`,
    `  policy       ${opts.policy}   character ${opts.characterId}   biome ${opts.biomeId}`,
    `  outcome      ${s.outcome.toUpperCase()}${result.truncated ? ` (truncated: ${result.stopReason})` : ''}`,
    `  survived     ${mins}m ${secs}s   (${result.state.tick} ticks of ${opts.ticks})`,
    `  reached 10m  ${s.seconds >= 600 ? 'yes' : 'no'}   [PRD §2.3 autonomous completion mark]`,
    '  ------------------------------------------------------',
    `  level        ${s.level}  ${bar(s.level, 30)}`,
    `  kills        ${s.kills}`,
    `  boss kills   ${s.bossKills}`,
    `  gold earned  ${s.goldEarned}`,
    `  silver       ${s.silverEarned}`,
    `  damage taken ${s.damageTaken.toFixed(1)}`,
    `  hp at end    ${result.state.player.hp.toFixed(1)} / ${result.state.player.stats.maxHp.toFixed(1)}`,
    `  live enemies ${result.state.enemies.length}`,
    `  picks        ${s.picks.length > 0 ? s.picks.join(', ') : '(none)'}`,
    '  ------------------------------------------------------',
    `  agentProfile ${String(s.agentProfile)}`,
    `  events       ${result.events.length}`,
    `  terminalHash ${hashState(result.state)}`,
    `  wall clock   ${(wallMs / 1000).toFixed(2)} s for ${result.state.tick} ticks ` +
      `(${(result.state.tick / TICKS_PER_SECOND).toFixed(0)} game-seconds)`,
    '=========================================================',
    '',
  );
  return { exitCode: 0, lines };
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return entry.endsWith('auto.ts') || entry.endsWith('auto.js');
}

if (isMain()) {
  const { exitCode, lines } = runAuto(process.argv.slice(2));
  for (const line of lines) console.log(line);
  process.exitCode = exitCode;
}
