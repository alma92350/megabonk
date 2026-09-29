/**
 * A competent agent policy.
 *
 * The baseline policy is a pure repulsion kiter: it flees everything within
 * THREAT_RANGE and takes offer option 0. Measured in a real browser it ran for
 * nine seconds and scored ZERO kills — and that is the whole problem. Fleeing
 * perfectly means no XP, no levels, no weapon upgrades, and a death a little
 * later to a wave it never built power to answer. It was the reason the PRD's
 * "80% of runs reach 10 minutes" target went unmet.
 *
 * This one plays the actual game: hold the front of the swarm at weapon range,
 * strafe along it, step off shot lines, and pick upgrades on a priority order
 * rather than by shuffle position.
 *
 * It scores the 8 compass directions rather than summing a force vector. Force
 * summation has a specific failure this avoids: two enemies on opposite sides
 * cancel to zero and the agent stands still between them. Scoring asks "of the
 * moves I can actually make, which is least bad?", which always has an answer.
 *
 * Everything here reads ONLY the handicapped observation — delayed, viewport
 * limited, quantised, bucketed HP. No content lookups beyond weapon reach, which
 * is printed on the upgrade card a human already read.
 */

import type { Observation } from './observation.js';
import type { Policy, PolicyApi } from './policy.js';
import type { Vec2 } from '@megabonk/sim';

/** The 8 directions a keyboard can express (AC-28.3). */
const DIRECTIONS: readonly Vec2[] = Object.freeze([
  { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
  { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
]);

/** Approximate reach of the build's longest weapon. */
const WEAPON_REACH: Readonly<Record<string, number>> = Object.freeze({
  bonker: 3.2, halo: 4.5, dart: 10, whetstone: 3.2,
});

export interface TacticalTuning {
  /** Inside this distance, breaking contact dominates every other consideration. */
  readonly danger: number;
  /** Hold band as a multiple of weapon reach. */
  readonly holdFactor: number;
  /** Multiplier on the hold band once HP is low. */
  readonly caution: number;
  readonly edgeMargin: number;
  readonly lookahead: number;
  readonly escapeWeight: number;
}

/**
 * Measured over 16 seeds, full 900 s budget, human-parity handicap. This is the
 * authoritative comparison; a 7-seed sweep was used for tuning and OVERSTATED
 * the survival gain badly (it reported 513 s vs 405 s).
 *
 *              median   mean   reach-10-min   full runs won   kills   level
 *   baseline    382 s   438 s      19%             1/16         520     9.5
 *   tactical    440 s   430 s      19%             2/16        1816    16
 *
 * Read that carefully, because it is not the result the tuning sweep implied:
 * the tactical policy is far better at PLAYING (3.5x the kills, 1.7x the level)
 * and barely better at SURVIVING. The median improves 15%, the mean is a wash,
 * and the rate of reaching ten minutes is identical. It is also higher variance
 * — its worst seeds (71 s, 122 s) are worse than the baseline's worst (171 s).
 *
 * The honest conclusion: engaging converts into levels and kills but does not,
 * on this content, convert into survival. That points at late-game escalation
 * rather than at the policy, and it is why the PRD's 80%-reach-10-minutes target
 * is still unmet by both policies.
 *
 * Two findings from the tuning sweep, both the opposite of what I expected:
 *
 *  1. Backing off further makes things monotonically WORSE. danger 3.6 -> 429 s,
 *     4.4 with a wider band -> 249 s. Disengaging means no XP, so the run is lost
 *     later to a wave you never built power to answer. Fleeing is not safety.
 *  2. The low-HP caution widening HURT (501 -> 513 s with it disabled), for the
 *     same reason: a hurt player who stops killing does not recover, because
 *     healing comes from pickups that are on the field, not in the corner.
 *
 * `caution` is kept as a dial rather than deleted, because it is the obvious
 * thing to try again once healing or a defensive item changes that calculus.
 */
export const DEFAULT_TUNING: TacticalTuning = Object.freeze({
  // Contact happens at ~0.9 units and grunts close at 2.2-3.6 u/s, so a band
  // drawn at 2.7 is already inside "about to be hit". Breaking at 2.9 buys the
  // half-second that makes holding the line survivable rather than a trade.
  danger: 2.9,
  holdFactor: 1.15,
  caution: 1.0,
  edgeMargin: 10,
  lookahead: 1.15,
  escapeWeight: 16,
});

function reachOf(obs: Observation): number {
  let best = 3.2;
  for (const w of obs.player.weapons) {
    const r = WEAPON_REACH[w.id];
    if (r !== undefined && r > best) best = r;
  }
  // Hold just inside reach: at the very edge, a step back takes you out of it.
  return Math.max(2.4, best * 0.85);
}

function headingVector(heading: string): Vec2 {
  const table: Record<string, Vec2> = {
    E: { x: 1, y: 0 }, NE: { x: 1, y: 1 }, N: { x: 0, y: 1 }, NW: { x: -1, y: 1 },
    W: { x: -1, y: 0 }, SW: { x: -1, y: -1 }, S: { x: 0, y: -1 }, SE: { x: 1, y: -1 },
  };
  const v = table[heading] ?? { x: 0, y: 0 };
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

/**
 * Score every direction and return the best. Exported so the reasoning is
 * testable directly rather than only through a 15-minute run.
 */
export function scoreDirections(obs: Observation, tuning: TacticalTuning = DEFAULT_TUNING): Vec2 {
  const me = obs.player.pos;
  const reach = reachOf(obs) * tuning.holdFactor;
  const hpFrac = obs.player.maxHp > 0 ? obs.player.hp / obs.player.maxHp : 1;
  // Hurt players should behave like hurt players: widen the band and value
  // safety over contact.
  const caution = hpFrac < 0.4 ? tuning.caution : 1;

  let best: Vec2 = { x: 0, y: 0 };
  let bestScore = -Infinity;

  for (const dir of DIRECTIONS) {
    const len = Math.hypot(dir.x, dir.y) || 1;
    const nx = dir.x / len;
    const ny = dir.y / len;
    const px = me.x + nx * tuning.lookahead;
    const py = me.y + ny * tuning.lookahead;
    let score = 0;

    for (const e of obs.enemies) {
      const after = Math.hypot(px - e.pos.x, py - e.pos.y);

      if (e.dist < tuning.danger * caution) {
        // Inside contact range: getting out dominates everything else.
        score += (after - e.dist) * tuning.escapeWeight;
        continue;
      }
      if (e.isBoss) {
        // A boss is a DPS check you cannot outrun; hold reach but never hug it.
        score += (after > reach * 1.2 ? -1 : 1) * 0.8;
        continue;
      }
      // Otherwise steer toward the hold band: reward closing the gap between the
      // enemy's distance and our weapon reach, in either direction.
      const wantedError = Math.abs(e.dist - reach * caution);
      const afterError = Math.abs(after - reach * caution);
      const weight = e.dist < reach * 3 ? 1.6 : 0.35;
      score += (wantedError - afterError) * weight;
    }

    // Shots: being off the line is what matters, not raw distance.
    for (const p of obs.projectiles) {
      if (p.dist > 12) continue;
      const h = headingVector(p.heading);
      // Perpendicular distance from our future position to the shot's path.
      const relX = px - p.pos.x;
      const relY = py - p.pos.y;
      const along = relX * h.x + relY * h.y;
      if (along < 0) continue; // already behind the shot
      const perp = Math.abs(relX * h.y - relY * h.x);
      score += Math.min(perp, 4) * 3.5;
    }

    // The map edge is a worse trap than any swarm: cornered means dead.
    const edge = obs.map.halfExtent;
    const outside = Math.max(Math.abs(px), Math.abs(py)) - (edge - tuning.edgeMargin);
    if (outside > 0) score -= outside * 6;
    if (Math.abs(px) > edge - 1 || Math.abs(py) > edge - 1) score -= 100;

    // Orbs and chests, weighted well below survival.
    const orb = obs.pickups[0];
    if (orb) {
      const after = Math.hypot(px - orb.pos.x, py - orb.pos.y);
      score += (orb.dist - after) * (obs.enemies.length > 6 ? 0.5 : 2.2);
    }
    for (const it of obs.interactables) {
      if (it.used) continue;
      const after = Math.hypot(px - it.pos.x, py - it.pos.y);
      score += (it.dist - after) * 0.9;
    }

    if (score > bestScore) {
      bestScore = score;
      best = dir;
    }
  }

  return best;
}

/**
 * Upgrade priority. Ranked rather than index 0, because taking the first card is
 * a measurement of the shuffle, not of the build system.
 */
const PRIORITY: readonly string[] = Object.freeze([
  'bonker', 'halo', 'fury', 'hide', 'plating', 'edge', 'gauntlet', 'whetstone',
  'dart', 'lens', 'wrath', 'boots', 'magnet', 'fortune', 'bell', 'spurs', 'vacuum', 'wallet',
]);

const RARITY_RANK: Readonly<Record<string, number>> = Object.freeze({
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4,
});

export function chooseOption(obs: Observation): number {
  const options = obs.offer?.options ?? [];
  if (options.length === 0) return 0;
  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < options.length; i++) {
    const o = options[i]!;
    const rank = PRIORITY.indexOf(o.id);
    // Unknown ids sit mid-table rather than last: a new item is not known-bad.
    const base = rank >= 0 ? PRIORITY.length - rank : PRIORITY.length / 2;
    const rarity = RARITY_RANK[o.rarity] ?? 0;
    // Gold is the padding option and only wins when nothing else is offered.
    const score = o.kind === 'gold' ? -1 : base + rarity * 1.5;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function makeTacticalPolicy(tuning: TacticalTuning = DEFAULT_TUNING): Policy {
  return (obs, api) => runTactical(obs, api, tuning);
}

function runTactical(obs: Observation, api: PolicyApi, tuning: TacticalTuning): void {
  if (obs.phase === 'ended') return;

  if (obs.offer) {
    // Reroll a genuinely poor offer while rerolls are free to use.
    const options = obs.offer.options;
    const allGold = options.every((o) => o.kind === 'gold');
    if (allGold && obs.offer.rerollsAvailable > 0) {
      api.rerollOffer();
      return;
    }
    api.chooseUpgrade(chooseOption(obs));
    return;
  }

  const dir = scoreDirections(obs, tuning);
  if (dir.x === 0 && dir.y === 0) {
    api.setIntent({ kind: 'hold' });
    return;
  }
  api.setIntent({ kind: 'vector', x: dir.x, y: dir.y });
}

export const tacticalPolicy: Policy = makeTacticalPolicy();
