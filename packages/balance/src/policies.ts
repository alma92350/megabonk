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
import { enemies as ENEMIES, weapons as WEAPONS } from '@megabonk/content';

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

/**
 * A generalist pick order: survivability first, then the weapon, then multipliers.
 *
 * Armour leads deliberately, and this was measured, not assumed. Armour is FLAT
 * reduction with a 1-damage floor, so five Hide stacks (10 armour) reduce a Grunt,
 * Runner or Swarmling hit to the floor and leave only Brutes, Hulks, Seers and
 * bosses as real threats. Leading with weapon levels instead dropped the reference
 * cohort's median run from 308 s to 185 s. Since a tome appears in roughly one
 * offer in six, "Hide first" still interleaves weapon levels naturally — it is a
 * tiebreak, not a monopoly.
 */
export const GENERALIST_PRIORITY: readonly string[] = [
  'hide', 'bonker', 'fury', 'halo', 'wrath', 'plating', 'gauntlet', 'edge',
  'tonic', 'bell', 'boots', 'lens', 'spurs', 'whetstone', 'magnet', 'dart',
  'fortune', 'vacuum', 'wallet',
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
  /** Closer than this and the policy breaks contact at any cost. */
  readonly minDistance?: number;
  /**
   * The distance the policy tries to HOLD from the nearest enemy, capped by the
   * player's own weapon reach.
   *
   * This is the whole policy. A "flee everything" policy is not a competent
   * player: at 5.0 move speed against a 2.3 u/s grunt it simply outruns the game
   * and kills nothing — measured at level 5 with 113 kills by 300 s, which tells
   * you about the policy and nothing about the content. A competent player holds
   * the front of the swarm at weapon range and strafes along it, which is what
   * this does: approach when too far, break away when too close, orbit in between.
   */
  readonly holdDistance?: number;
  /** How hard to pull back toward the map centre; stops corner suicide. */
  readonly centreWeight?: number;
  /** Below this threat pressure the policy prioritises pickups and chests. */
  readonly greedThreshold?: number;
  readonly priority?: readonly string[];
}

/**
 * Longest reach the current build actually has, for the hold band.
 *
 * Read from the content table, which is information a player has (it is printed
 * on the card) and the sim's own `area` stat, which is on the HUD.
 */
function weaponReach(state: GameState): number {
  let best = 0;
  for (const w of state.player.weapons) {
    const r = WEAPONS[w.id]?.range;
    if (r !== undefined && r > best) best = r;
  }
  return best * state.player.stats.area;
}

/**
 * A competent kiting policy: hold the front of the swarm at weapon range, strafe
 * along it, dodge projectiles laterally, collect XP, and detour for chests.
 *
 * This is the reference "good player" every survival target is written against.
 * It reads only positions and its own build — the same information a human has on
 * screen — and never enemy HP, spawn timings or future offers.
 */
export function kitePolicy(opts: KiteOptions = {}): Policy {
  const minDistance = opts.minDistance ?? 1.4;
  const centreWeight = opts.centreWeight ?? 1.1;
  const greedThreshold = opts.greedThreshold ?? 1.0;
  const choose = priorityChooser(opts.priority ?? GENERALIST_PRIORITY);
  const huntRanged = opts.huntRanged !== false;

  return {
    name: 'kite',
    choose,
    move(state) {
      const p = state.player.pos;
      let nearest: Vec2 | null = null;
      let dn = Infinity;
      let crowd = 0;
      // Least-crowded escape direction, inverse-square weighted over everything
      // in a 9-unit bubble. Steering by the nearest enemy alone gets a player
      // surrounded, which is how a kiting policy actually dies.
      let ex = 0;
      let ey = 0;
      for (const e of state.enemies) {
        if (e.hp <= 0) continue;
        const dx = p.x - e.pos.x;
        const dy = p.y - e.pos.y;
        const d = Math.hypot(dx, dy);
        if (d === 0) continue;
        if (d < dn) {
          dn = d;
          nearest = e.pos;
        }
        if (d > 9) continue;
        crowd++;
        const w = 1 / (d * d);
        ex += (dx / d) * w;
        ey += (dy / d) * w;
      }
      const el = Math.hypot(ex, ey);
      if (el > 0) {
        ex /= el;
        ey /= el;
      }

      let fx = 0;
      let fy = 0;
      let pressure = 0;

      if (nearest && dn > 0) {
        const ax = (p.x - nearest.x) / dn;
        const ay = (p.y - nearest.y) / dn;
        // Strafe direction commits for 4 seconds at a time, so the policy carves
        // an arc instead of jittering on the spot.
        const side = Math.floor(state.tick / 240) % 2 === 0 ? 1 : -1;
        const tx = -ay * side;
        const ty = ax * side;
        // Hold AT weapon reach, not inside it. Measured: holding at 0.9x reach
        // starved the arc of targets (2 kills/s against a 3.3/s spawn rate, so
        // enemies accumulated until projectiles finished the run), while contact
        // damage is near-free because the 30-tick invulnerability caps incoming at
        // two hits per second regardless of how many bodies are touching. In this
        // sim the correct play is to hug the swarm, so the policy hugs the swarm.
        const reach = opts.holdDistance ?? weaponReach(state);
        const hold = Math.max(minDistance + 0.4, reach);

        if (dn < minDistance) {
          // Too close: leave, along the least-crowded direction.
          fx += ex * 2.5 + tx * 0.9;
          fy += ey * 2.5 + ty * 0.9;
          pressure += 4;
        } else if (dn > hold + 1.5) {
          fx += -ax * 1.2;
          fy += -ay * 1.2;
        } else {
          // In the band: strafe along the front, leaning out of the crowd.
          fx += tx * 1.2 + ex * 1.0;
          fy += ty * 1.2 + ey * 1.0;
          pressure += 1 + crowd * 0.05;
        }
      }

      // Ranged enemies hold a standoff outside a melee arc, so they have to be
      // deliberately walked down or they accumulate and out-damage everything else.
      // Which enemies shoot is observable — a player watches them do it — so the
      // policy is allowed to know it.
      if (huntRanged) {
        let rx = 0;
        let ry = 0;
        let found = 0;
        for (const e of state.enemies) {
          if (e.hp <= 0 || ENEMIES[e.kind]?.ranged === undefined) continue;
          const d = Math.hypot(e.pos.x - p.x, e.pos.y - p.y);
          if (d > 16 || d < 1.5) continue;
          rx += (e.pos.x - p.x) / d;
          ry += (e.pos.y - p.y) / d;
          found++;
        }
        if (found > 0) {
          const w = 1.5;
          fx += (rx / found) * w;
          fy += (ry / found) * w;
        }
      }

      // Incoming projectiles are dodged laterally, not by backing up — backing up
      // keeps you on the line of fire. This is the behaviour ranged enemies were
      // added to demand, so the reference policy has to actually exhibit it.
      for (const pr of state.projectiles) {
        const dx = p.x - pr.pos.x;
        const dy = p.y - pr.pos.y;
        const d = Math.hypot(dx, dy);
        if (d > 7 || d === 0) continue;
        if (-dx * pr.vel.x - dy * pr.vel.y <= 0) continue; // already past us
        const vl = Math.hypot(pr.vel.x, pr.vel.y) || 1;
        const px = -pr.vel.y / vl;
        const py = pr.vel.x / vl;
        const side = px * dx + py * dy >= 0 ? 1 : -1;
        const w = ((7 - d) / 7) * 2.5;
        fx += px * side * w;
        fy += py * side * w;
        pressure += w;
      }

      // Centring force scales with how far out we are: harmless in the middle,
      // decisive at the wall, where being pinned is what actually kills a policy.
      const half = state.map.halfExtent;
      const l = len(p);
      const out = l / half;
      if (out > 0.4 && l > 0) {
        const k = centreWeight * out * out * 4;
        fx += (-p.x / l) * k;
        fy += (-p.y / l) * k;
      }

      // Orb greed is NOT gated on being safe: a policy that only collects when
      // nothing is nearby banks almost no XP in this genre, and a policy that
      // falls behind the level curve is measuring the level curve, not the game.
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
        const greed = pressure < greedThreshold ? 1.4 : 0.5;
        fx += ((best.x - p.x) / bestD) * greed;
        fy += ((best.y - p.y) / bestD) * greed;
      }

      // Chests and unused shrines are a standing reward, and a policy that never
      // walks to one under-reports the power curve the content actually offers.
      for (const it of state.interactables) {
        if (it.used) continue;
        const d = Math.hypot(it.pos.x - p.x, it.pos.y - p.y);
        if (d > 24 || d === 0) continue;
        const w = pressure < greedThreshold * 1.5 ? 1.2 : 0.35;
        fx += ((it.pos.x - p.x) / d) * w;
        fy += ((it.pos.y - p.y) / d) * w;
      }

      if (Math.abs(fx) < 1e-9 && Math.abs(fy) < 1e-9) {
        // Nothing to hold off and nothing to grab: orbit slowly so the policy is
        // never perfectly still (which would smuggle in the stationary exploit).
        const a = state.tick / 60;
        return { x: Math.cos(a), y: Math.sin(a) };
      }
      return { x: fx, y: fy };
    },
  };
}

/**
 * The novice: wanders on a slowly-turning heading and never reacts to an enemy.
 * This is the policy the "forgiving first minute" target is written against —
 * it represents a player who has not yet learned to look at the screen, and it
 * must survive the opening minute. Deterministic (a tick-driven heading), so it
 * is a repeatable measurement rather than a random walk.
 */
export function wanderPolicy(priority: readonly string[] = GENERALIST_PRIORITY): Policy {
  const choose = priorityChooser(priority);
  return {
    name: 'wander',
    choose,
    move(state) {
      const t = state.tick / 60;
      const a = Math.sin(t * 0.21) * 3.1 + Math.cos(t * 0.07) * 2.2;
      const p = state.player.pos;
      const half = state.map.halfExtent;
      let dx = Math.cos(a);
      let dy = Math.sin(a);
      // Even a novice does not walk into the wall for ever.
      if (Math.abs(p.x) > half * 0.8) dx = -Math.sign(p.x);
      if (Math.abs(p.y) > half * 0.8) dy = -Math.sign(p.y);
      return { x: dx, y: dy };
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
