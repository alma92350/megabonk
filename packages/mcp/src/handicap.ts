/**
 * FR-29: the agent parity handicap as a named profile.
 *
 * Two rules from §6.8 are load-bearing here:
 *
 *  1. Latencies are declared in MILLISECONDS for human readability and converted
 *     to integer SIM TICKS exactly once — here, at resolve time. Nothing
 *     downstream of `resolveHandicap` ever sees a millisecond again, and nothing
 *     anywhere consults a wall clock. A wall-clock delay would make the agent
 *     path non-deterministic and destroy AC-28.5.
 *  2. The handicap is a profile, not scattered constants, so the resolved
 *     parameters can be recorded verbatim in the run summary (AC-29.1). Comparing
 *     a handicapped run against an unhandicapped one otherwise silently poisons
 *     every balance conclusion.
 */

import { TICKS_PER_SECOND, ticksForMs } from '@megabonk/sim';

export type HandicapProfileName = 'human-parity' | 'unrestricted' | 'custom';

/** The human-readable declaration. Every duration is in milliseconds. */
export interface HandicapSpec {
  /** FR-27: `get_state` serves the snapshot from `currentFrame - delay`. */
  readonly observationDelayMs: number;
  /** FR-27: minimum spacing between distinct observations (30 Hz => 33.3 ms). */
  readonly observationIntervalMs: number;
  /** FR-28: an action submitted at tick T applies at T + delay. */
  readonly actionDelayMs: number;
  /** FR-28: minimum time on the offer screen before `choose_upgrade` is accepted. */
  readonly offerDecisionFloorMs: number;
  /** FR-25: autonomous-mode auto-pick timeout for an unanswered offer. */
  readonly offerTimeoutMs: number;
  /** FR-28: accepted intent changes per second. 0 = uncapped. */
  readonly intentChangesPerSecond: number;
  /** FR-27: restrict vision to the camera viewport plus a margin. */
  readonly onScreenOnly: boolean;
  /** Camera viewport in WORLD UNITS (the map's halfExtent is 60 for reference). */
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** Fraction of the viewport added as a margin on each side (0.1 = 10%). */
  readonly viewportMargin: number;
  /** FR-27: report enemy HP as one of five buckets and omit the numeric field. */
  readonly bucketEnemyHp: boolean;
  /** FR-27: quantise reported positions to this grid. 0 = exact. */
  readonly positionQuantum: number;
  /** FR-28: restrict movement to the 8 compass directions. */
  readonly snapMovementTo8: boolean;
  /** FR-27: coarse 8-sector audio hints for off-screen enemies. */
  readonly audioHints: boolean;
  /** AC-24.6 payload caps. */
  readonly maxNearbyEnemies: number;
  readonly maxNearbyPickups: number;
  readonly maxNearbyObstacles: number;
  readonly maxNearbyProjectiles: number;
  /**
   * FR-27: whether readouts a human only eyeballs — a projectile's direction of
   * travel — are given exactly. Under human-parity they are coarsened to the 8
   * compass sectors the SFX/animation layer conveys; a raw velocity vector is
   * never passed through under any profile.
   */
  readonly exactHeadings: boolean;
}

/**
 * The shipped default (AC-29.2). 200 ms / 33.3 ms / 83.3 ms / 500 ms land on
 * 12 / 2 / 5 / 30 ticks at the 60 Hz fixed timestep.
 *
 * The viewport is 40 x 24 world units — a 5:3 window centred on the player, which
 * at the client's projection is roughly one screen. With the 10% margin that is
 * +/-22 horizontally and +/-13.2 vertically, against a map halfExtent of 60: the
 * agent sees well under a fifth of the play area at any moment, as a human does.
 */
export const HUMAN_PARITY: HandicapSpec = Object.freeze({
  observationDelayMs: 200,
  observationIntervalMs: 1000 / 30,
  actionDelayMs: 1000 / 12, // 83.3 ms => 5 ticks
  offerDecisionFloorMs: 500,
  offerTimeoutMs: 30_000,
  intentChangesPerSecond: 8,
  onScreenOnly: true,
  viewportWidth: 40,
  viewportHeight: 24,
  viewportMargin: 0.1,
  bucketEnemyHp: true,
  positionQuantum: 0.25,
  snapMovementTo8: true,
  audioHints: true,
  maxNearbyEnemies: 24,
  maxNearbyPickups: 16,
  maxNearbyObstacles: 12,
  maxNearbyProjectiles: 16,
  exactHeadings: false,
});

/** Every filter off. Debugging and measuring the ceiling only — AC-29.2/29.3. */
export const UNRESTRICTED: HandicapSpec = Object.freeze({
  observationDelayMs: 0,
  observationIntervalMs: 0,
  actionDelayMs: 0,
  offerDecisionFloorMs: 0,
  offerTimeoutMs: 30_000,
  intentChangesPerSecond: 0,
  onScreenOnly: false,
  viewportWidth: Number.POSITIVE_INFINITY,
  viewportHeight: Number.POSITIVE_INFINITY,
  viewportMargin: 0,
  bucketEnemyHp: false,
  positionQuantum: 0,
  snapMovementTo8: false,
  audioHints: false,
  maxNearbyEnemies: 64,
  maxNearbyPickups: 32,
  maxNearbyObstacles: 24,
  maxNearbyProjectiles: 64,
  exactHeadings: true,
});

export const PROFILES: Readonly<Record<'human-parity' | 'unrestricted', HandicapSpec>> = Object.freeze({
  'human-parity': HUMAN_PARITY,
  unrestricted: UNRESTRICTED,
});

/** Tick-denominated parameters. This is what every other module consumes. */
export interface ResolvedHandicap {
  readonly profile: HandicapProfileName;
  readonly observationDelayTicks: number;
  /** Always >= 1: one observation per tick is the fastest possible. */
  readonly observationIntervalTicks: number;
  readonly actionDelayTicks: number;
  readonly offerDecisionFloorTicks: number;
  readonly offerTimeoutTicks: number;
  readonly intentChangesPerSecond: number;
  readonly intentWindowTicks: number;
  readonly onScreenOnly: boolean;
  readonly viewHalfWidth: number;
  readonly viewHalfHeight: number;
  readonly bucketEnemyHp: boolean;
  readonly positionQuantum: number;
  readonly snapMovementTo8: boolean;
  readonly audioHints: boolean;
  readonly maxNearbyEnemies: number;
  readonly maxNearbyPickups: number;
  readonly maxNearbyObstacles: number;
  readonly maxNearbyProjectiles: number;
  readonly exactHeadings: boolean;
  /** The declaration this was resolved from, recorded for disclosure (AC-29.1). */
  readonly declaredMs: HandicapSpec;
}

export interface HandicapRequest {
  readonly profile?: HandicapProfileName;
  readonly overrides?: Partial<HandicapSpec>;
}

export function resolveHandicap(request: HandicapRequest = {}): ResolvedHandicap {
  const named = request.profile ?? 'human-parity';
  if (named === 'custom' && !request.overrides) {
    throw new Error('resolveHandicap: profile "custom" requires overrides');
  }
  const base = named === 'unrestricted' ? UNRESTRICTED : HUMAN_PARITY;
  const hasOverrides = request.overrides !== undefined && Object.keys(request.overrides).length > 0;
  const declaredMs: HandicapSpec = Object.freeze({ ...base, ...(request.overrides ?? {}) });
  const profile: HandicapProfileName = hasOverrides ? 'custom' : named;

  return Object.freeze({
    profile,
    observationDelayTicks: ticksForMs(declaredMs.observationDelayMs),
    observationIntervalTicks: Math.max(1, ticksForMs(declaredMs.observationIntervalMs)),
    actionDelayTicks: ticksForMs(declaredMs.actionDelayMs),
    offerDecisionFloorTicks: ticksForMs(declaredMs.offerDecisionFloorMs),
    offerTimeoutTicks: ticksForMs(declaredMs.offerTimeoutMs),
    intentChangesPerSecond: declaredMs.intentChangesPerSecond,
    intentWindowTicks: TICKS_PER_SECOND,
    onScreenOnly: declaredMs.onScreenOnly,
    viewHalfWidth: (declaredMs.viewportWidth / 2) * (1 + declaredMs.viewportMargin),
    viewHalfHeight: (declaredMs.viewportHeight / 2) * (1 + declaredMs.viewportMargin),
    bucketEnemyHp: declaredMs.bucketEnemyHp,
    positionQuantum: declaredMs.positionQuantum,
    snapMovementTo8: declaredMs.snapMovementTo8,
    audioHints: declaredMs.audioHints,
    maxNearbyEnemies: declaredMs.maxNearbyEnemies,
    maxNearbyPickups: declaredMs.maxNearbyPickups,
    maxNearbyObstacles: declaredMs.maxNearbyObstacles,
    maxNearbyProjectiles: declaredMs.maxNearbyProjectiles,
    exactHeadings: declaredMs.exactHeadings,
    declaredMs,
  });
}

/**
 * AC-29.2: `unrestricted` is reachable only by naming it. There is deliberately
 * no code path from "flag missing" or "flag misspelled" to an unhandicapped agent —
 * an unknown profile name is a hard error.
 */
export function parseHandicapArgs(argv: readonly string[]): HandicapRequest {
  let profile: HandicapProfileName = 'human-parity';
  for (const arg of argv) {
    if (arg === '--unrestricted') {
      profile = 'unrestricted';
      continue;
    }
    if (!arg.startsWith('--profile=')) continue;
    const value = arg.slice('--profile='.length);
    if (value === '') continue;
    if (value !== 'human-parity' && value !== 'unrestricted') {
      throw new Error(
        `Unknown handicap profile "${value}". Valid profiles: human-parity, unrestricted.`,
      );
    }
    profile = value;
  }
  return { profile };
}

/**
 * AC-29.4: refuse to aggregate runs across profiles. Averaging a handicapped run
 * with an unhandicapped one produces a number that describes nothing.
 */
export function aggregateProfile(
  runs: readonly { readonly agentProfile: string | null }[],
): string | null {
  if (runs.length === 0) throw new Error('aggregateProfile: no runs to aggregate');
  const first = runs[0]!.agentProfile;
  for (const run of runs) {
    if (run.agentProfile !== first) {
      throw new Error(
        `Refusing to aggregate runs across handicap profiles: "${String(first)}" vs "${String(run.agentProfile)}".`,
      );
    }
  }
  return first;
}
