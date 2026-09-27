/**
 * FR-26: the scripted baseline policy, and the driver that runs it.
 *
 * It exists for three jobs at once: the autonomous-mode default, the integration
 * test driver, and the fixed reference point that makes the handicap measurable
 * (AC-30.2, AC-30.3). It reads nothing but the observation it is handed, so it is
 * as blind as the handicap makes it.
 */

import type { McpSession } from './session.js';
import { SessionError } from './session.js';
import type { AgentRunSummary } from './session.js';
import type { Observation } from './observation.js';
import type { MovementIntent } from './actuation.js';

export interface PolicyApi {
  setIntent(intent: MovementIntent): void;
  chooseUpgrade(index: number): void;
  rerollOffer(): void;
  buy(index: number): void;
}

export type Policy = (observation: Observation, api: PolicyApi) => void;

const THREAT_RANGE = 9;
const PROJECTILE_RANGE = 7;
const ORB_RANGE = 22;

/** Kite the nearest enemies, dodge shots, hoover up orbs, always take option 0. */
export const baselinePolicy: Policy = (obs, api) => {
  if (obs.phase === 'ended') return;
  if (obs.offer) {
    api.chooseUpgrade(0);
    return;
  }

  const me = obs.player.pos;
  let fx = 0;
  let fy = 0;

  for (const e of obs.enemies) {
    if (e.dist > THREAT_RANGE) break; // nearest-first, so the rest are further
    const d = Math.max(0.4, e.dist);
    const w = (THREAT_RANGE - e.dist) / THREAT_RANGE / d;
    fx += ((me.x - e.pos.x) / d) * w;
    fy += ((me.y - e.pos.y) / d) * w;
  }

  // Shots are dodgeable by design: step off their line rather than outrun them.
  for (const p of obs.projectiles) {
    if (p.dist > PROJECTILE_RANGE) break;
    const d = Math.max(0.4, p.dist);
    fx += ((me.x - p.pos.x) / d) * 1.5;
    fy += ((me.y - p.pos.y) / d) * 1.5;
  }

  // Do not kite into the wall: the map edge is a worse threat than the swarm.
  const fromCentre = Math.hypot(me.x, me.y);
  if (fromCentre > obs.map.halfExtent - 8 && fromCentre > 0) {
    fx += (-me.x / fromCentre) * 2;
    fy += (-me.y / fromCentre) * 2;
  }

  if (fx !== 0 || fy !== 0) {
    api.setIntent({ kind: 'vector', x: fx, y: fy });
    return;
  }

  const orb = obs.pickups[0];
  if (orb && orb.dist <= ORB_RANGE) {
    api.setIntent({ kind: 'vector', x: orb.pos.x - me.x, y: orb.pos.y - me.y });
    return;
  }
  if (fromCentre > 6) {
    api.setIntent({ kind: 'vector', x: -me.x, y: -me.y });
    return;
  }
  api.setIntent({ kind: 'hold' });
};

export interface DriveOptions {
  readonly maxFrames: number;
  /** How to advance one tick. Defaults to the headless `step` tool. */
  readonly advance?: () => void;
}

/**
 * Drive a session with a policy, exactly as an MCP client would: observe, act,
 * advance. Rejections (rate limits, decision floors) are swallowed — being told
 * "no" is part of the handicap and a policy must survive it (FR-25).
 */
export function driveRun(
  session: McpSession,
  policy: Policy,
  options: DriveOptions,
): AgentRunSummary {
  const advance = options.advance ?? (() => void session.stepTicks(1));
  const swallow = (fn: () => unknown): void => {
    try {
      fn();
    } catch (err) {
      if (!(err instanceof SessionError)) throw err;
    }
  };
  const api: PolicyApi = {
    setIntent: (intent) => swallow(() => session.setIntent(intent)),
    chooseUpgrade: (index) => swallow(() => session.chooseUpgrade(index)),
    rerollOffer: () => swallow(() => session.rerollOffer()),
    buy: (index) => swallow(() => session.buy(index)),
  };

  for (let i = 0; i < options.maxFrames; i++) {
    if (session.engine.state.phase === 'ended') break;
    policy(session.getState(), api);
    advance();
  }
  return session.getRunSummary();
}
