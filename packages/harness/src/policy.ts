/**
 * Scripted policies for the headless harness.
 *
 * NOTE ON DUPLICATION: `packages/mcp` is expected to own the shipped baseline
 * policy (FR-26: "always pick option 0, kite nearest enemy") behind the handicap
 * of FR-27/FR-28. At the time this file was written `packages/mcp/src` was empty,
 * so `baselinePolicy` below is a local, unhandicapped equivalent. When the MCP
 * package exports one, this should import it and delete the local copy — see the
 * harness README note.
 *
 * Every policy here is a PURE function of the state it is given. That is not a
 * stylistic preference: a policy holding mutable state of its own would make the
 * agent path non-deterministic and break AC-26.2 and the golden corpus.
 */

import type { GameState, InputFrame, Vec2 } from '@megabonk/sim';

export interface PolicyContext {
  /** Loop iteration, which is >= tick because offers pause the clock. */
  readonly iteration: number;
  readonly tick: number;
}

export type Policy = (state: GameState, ctx: PolicyContext) => InputFrame;

const HOLD: InputFrame = { move: { x: 0, y: 0 } };

function nearestEnemyDelta(state: GameState): Vec2 | null {
  let best: Vec2 | null = null;
  let bestDistSq = Infinity;
  // Iterate all enemies rather than trusting array order; ties break by the
  // lowest id, matching FR-1's tie-break so the policy cannot depend on order.
  let bestId = Infinity;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const dx = e.pos.x - state.player.pos.x;
    const dy = e.pos.y - state.player.pos.y;
    const d = dx * dx + dy * dy;
    if (d < bestDistSq || (d === bestDistSq && e.id < bestId)) {
      bestDistSq = d;
      bestId = e.id;
      best = { x: dx, y: dy };
    }
  }
  return best;
}

/** Steer back toward the origin when the map edge is close, so kiting cannot wall up. */
function avoidEdge(state: GameState, dir: Vec2): Vec2 {
  const limit = state.map.halfExtent - 6;
  const { x, y } = state.player.pos;
  if (Math.abs(x) < limit && Math.abs(y) < limit) return dir;
  const inward = { x: -x, y: -y };
  const m = Math.hypot(inward.x, inward.y) || 1;
  return { x: dir.x + (inward.x / m) * 1.5, y: dir.y + (inward.y / m) * 1.5 };
}

function unit(v: Vec2): Vec2 {
  const m = Math.hypot(v.x, v.y);
  if (!Number.isFinite(m) || m === 0) return { x: 0, y: 0 };
  return { x: v.x / m, y: v.y / m };
}

/**
 * FR-26 / AC-26.1 baseline: kite the nearest living enemy, always take offer
 * option 0. Deliberately simple — it is a regression fixture, not a good player.
 */
export const baselinePolicy: Policy = (state) => {
  if (state.phase === 'offer') return { move: { x: 0, y: 0 }, chooseIndex: 0 };
  const delta = nearestEnemyDelta(state);
  if (!delta) {
    // Nothing to run from: drift toward the origin to gather dropped pickups.
    return { move: unit({ x: -state.player.pos.x, y: -state.player.pos.y }) };
  }
  return { move: unit(avoidEdge(state, { x: -delta.x, y: -delta.y })) };
};

/** Never moves. The control case, and the cheapest way to get a long run. */
export const stationaryPolicy: Policy = (state) =>
  state.phase === 'offer' ? { move: { x: 0, y: 0 }, chooseIndex: 0 } : HOLD;

/**
 * Deterministic pseudo-random wandering. The direction is a pure hash of
 * (policySeed, tick), NOT a closure over an RNG cursor, so the same policy seed
 * replays identically no matter how many times it is constructed or reused.
 */
export function randomPolicy(policySeed: number): Policy {
  return (state, ctx) => {
    const bucket = Math.floor(ctx.tick / 20); // change heading ~3x/second
    let h = (policySeed ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ bucket, 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    if (state.phase === 'offer') {
      const n = state.offer?.options.length ?? 1;
      return { move: { x: 0, y: 0 }, chooseIndex: h % Math.max(1, n) };
    }
    const angle = (h / 0x100000000) * Math.PI * 2;
    return { move: unit(avoidEdge(state, { x: Math.cos(angle), y: Math.sin(angle) })) };
  };
}

/**
 * Baseline plus projectile avoidance. It exists purely as a measurement control:
 * the autonomous completion rate of `baseline` alone cannot distinguish "the
 * content is too hard" from "the policy ignores incoming shots", and ranged
 * enemies now fire dodgeable finite-speed projectiles. Comparing the two rates
 * separates those two causes. `baseline` stays naive on purpose — AC-26.1 defines
 * it as "kite nearest enemy, pick option 0", and quietly making it smarter would
 * hide the very signal the game designer needs.
 */
export const dodgePolicy: Policy = (state) => {
  if (state.phase === 'offer') return { move: { x: 0, y: 0 }, chooseIndex: 0 };

  let evade: Vec2 = { x: 0, y: 0 };
  for (const p of state.projectiles) {
    const dx = state.player.pos.x - p.pos.x;
    const dy = state.player.pos.y - p.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 8 || dist === 0) continue;
    // Only shots roughly heading at us matter; a projectile flying away is noise.
    const closing = (p.vel.x * -dx + p.vel.y * -dy) / (Math.hypot(p.vel.x, p.vel.y) * dist || 1);
    if (closing < 0.5) continue;
    // Strafe perpendicular to the shot: moving directly away loses the race
    // against a projectile that is faster than the player.
    const speed = Math.hypot(p.vel.x, p.vel.y) || 1;
    const perp = { x: -p.vel.y / speed, y: p.vel.x / speed };
    const sign = perp.x * dx + perp.y * dy >= 0 ? 1 : -1;
    const weight = (8 - dist) / 8;
    evade = { x: evade.x + perp.x * sign * weight * 3, y: evade.y + perp.y * sign * weight * 3 };
  }

  const delta = nearestEnemyDelta(state);
  const flee: Vec2 = delta
    ? { x: -delta.x, y: -delta.y }
    : { x: -state.player.pos.x, y: -state.player.pos.y };
  const fleeUnit = unit(flee);
  return { move: unit(avoidEdge(state, { x: fleeUnit.x + evade.x, y: fleeUnit.y + evade.y })) };
};

/** Named policies for the CLIs. Each entry takes a policy seed. */
export const POLICIES: Readonly<Record<string, (policySeed: number) => Policy>> = {
  baseline: () => baselinePolicy,
  dodge: () => dodgePolicy,
  stationary: () => stationaryPolicy,
  random: (policySeed: number) => randomPolicy(policySeed),
};

export type PolicyName = keyof typeof POLICIES;

export function isPolicyName(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(POLICIES, name);
}

export function policyByName(name: string, policySeed = 0): Policy {
  const factory = POLICIES[name];
  if (!factory) {
    throw new Error(`Unknown policy "${name}". Known policies: ${Object.keys(POLICIES).join(', ')}`);
  }
  return factory(policySeed);
}
