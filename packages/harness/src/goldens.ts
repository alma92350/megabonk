/**
 * The golden-run corpus (PRD §9 layer 3, M5 exit criterion).
 *
 * ~20 committed seeds, each with the terminal state hash and the headline summary
 * numbers of a fixed-length headless run. Any unintended change to sim logic or
 * content balance breaks them loudly; when the change is intended, the diff in
 * `goldens/corpus.json` is the review artifact.
 *
 * STALENESS: WHY THIS CORPUS SKIPS INSTEAD OF FAILING
 * --------------------------------------------------
 * A corpus pinned to today's numbers is stale the moment someone retunes a wave
 * table. Content balance and sim behaviour are both under active development by
 * other people, so a hard failure on every balance commit would train everyone to
 * ignore the corpus — exactly the risk §11 names ("golden-run tests become noisy
 * and get ignored").
 *
 * So the corpus carries two fingerprints, and the test layer asserts hard only
 * when BOTH match:
 *
 *  1. `contentFingerprint` — a structural hash of the content bundle with
 *     cosmetic keys (name/description/palette) stripped. Retuning any number,
 *     wave table, roster entry or mod list changes it. Renaming an item does not.
 *  2. `simBehaviourVersion` — the `SIM_BEHAVIOUR_VERSION` constant below, bumped
 *     by hand when `packages/sim` intentionally changes observable behaviour.
 *     There is no automatic equivalent that is honest: hashing the sim's source
 *     would fire on a comment, and hashing its output is what the corpus itself
 *     is. A human declaration is the only signal that carries intent.
 *
 * Mismatch on either → the golden tests SKIP with a message naming what changed
 * and how to regenerate. Match → they assert exact equality.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RunConfig } from '@megabonk/sim';
import { makeRunConfig } from '@megabonk/content';
import { drive } from './drive.js';
import { policyByName } from './policy.js';
import { contentFingerprint, hashState } from './hash.js';

/**
 * Bump this when `packages/sim` changes observable behaviour on purpose
 * (a new system, a changed system order, a new `GameState` field that the sim
 * writes, a fixed bug that moves numbers). Then run:
 *
 *     npx tsx packages/harness/src/goldens.ts --write
 *
 * and review the diff. Do NOT bump it for a refactor that leaves behaviour
 * identical — in that case the corpus should stay green and prove it did.
 *
 * 2: FR-14 chests/shrines/timed buffs landed; `GameState.interactables`,
 *    `queuedChestOffers`, `PlayerState.buffs` and `Offer.source` added.
 * 3: ranged enemies fire finite-speed dodgeable projectiles; `GameState.projectiles`
 *    added. (The structural hash needed no change for any of these: it recurses
 *    over whatever keys are present rather than over a list of known names.)
 */
export const SIM_BEHAVIOUR_VERSION = 3;

export const CORPUS_PATH = fileURLToPath(new URL('../goldens/corpus.json', import.meta.url));

/** 20 seeds, fixed once and never reshuffled: a moving corpus proves nothing. */
export const GOLDEN_SEEDS: readonly number[] = [
  1, 2, 3, 7, 11, 13, 42, 99, 101, 256,
  1337, 2024, 4242, 8675309, 31337, 65535, 123456, 999983, 1000003, 2147483647,
];

/**
 * Long enough to cross the first boss at t=300 s with margin (the boss spawns on
 * the tick t*60 is reached, so 18,000 exactly would be the boundary case), short
 * enough that 20 seeds regenerate in well under a minute.
 */
export const GOLDEN_TICKS = 19_800;
export const GOLDEN_POLICY = 'baseline';

export interface GoldenEntry {
  readonly seed: number;
  readonly hash: string;
  readonly ticks: number;
  readonly outcome: string;
  readonly seconds: number;
  readonly kills: number;
  readonly bossKills: number;
  readonly level: number;
  readonly goldEarned: number;
  readonly silverEarned: number;
  readonly picks: readonly string[];
  readonly events: number;
  readonly liveEnemies: number;
}

export interface GoldenCorpus {
  readonly formatVersion: 1;
  readonly contentFingerprint: string;
  readonly simBehaviourVersion: number;
  readonly policy: string;
  readonly ticks: number;
  readonly generatedAt: string;
  readonly entries: readonly GoldenEntry[];
}

export function goldenRunConfig(seed: number): RunConfig {
  return makeRunConfig(seed);
}

export function runGolden(seed: number, policyName = GOLDEN_POLICY, ticks = GOLDEN_TICKS): GoldenEntry {
  const config = goldenRunConfig(seed);
  const r = drive(config, { ticks, policy: policyByName(policyName), agentProfile: policyName });
  return {
    seed,
    hash: hashState(r.state),
    ticks: r.state.tick,
    outcome: r.summary.outcome,
    seconds: Number(r.summary.seconds.toFixed(6)),
    kills: r.summary.kills,
    bossKills: r.summary.bossKills,
    level: r.summary.level,
    goldEarned: r.summary.goldEarned,
    silverEarned: r.summary.silverEarned,
    picks: r.summary.picks,
    events: r.events.length,
    liveEnemies: r.state.enemies.length,
  };
}

export function generateCorpus(
  seeds: readonly number[] = GOLDEN_SEEDS,
  policyName = GOLDEN_POLICY,
  ticks = GOLDEN_TICKS,
): GoldenCorpus {
  return {
    formatVersion: 1,
    contentFingerprint: currentContentFingerprint(),
    simBehaviourVersion: SIM_BEHAVIOUR_VERSION,
    policy: policyName,
    ticks,
    generatedAt: new Date().toISOString(),
    entries: seeds.map((seed) => runGolden(seed, policyName, ticks)),
  };
}

export function currentContentFingerprint(): string {
  // Imported lazily-by-value: the fingerprint must reflect the bundle the run
  // actually used, so it is taken from the same `makeRunConfig` path as the runs.
  return contentFingerprint(makeRunConfig(0).content);
}

export function corpusExists(): boolean {
  return existsSync(CORPUS_PATH);
}

export function loadCorpus(): GoldenCorpus {
  const raw = readFileSync(CORPUS_PATH, 'utf8');
  const parsed = JSON.parse(raw) as GoldenCorpus;
  if (parsed.formatVersion !== 1) {
    throw new Error(`Unsupported golden corpus formatVersion ${String(parsed.formatVersion)}`);
  }
  return parsed;
}

export function writeCorpus(corpus: GoldenCorpus): void {
  writeFileSync(CORPUS_PATH, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');
}

export interface StalenessCheck {
  readonly current: boolean;
  /** Human-readable reason, ready to print in a skip message. */
  readonly reason: string;
}

export const REGENERATE_HINT =
  'Regenerate with: npx tsx packages/harness/src/goldens.ts --write  (then review the diff)';

export function checkStaleness(corpus: GoldenCorpus): StalenessCheck {
  const content = currentContentFingerprint();
  const reasons: string[] = [];
  if (corpus.contentFingerprint !== content) {
    reasons.push(
      `content fingerprint changed (corpus ${corpus.contentFingerprint}, current ${content}) — balance was retuned`,
    );
  }
  if (corpus.simBehaviourVersion !== SIM_BEHAVIOUR_VERSION) {
    reasons.push(
      `sim behaviour version changed (corpus ${corpus.simBehaviourVersion}, current ${SIM_BEHAVIOUR_VERSION})`,
    );
  }
  if (reasons.length === 0) {
    return { current: true, reason: `fingerprints match (content ${content}, sim v${SIM_BEHAVIOUR_VERSION})` };
  }
  return { current: false, reason: `${reasons.join('; ')}. ${REGENERATE_HINT}` };
}

// ---------------------------------------------------------------------------
// CLI: npx tsx packages/harness/src/goldens.ts [--write] [--seeds=1,2,3] [--ticks=N]
// ---------------------------------------------------------------------------

function isMain(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && fileURLToPath(import.meta.url) === entry;
}

export function goldensCli(argv: readonly string[], log: (s: string) => void = console.log): number {
  // Imported here rather than at module scope so importing the corpus helpers in
  // a test does not pull the CLI's argument surface in with them.
  const write = argv.includes('--write') || argv.includes('--update');
  const seedsArg = argv.find((a) => a.startsWith('--seeds='));
  const ticksArg = argv.find((a) => a.startsWith('--ticks='));
  const policyArg = argv.find((a) => a.startsWith('--policy='));

  const seeds = seedsArg
    ? seedsArg
        .slice('--seeds='.length)
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n))
    : GOLDEN_SEEDS;
  const ticks = ticksArg ? Math.trunc(Number(ticksArg.slice('--ticks='.length))) : GOLDEN_TICKS;
  const policyName = policyArg ? policyArg.slice('--policy='.length) : GOLDEN_POLICY;

  if (!write) {
    if (!corpusExists()) {
      log('No golden corpus committed yet.');
      log(REGENERATE_HINT);
      return 1;
    }
    const corpus = loadCorpus();
    const staleness = checkStaleness(corpus);
    log(`golden corpus: ${corpus.entries.length} seeds, ${corpus.ticks} ticks, policy ${corpus.policy}`);
    log(`generated at:  ${corpus.generatedAt}`);
    log(staleness.current ? `status:        CURRENT — ${staleness.reason}` : `status:        STALE — ${staleness.reason}`);
    return staleness.current ? 0 : 0; // reporting only; the vitest layer decides
  }

  const started = Date.now();
  log(`Regenerating golden corpus: ${seeds.length} seeds x ${ticks} ticks, policy ${policyName}...`);
  const corpus = generateCorpus(seeds, policyName, Number.isFinite(ticks) ? ticks : GOLDEN_TICKS);
  writeCorpus(corpus);
  log(`Wrote ${CORPUS_PATH}`);
  log(`  contentFingerprint: ${corpus.contentFingerprint}`);
  log(`  simBehaviourVersion: ${corpus.simBehaviourVersion}`);
  log(`  ${corpus.entries.length} entries in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  return 0;
}

if (isMain()) {
  process.exitCode = goldensCli(process.argv.slice(2));
}
