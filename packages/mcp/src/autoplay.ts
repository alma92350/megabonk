/**
 * An unattended autoplay policy for the co-play bridge.
 *
 * Distinct from `baselinePolicy` in two ways that matter:
 *
 *  1. It reads the RAW published GameState, not a handicapped `Observation`.
 *     There is no FR-27 perception filter and no FR-28 action delay in this
 *     path, so it plays on the equivalent of the `unrestricted` profile. Its
 *     results are NOT comparable to the parity numbers in AC-30.3 — it exists
 *     to play the game well and unattended, not to measure the handicap.
 *  2. It is screen-aware, so it can chain runs on its own rather than idling on
 *     the summary screen waiting for a human.
 *
 * The strategy is weapon-first, which came out of reading weapons.ts: the
 * dominant lever is targets x range against cooldown, not raw damage or max HP.
 * Rootclub goes 3 -> 7 targets and 28 -> 16 cooldown across its five levels and
 * Wisp Ring 2 -> 6 on the fastest cadence in the roster, and a maxed arc clears
 * the perimeter faster than enemies enter it. Stacking armour instead merely
 * buys time while being chipped down: measured head to head on one seed, an
 * HP-first build died at 7:50 with the swarm at 1200+, while weapon-first
 * passed 11:00 with the swarm collapsing from 376 to 43 once Rootclub hit 5.
 */

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export interface AutoOffer {
  readonly name: string;
}

export interface AutoStock {
  readonly name: string;
  readonly price: number;
  readonly sold: boolean;
}

/** The projection of a published GameState this policy needs. */
export interface AutoRun {
  readonly tick: number;
  readonly phase: string;
  readonly hp: number;
  readonly gold: number;
  readonly halfExtent: number;
  readonly pos: Vec;
  /** Rootclub level: the arc that holds the perimeter. */
  readonly arc: number;
  /** Wisp Ring level: the orbital that carries a swarm. */
  readonly orb: number;
  readonly rerolls: number;
  readonly enemies: readonly Vec[];
  readonly offer: readonly AutoOffer[] | null;
  readonly chests: readonly Vec[];
  readonly pickup: Vec | null;
  readonly stock: readonly AutoStock[] | null;
}

export interface AutoView {
  readonly screen: 'hub' | 'run' | 'summary' | null;
  readonly run: AutoRun | null;
}

export type AutoAction =
  | { readonly kind: 'wait'; readonly why: string }
  | { readonly kind: 'restart' }
  | { readonly kind: 'choose'; readonly index: number }
  | { readonly kind: 'reroll' }
  | { readonly kind: 'buy'; readonly index: number }
  | { readonly kind: 'move'; readonly x: number; readonly y: number };

/**
 * Card priority, by name, because the pool is small and fully known.
 *
 * Brass Bell sits third because area scales weapon RANGE — it widens a melee
 * arc's moat and doubles the Wisp Ring's radius. Dartgun sits near the bottom
 * despite being a weapon: it gains no targets per level, so it answers bosses,
 * not swarms. Rite of Fortune is deliberately absent from this table: luck only
 * reweights the RARITY of non-weapon cards, and buildOffer hardcodes weapons to
 * 'common', so it cannot make weapon levels appear more often.
 */
const CARD_PRIORITY: readonly (readonly [RegExp, number])[] = [
  [/^rootclub/i, 260],
  [/^wisp ring/i, 240],
  [/^brass bell/i, 200],
  [/^rite of fury/i, 170],
  [/^rite of wrath/i, 130],
  [/^gauntlet/i, 120],
  [/^rite of the edge/i, 110],
  [/^cracked lens/i, 100],
  [/^whetstone/i, 80],
  [/^dartgun/i, 70],
];

/** Anything at or above this widens the moat, and is worth a reroll to find. */
export const MOAT_SCORE = 200;

/**
 * Below this HP, healing outranks every weapon card. Weapons win the run, but
 * only if the build survives long enough to finish; a half-built arc at 4 HP
 * loses everything. Set low on purpose — at 70 the valve hijacked so many picks
 * that the arc never got past level 4.
 */
export const HEAL_BELOW_HP = 40;

export function scoreCard(name: string, hp: number): number {
  if (hp < HEAL_BELOW_HP && /^(field tonic|rite of hide|scrap plating)/i.test(name)) return 400;
  for (const [re, v] of CARD_PRIORITY) if (re.test(name)) return v;
  return 10;
}

export function pickOffer(options: readonly AutoOffer[], hp: number): number {
  let best = 0;
  let bestScore = -1;
  options.forEach((o, i) => {
    const s = scoreCard(o.name, hp);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  });
  return best;
}

/**
 * How close an enemy may get before we give ground.
 *
 * Only a genuinely maxed arc earns standing its ground; anything less cannot
 * hold a front and has to kite. Gating this on TOTAL weapon levels was a real
 * bug — Dartgun levels flattered the build into standing point-blank behind an
 * arc stuck at 4, and the run died at 7:50.
 */
export function fleeRadius(run: Pick<AutoRun, 'hp' | 'arc' | 'orb'>): number {
  if (run.hp < 60) return 6.5;
  if (run.arc >= 5 && run.orb >= 4) return 3;
  if (run.arc >= 4 && run.orb >= 4) return 4.5;
  return 6;
}

function normalise(x: number, y: number): { x: number; y: number } {
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m };
}

/** Where to go: away from the nearest threats, or shopping when unpressured. */
export function chooseMove(run: AutoRun): { x: number; y: number } {
  const { x: px, y: py } = run.pos;
  const near = run.enemies
    .map((e) => ({ ...e, d: Math.hypot(e.x - px, e.y - py) }))
    .sort((a, b) => a.d - b.d);

  if (near[0] !== undefined && near[0].d < fleeRadius(run)) {
    let mx = 0;
    let my = 0;
    for (const e of near.slice(0, 8)) {
      if (e.d < 0.001) continue;
      const w = 1 / (e.d * e.d + 0.1);
      mx += ((px - e.x) / e.d) * w;
      my += ((py - e.y) / e.d) * w;
    }
    // Fleeing a ring of enemies walks straight into a wall and then a corner,
    // where there is no escape vector left at all. Pull back toward the middle,
    // harder the closer the edge gets.
    const margin = run.halfExtent * 0.6;
    const dc = Math.hypot(px, py);
    if (dc > margin) {
      const pull = (dc - margin) / (run.halfExtent - margin);
      mx += (-px / dc) * pull * 5;
      my += (-py / dc) * pull * 5;
    }
    return normalise(mx, my);
  }

  // Unpressured: an unopened chest is a free extra offer, which is the cheapest
  // weapon level available, so it beats a handful of XP orbs. Orbs already
  // underfoot are still worth the two steps.
  const pickupDist = run.pickup ? Math.hypot(run.pickup.x - px, run.pickup.y - py) : Infinity;
  const chest = run.chests
    .map((c) => ({ ...c, d: Math.hypot(c.x - px, c.y - py) }))
    .sort((a, b) => a.d - b.d)[0];
  const target =
    pickupDist < 4 ? run.pickup : (chest ?? run.pickup);
  if (target) return normalise(target.x - px, target.y - py);

  const dc = Math.hypot(px, py);
  if (dc > run.halfExtent * 0.3) return normalise(-px, -py);
  return { x: 0, y: 0 };
}

/**
 * The single next action.
 *
 * Screen-aware so the loop never strands itself: the summary screen maps a
 * reroll straight onto `startRun()`, which is what lets this chain runs
 * unattended. A cold hub cannot be started from here — hub entries are the 19
 * unlocks followed by "Descend", and `chooseIndex` only reaches indices 0-2 —
 * so the first run of a session still needs a human.
 */
export function decide(view: AutoView): AutoAction {
  if (view.screen === 'summary') return { kind: 'restart' };
  if (view.screen === 'hub') return { kind: 'wait', why: 'at the hub; start a run to hand over' };

  const run = view.run;
  if (run === null) return { kind: 'wait', why: 'nothing published' };
  if (run.phase === 'ended') return { kind: 'wait', why: 'run over' };

  if (run.offer) {
    const idx = pickOffer(run.offer, run.hp);
    // Weapon levels only appear when the offer RNG cooperates (roughly three
    // weapon entries in a pool of ~19). A held reroll is better spent fishing
    // for one than settling for another flat-stat Rite.
    if (scoreCard(run.offer[idx]!.name, run.hp) < MOAT_SCORE && run.rerolls > 0) {
      return { kind: 'reroll' };
    }
    return { kind: 'choose', index: idx };
  }

  // The merchant stocks from the same pool as level-ups, so gold buys weapon
  // levels outright — the only lever when the offer RNG refuses for minutes at
  // a time. step.ts applies buyIndex with no proximity check, so there is no
  // need to walk over. Only indices 0-2 are reachable, since the client turns
  // this into a number-key press.
  if (run.stock) {
    const buy = run.stock.findIndex(
      (e, i) =>
        i < 3 && !e.sold && e.price <= run.gold && scoreCard(e.name, Infinity) >= MOAT_SCORE,
    );
    if (buy >= 0) return { kind: 'buy', index: buy };
  }

  const move = chooseMove(run);
  return { kind: 'move', ...move };
}
