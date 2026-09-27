/**
 * Scripted policies for the balance harness.
 *
 * A policy is a pure function of the live GameState. It returns an InputFrame,
 * exactly what a human or the MCP layer would submit, so a measurement taken
 * here is a measurement of the real game and not of a special test path.
 *
 * Deliberately NOT superhuman: the kiting policy reads only positions (the same
 * thing a player sees on screen) and produces a direction. It has no knowledge
 * of spawn timings, future offers, or enemy HP.
 */

import type { GameState, InputFrame, OfferOption, Vec2 } from '@megabonk/sim';

export interface Policy {
  readonly name: string;
  /** Movement direction for a playing tick. Magnitude is irrelevant — the sim normalises. */
  move(state: GameState): Vec2;
  /** Which of the three offered options to take. */
  choose(options: readonly OfferOption[], state: GameState): number;
}

const ZERO: Vec2 = { x: 0, y: 0 };

function len(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

/**
 * Default pick order. A priority list rather than "always index 0": index 0 is a
 * measurement of the shuffle, not of the build system, and it makes every
 * balance number a function of offer RNG.
 */
export function priorityChooser(priority: readonly string[]) {
  return (options: readonly OfferOption[]): number => {
    let bestIdx = 0;
    let bestRank = Number.POSITIVE_INFINITY;
    for (let i = 0; i < options.length; i++) {
      const o = options[i]!;
      const rank = priority.indexOf(o.id);
      const effective = rank < 0 ? priority.length + (o.kind === 'gold' ? 10 : 1) : rank;
      if (effective < bestRank) {
        bestRank = effective;
        bestIdx = i;
      }
    }
    return bestIdx;
  };
}

/** A generalist pick order: survivability first, then throughput, then economy. */
export const GENERALIST_PRIORITY: readonly string[] = [
  'hide', 'bonker', 'fury', 'halo', 'gauntlet', 'edge', 'dart',
  'boots', 'spurs', 'ward', 'bell', 'magnet', 'lens', 'fortune', 'vacuum', 'wallet',
];

/**
 * The stationary policy. Exists to be *killed*: a player who never moves must
 * die, or positioning has no value and the genre's core verb is decorative.
 */
export function stationaryPolicy(priority: readonly string[] = GENERALIST_PRIORITY): Policy {
  const choose = priorityChooser(priority);
  return { name: 'stationary', move: () => ZERO, choose };
}

export interface KiteOptions {
  /** Enemies further than this are ignored, as an on-screen player would. */
  readonly threatRadius?: number;
  /** How hard to pull back toward the map centre; stops corner suicide. */
  readonly centreWeight?: number;
  /** Below this threat pressure the policy walks to the nearest XP orb instead. */
  readonly greedThreshold?: number;
  readonly priority?: readonly string[];
}

/**
 * A competent kiting policy: flee the local threat gradient, drift back to the
 * middle of the arena, and pick up loose XP when nothing is close.
 *
 * This is the reference "good player" the survival targets are written against.
 */
export function kitePolicy(opts: KiteOptions = {}): Policy {
  const threatRadius = opts.threatRadius ?? 14;
  const centreWeight = opts.centreWeight ?? 1.1;
  const greedThreshold = opts.greedThreshold ?? 0.35;
  const choose = priorityChooser(opts.priority ?? GENERALIST_PRIORITY);

  return {
    name: 'kite',
    choose,
    move(state) {
      const p = state.player.pos;
      let fx = 0;
      let fy = 0;
      let pressure = 0;

      for (const e of state.enemies) {
        if (e.hp <= 0) continue;
        const dx = p.x - e.pos.x;
        const dy = p.y - e.pos.y;
        const d = Math.hypot(dx, dy);
        if (d > threatRadius || d === 0) continue;
        // 1/d falloff: close enemies dominate, distant ones only bias the drift.
        const w = (threatRadius - d) / (threatRadius * Math.max(0.8, d));
        fx += (dx / d) * w;
        fy += (dy / d) * w;
        pressure += w;
      }

      // Centring force scales with how far out we are: harmless in the middle,
      // decisive at the wall, where being pinned is what actually kills a policy.
      const half = state.map.halfExtent;
      const out = len(p) / half;
      if (out > 0.001) {
        const k = centreWeight * out * out * 3;
        fx += (-p.x / (len(p) || 1)) * k;
        fy += (-p.y / (len(p) || 1)) * k;
      }

      // Orb greed is NOT gated on being safe. A policy that only collects when
      // nothing is nearby banks almost no XP in this genre, and a policy that
      // falls behind the level curve is measuring the level curve, not the game.
      // So the pull is always present and merely outweighed by real danger.
      let best: Vec2 | null = null;
      let bestD = Infinity;
      for (const pick of state.pickups) {
        if (pick.kind === 'heal' && state.player.hp >= state.player.stats.maxHp) continue;
        const d = Math.hypot(pick.pos.x - p.x, pick.pos.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = pick.pos;
        }
      }
      if (best && bestD > state.player.stats.pickupRadius * 0.8) {
        const greed = pressure < greedThreshold ? 1.6 : 0.55;
        fx += ((best.x - p.x) / bestD) * greed;
        fy += ((best.y - p.y) / bestD) * greed;
      }

      // Chests and unused shrines are a standing reward, and a policy that never
      // walks to one under-reports the power curve the content actually offers.
      for (const it of state.interactables) {
        if (it.used) continue;
        const d = Math.hypot(it.pos.x - p.x, it.pos.y - p.y);
        if (d > 26) continue;
        const w = pressure < greedThreshold * 2 ? 1.1 : 0.4;
        fx += ((it.pos.x - p.x) / d) * w;
        fy += ((it.pos.y - p.y) / d) * w;
      }

      if (Math.abs(fx) < 1e-9 && Math.abs(fy) < 1e-9) {
        // Nothing to run from and nothing to grab: orbit slowly so the policy is
        // never perfectly still (which would smuggle in the stationary exploit).
        const a = state.tick / 60;
        return { x: Math.cos(a), y: Math.sin(a) };
      }
      return { x: fx, y: fy };
    },
  };
}

/**
 * A naive policy: walk straight at the nearest enemy. Represents the player who
 * has not learned the genre yet, and is the lower bound of the survivable band.
 */
export function chargePolicy(priority: readonly string[] = GENERALIST_PRIORITY): Policy {
  const choose = priorityChooser(priority);
  return {
    name: 'charge',
    choose,
    move(state) {
      const p = state.player.pos;
      let best: Vec2 | null = null;
      let bestD = Infinity;
      for (const e of state.enemies) {
        if (e.hp <= 0) continue;
        const d = Math.hypot(e.pos.x - p.x, e.pos.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = e.pos;
        }
      }
      if (!best || bestD < 0.5) return ZERO;
      return { x: best.x - p.x, y: best.y - p.y };
    },
  };
}

/** Build a policy that kites but forces a named build, for build-comparison runs. */
export function buildPolicy(name: string, priority: readonly string[]): Policy {
  const base = kitePolicy({ priority });
  return { name, move: base.move, choose: base.choose };
}

export function inputFor(state: GameState, policy: Policy): InputFrame {
  if (state.phase === 'offer' && state.offer) {
    return { move: ZERO, chooseIndex: policy.choose(state.offer.options, state) };
  }
  return { move: policy.move(state) };
}
