/**
 * The agent, attached to a game a human is actually playing.
 *
 * Until now the MCP server could only drive its own headless copy of the sim.
 * This is the piece that makes the PRD's headline feature real: the browser page
 * publishes its live state to the bridge, this reads it, and posts back either
 * ADVICE (rendered on the human's screen, never applied) or an INTENT (applied,
 * but only while the human has handed over control).
 *
 * Critically, it reuses the SAME FR-27/FR-28 handicap as headless mode. The
 * client publishes raw state on purpose — filtering happens here, on the way to
 * the agent, so an attached agent is exactly as blind as a headless one and the
 * parity results carry over.
 */

import type { AdvicePayload, BridgeApi } from '@megabonk/bridge';
import type { GameState } from '@megabonk/sim';
import { content } from '@megabonk/content';
import { observeState, type Observation } from './observation.js';
import { resolveIntentVector, type MovementIntent } from './actuation.js';
import { baselinePolicy, type Policy, type PolicyApi } from './policy.js';
import type { ResolvedHandicap } from './handicap.js';

export type LiveMode = 'advisor' | 'autonomous';

export interface LiveAgentOptions {
  readonly handicap: ResolvedHandicap;
  readonly mode?: LiveMode;
  readonly policy?: Policy;
  /** Injected for tests; defaults to a monotonic frame counter. */
  readonly now?: () => number;
}

export interface LiveStatus {
  readonly clientConnected: boolean;
  readonly stateVersion: number;
  readonly mode: LiveMode;
  /** null until the page has ever reported in; false means the tab is
   * backgrounded and the sim clock is not advancing — not a bug, just nothing
   * to act on yet. */
  readonly pageVisible: boolean | null;
  /** null until the page has ever reported in. 'hub' or 'summary' means the
   * human is not in a run right now — /state has nothing new to say, and
   * that is expected, not a fault. */
  readonly screen: 'hub' | 'run' | 'summary' | null;
}

/**
 * What the policy wants, as a headline the player can act on at a glance plus a
 * line of reasoning. Two fields rather than one because the panel shows the
 * headline big: "Break the ring" is actionable mid-fight in a way that a full
 * sentence is not.
 */
function explain(obs: Observation): { headline: string; rationale: string } {
  if (obs.offer) {
    const first = obs.offer.options[0];
    return first
      ? { headline: `Take ${first.name}`, rationale: 'Best fit for the build you are already running.' }
      : { headline: 'Take option 1', rationale: 'Nothing separates these.' };
  }
  const threats = obs.enemies.length;
  const shots = obs.projectiles?.length ?? 0;
  if (shots > 0) {
    return {
      headline: 'Shots incoming',
      rationale: `${shots} in the air — move ACROSS them, not away; they lead where you were.`,
    };
  }
  if (threats >= 8) {
    return {
      headline: 'Break the ring',
      rationale: `${threats} enemies closing — pick the thinnest side and go through it before it seals.`,
    };
  }
  if (threats === 0) {
    return { headline: 'Reposition', rationale: 'Nothing in view — collect orbs and work back toward the centre.' };
  }
  return {
    headline: 'Hold and strafe',
    rationale: `${threats} in view — keep them at weapon range and circle; do not back into open ground.`,
  };
}

/** Connection failures look like this; everything else is a bug worth reporting. */
function isBridgeUnreachable(err: Error): boolean {
  return /fetch failed|ECONNREFUSED|ENOTFOUND|socket hang up|terminated|-> 5\d\d/i.test(
    `${err.message} ${String((err as { cause?: unknown }).cause ?? '')}`,
  );
}

export class LiveAgent {
  private lastActedVersion = -1;
  private readonly mode: LiveMode;
  private readonly policy: Policy;
  private frame = 0;

  constructor(
    private readonly api: BridgeApi,
    private readonly options: LiveAgentOptions,
  ) {
    this.mode = options.mode ?? 'advisor';
    this.policy = options.policy ?? baselinePolicy;
  }

  async status(): Promise<LiveStatus> {
    try {
      const health = await this.api.health();
      return {
        clientConnected: health.clientConnected,
        stateVersion: health.stateVersion,
        mode: this.mode,
        pageVisible: health.pageVisible ?? null,
        screen: health.screen ?? null,
      };
    } catch {
      return {
        clientConnected: false,
        stateVersion: 0,
        mode: this.mode,
        pageVisible: null,
        screen: null,
      };
    }
  }

  /** The handicapped view of the live game, or null when nothing is published. */
  async observe(): Promise<Observation | null> {
    const doc = await this.api.readState<GameState>();
    if (doc.value === null) return null;
    this.frame = doc.version;
    return observeState(doc.value, this.options.handicap, {
      frame: doc.version,
      content,
      offerTicks: doc.value.offer ? this.options.handicap.offerDecisionFloorTicks : 0,
    });
  }

  /**
   * One decision cycle: look, think, post.
   *
   * Rate-limited by the published STATE VERSION rather than by wall clock. The
   * agent has nothing new to react to until the page publishes again, so acting
   * twice on one snapshot would only churn the bridge and, in autonomous mode,
   * fight itself.
   */
  async act(): Promise<void> {
    try {
      const doc = await this.api.readState<GameState>();
      if (doc.value === null) return;
      if (doc.version === this.lastActedVersion) return;
      this.lastActedVersion = doc.version;

      const obs = await this.observe();
      if (obs === null || obs.phase === 'ended') return;

      let intent: MovementIntent | null = null;
      let chooseIndex: number | undefined;
      let reroll = false;
      const api: PolicyApi = {
        setIntent: (i) => {
          intent = i;
        },
        chooseUpgrade: (index) => {
          chooseIndex = index;
        },
        rerollOffer: () => {
          reroll = true;
        },
        buy: () => {},
      };
      this.policy(obs, api);

      const move =
        intent === null ? { x: 0, y: 0 } : resolveIntentVector(intent, obs, this.options.handicap);

      if (this.mode === 'advisor') {
        // Advice is rendered, never applied. This is the entire distinction
        // between advising and playing, so the advisor path must not be able to
        // post an intent even by accident.
        const said = explain(obs);
        const advice: AdvicePayload = {
          status: 'ready',
          headline: said.headline,
          rationale: said.rationale,
          move,
          ...(chooseIndex !== undefined ? { pickIndex: chooseIndex } : {}),
        };
        await this.api.publishAdvice(advice);
        return;
      }

      await this.api.publishIntent({
        control: true,
        move,
        ...(chooseIndex !== undefined ? { chooseIndex } : {}),
        ...(reroll ? { reroll: true } : {}),
      });
      await this.api.publishAdvice({ status: 'ready', ...explain(obs) });
    } catch (err) {
      // A vanished bridge is a normal end-of-session event. Anything else is a
      // real bug, and a blanket catch here would hide it — it already hid a
      // wrong-arity call to resolveIntentVector once. Surface those.
      this.lastError = err instanceof Error ? err : new Error(String(err));
      if (!isBridgeUnreachable(this.lastError)) {
        console.error('[hollowlight] live agent error:', this.lastError.message);
      }
    }
  }

  /** The most recent error swallowed by act(), for diagnostics. */
  lastError: Error | null = null;

  /** Release the human's controls. Always call this when detaching. */
  async release(): Promise<void> {
    try {
      await this.api.publishIntent({ control: false });
      await this.api.publishAdvice(null);
    } catch {
      /* nothing to release */
    }
  }
}
