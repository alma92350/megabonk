/**
 * The client half of the co-play bridge.
 *
 * Publishes the live GameState so an agent can see what the human sees, and
 * applies whatever comes back — advice for the overlay, or a movement intent
 * when the human has handed over control.
 *
 * Two rules the tests pin down, because breaking either would make the feature
 * worse than not having it:
 *
 *  1. A bridge that is not running must be INVISIBLE. Every call is wrapped; a
 *     connection failure marks us disconnected and touches nothing else, so the
 *     game plays identically with no agent attached (AC-21.1).
 *  2. Polls never overlap. A slow poll must not let a second one start, or the
 *     agent ends up reading state that is already two frames stale while a
 *     backlog builds behind it.
 *
 * NOTE ON THE HANDICAP: this publishes the FULL state, unfiltered. That is
 * deliberate. The FR-27 perception handicap belongs in packages/mcp, applied on
 * the way out to the agent — not here. Filtering at the source would mean the
 * client decides what an agent may see, which is exactly the coupling the
 * architecture avoids, and would make the unrestricted debug profile impossible.
 */

import type { AdvicePayload, BridgeApi, IntentPayload } from '@megabonk/bridge';
import { setAdvice } from './advice.js';

export interface CoPlayHost {
  /** The live state, or null when no run is in progress. */
  getState(): unknown | null;
  applyAdvice?(advice: AdvicePayload | null): void;
  applyIntent?(intent: IntentPayload): void;
}

export interface CoPlayOptions {
  readonly intervalMs?: number;
}

export class CoPlay {
  connected = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private lastAdviceVersion = -1;
  private lastIntentVersion = -1;
  private readonly intervalMs: number;

  constructor(
    private readonly api: BridgeApi,
    private readonly host: CoPlayHost,
    options: CoPlayOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? 100;
  }

  async poll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const state = this.host.getState();
      if (state !== null && state !== undefined) {
        await this.api.publishState(state);
      }

      const advice = await this.api.readAdvice();
      if (advice.version !== this.lastAdviceVersion) {
        this.lastAdviceVersion = advice.version;
        // Route through the module store the overlay already subscribes to,
        // rather than inventing a second path to the same pixels.
        setAdvice(advice.value);
        this.host.applyAdvice?.(advice.value);
      }

      const intent = await this.api.readIntent();
      if (intent.version !== this.lastIntentVersion) {
        this.lastIntentVersion = intent.version;
        if (intent.value !== null) this.host.applyIntent?.(intent.value);
      }

      this.connected = true;
    } catch {
      // No bridge, or it went away mid-run. Not an error condition: the game is
      // fully playable without one.
      this.connected = false;
    } finally {
      this.busy = false;
    }
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
