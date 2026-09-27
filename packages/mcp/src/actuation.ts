/**
 * FR-28: the actuation handicap.
 *
 * Actions do not reach the sim directly. They are stamped with the tick they
 * become effective (`T + actionDelayTicks`), rate-limited, and — for movement —
 * snapped to the 8 compass directions the keyboard can actually express.
 *
 * Everything is a tick count. There is no timer, no `setTimeout`, no `Date.now`
 * anywhere on this path: a wall-clock delay would make the agent path
 * non-deterministic and destroy AC-28.5.
 */

import { normalise, snapTo8 } from '@megabonk/sim';
import type { Vec2 } from '@megabonk/sim';
import type { ResolvedHandicap } from './handicap.js';
import type { Observation } from './observation.js';

export type MovementIntent =
  | { readonly kind: 'vector'; readonly x: number; readonly y: number }
  | { readonly kind: 'kite_nearest' }
  | { readonly kind: 'collect_nearest_orb' }
  | { readonly kind: 'approach_merchant' }
  | { readonly kind: 'hold' };

export const HOLD: MovementIntent = Object.freeze({ kind: 'hold' as const });

export interface ActionRejection {
  readonly code: string;
  readonly message: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export type SubmitResult =
  | { readonly ok: true; readonly appliesAtTick: number }
  | { readonly ok: false; readonly error: ActionRejection };

/**
 * Resolve a level-triggered intent into a movement vector for one tick.
 *
 * The resolution reads the AGENT'S OBSERVATION, never the live state: a semantic
 * intent must not be a back door to unfiltered perception. Under `human-parity`
 * "kite nearest" therefore kites the enemy the agent could see 200 ms ago, at a
 * position rounded to the render grid — which is what a human does.
 */
export function resolveIntentVector(
  intent: MovementIntent,
  obs: Observation,
  h: ResolvedHandicap,
): Vec2 {
  const me = obs.player.pos;
  let raw: Vec2 = { x: 0, y: 0 };

  switch (intent.kind) {
    case 'vector':
      raw = { x: intent.x, y: intent.y };
      break;
    case 'kite_nearest': {
      const threat = obs.enemies[0];
      if (threat) raw = { x: me.x - threat.pos.x, y: me.y - threat.pos.y };
      break;
    }
    case 'collect_nearest_orb': {
      const orb = obs.pickups[0];
      if (orb) raw = { x: orb.pos.x - me.x, y: orb.pos.y - me.y };
      break;
    }
    case 'approach_merchant': {
      if (obs.merchant) raw = { x: obs.merchant.pos.x - me.x, y: obs.merchant.pos.y - me.y };
      break;
    }
    case 'hold':
      break;
  }

  if (raw.x === 0 && raw.y === 0) return { x: 0, y: 0 };
  // AC-28.3: 8 directions only. A policy cannot express a 17-degree heading.
  return h.snapMovementTo8 ? snapTo8(raw) : normalise(raw);
}

interface PendingIntent {
  readonly applyAtTick: number;
  readonly intent: MovementIntent;
}

export class Actuator {
  private pending: PendingIntent[] = [];
  private active: MovementIntent = HOLD;
  private accepted: number[] = [];
  private lastPromotedTick = -1;

  constructor(private readonly h: ResolvedHandicap) {}

  /** Ticks at which an intent change was accepted, within the live rate window. */
  get acceptedTicks(): readonly number[] {
    return this.accepted;
  }

  get currentIntent(): MovementIntent {
    return this.active;
  }

  /**
   * AC-28.1: an intent submitted at tick T applies at T + actionDelayTicks.
   * AC-28.2: beyond `intentChangesPerSecond` the call is REJECTED, not queued —
   * queueing would let an agent bank a burst and spend it in one frame.
   */
  submitIntent(intent: MovementIntent, nowTick: number): SubmitResult {
    const limit = this.h.intentChangesPerSecond;
    if (limit > 0) {
      this.accepted = this.accepted.filter((t) => nowTick - t < this.h.intentWindowTicks);
      if (this.accepted.length >= limit) {
        const oldest = this.accepted[0]!;
        return {
          ok: false,
          error: {
            code: 'rate_limited',
            message: `Intent change rate exceeded: ${limit} per second. Retry from tick ${oldest + this.h.intentWindowTicks}.`,
            data: { limitPerSecond: limit, retryAtTick: oldest + this.h.intentWindowTicks },
          },
        };
      }
      this.accepted.push(nowTick);
    }
    const applyAtTick = nowTick + this.h.actionDelayTicks;
    this.pending.push({ applyAtTick, intent });
    return { ok: true, appliesAtTick: applyAtTick };
  }

  /**
   * The intent in force on the tick being produced. Level-triggered: it persists
   * until replaced, so a slow or silent agent yields stale-but-valid behaviour
   * rather than a stalled character (FR-25, AC-25.2).
   */
  activeIntentFor(producedTick: number): MovementIntent {
    if (producedTick < this.lastPromotedTick) {
      throw new Error('Actuator.activeIntentFor: ticks must be consumed in order');
    }
    this.lastPromotedTick = producedTick;
    if (this.pending.length > 0) {
      const due = this.pending.filter((p) => p.applyAtTick <= producedTick);
      if (due.length > 0) {
        this.active = due[due.length - 1]!.intent;
        this.pending = this.pending.filter((p) => p.applyAtTick > producedTick);
      }
    }
    return this.active;
  }

  moveVectorFor(producedTick: number, obs: Observation): Vec2 {
    return resolveIntentVector(this.activeIntentFor(producedTick), obs, this.h);
  }

  /** AC-28.4: a human must at least read three cards before picking. */
  offerDecisionAllowed(offerTicks: number): boolean {
    return offerTicks >= this.h.offerDecisionFloorTicks;
  }
}
