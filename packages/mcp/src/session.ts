/**
 * FR-23/FR-25: the session that owns (or attaches to) one simulation and applies
 * the FR-27/FR-28 handicap at its boundary.
 *
 * The sim NEVER waits for the agent. Everything the agent submits is level-
 * triggered and tick-stamped; if the agent goes quiet the last intent keeps
 * running (AC-25.2). The only pause is the offer screen, which pauses for the
 * human too (FR-19), and even that has an auto-pick timeout in autonomous mode.
 */

import {
  NO_INPUT,
  TICK_MS,
  createRun,
  step,
  summarise,
} from '@megabonk/sim';
import type {
  GameState,
  InputFrame,
  Offer,
  RunConfig,
  RunSummary,
  SimEvent,
} from '@megabonk/sim';
import { makeRunConfig, content } from '@megabonk/content';
import type { RunOptions } from '@megabonk/content';
import { resolveHandicap } from './handicap.js';
import type { HandicapRequest, ResolvedHandicap } from './handicap.js';
import { PerceptionGate } from './observation.js';
import type { Observation, ObservedOffer } from './observation.js';
import { Actuator } from './actuation.js';
import type { MovementIntent } from './actuation.js';

export type SessionMode = 'advisor' | 'autonomous';

/** A structured failure. The tool layer turns these into MCP errors (AC-24.1). */
export class SessionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

/**
 * One run, one fixed-timestep clock.
 *
 * Headless the session drives this; attached to a live game the game's own loop
 * drives it and the session only supplies the InputFrame — which is why the same
 * tool-call sequence lands on the same terminal state either way (AC-23.1).
 */
export class RunEngine {
  state: GameState;
  /** Frames advanced, INCLUDING ticks spent paused on an offer screen. */
  frames = 0;
  /** Frames the current offer screen has been open (the sim clock is paused). */
  offerTicks = 0;
  /** Merged into every `run_start` event when the log is read (AC-29.3). */
  annotations: Readonly<Record<string, unknown>> = {};
  private raw: SimEvent[];
  private listeners: ((engine: RunEngine) => void)[] = [];

  constructor(public config: RunConfig) {
    this.state = createRun(config);
    this.raw = [...this.state.events];
  }

  get eventLog(): readonly SimEvent[] {
    if (Object.keys(this.annotations).length === 0) return this.raw;
    return this.raw.map((e) =>
      e.type === 'run_start' ? { ...e, data: { ...e.data, ...this.annotations } } : e,
    );
  }

  subscribe(fn: (engine: RunEngine) => void): void {
    this.listeners.push(fn);
  }

  /** Session-level bookkeeping (offer timeouts, advice) recorded in the same log. */
  pushAgentEvent(type: string, data?: Record<string, unknown>): void {
    this.raw.push(data === undefined ? { tick: this.state.tick, type } : { tick: this.state.tick, type, data });
  }

  reset(config: RunConfig): void {
    this.config = config;
    this.state = createRun(config);
    this.raw = [...this.state.events];
    this.frames = 0;
    this.offerTicks = 0;
    for (const fn of this.listeners) fn(this);
  }

  tickOnce(input: InputFrame): void {
    const previousOffer: Offer | null = this.state.offer;
    const next = step(this.state, input, TICK_MS, this.config);
    this.state = next;
    this.raw.push(...next.events);
    this.frames += 1;
    if (next.phase !== 'offer' || next.offer === null) {
      this.offerTicks = 0;
    } else if (next.offer !== previousOffer) {
      this.offerTicks = 0; // a fresh set of cards: the decision floor restarts
    } else {
      this.offerTicks += 1;
    }
    for (const fn of this.listeners) fn(this);
  }
}

export interface SessionOptions {
  readonly mode?: SessionMode;
  readonly seed?: number;
  readonly handicap?: ResolvedHandicap | HandicapRequest;
  readonly runOptions?: RunOptions;
  /** Attach to a live game's engine instead of owning one (FR-23). */
  readonly engine?: RunEngine;
  readonly warn?: (message: string) => void;
}

export interface BuildReport {
  readonly level: number;
  readonly weapons: readonly { readonly id: string; readonly name: string; readonly level: number }[];
  readonly tomes: readonly { readonly id: string; readonly name: string; readonly stacks: number }[];
  readonly items: readonly {
    readonly id: string;
    readonly name: string;
    readonly rarity: string;
    readonly stacks: number;
  }[];
  readonly buffs: Observation['player']['buffs'];
  readonly stats: Readonly<Record<string, number>>;
}

export interface AgentRunSummary extends RunSummary {
  /** AC-29.1: the fully-resolved handicap parameters that drove this run. */
  readonly handicap: ResolvedHandicap;
  readonly inProgress: boolean;
}

export interface Advice {
  readonly tick: number;
  readonly recommendation: string;
  readonly rationale?: string;
}

function isResolved(h: ResolvedHandicap | HandicapRequest): h is ResolvedHandicap {
  return (h as ResolvedHandicap).observationDelayTicks !== undefined;
}

export class McpSession {
  readonly mode: SessionMode;
  readonly handicap: ResolvedHandicap;
  readonly headless: boolean;
  readonly adviceLog: Advice[] = [];

  private engineOrNull: RunEngine | null = null;
  private gate: PerceptionGate | null = null;
  private actuator: Actuator | null = null;
  private pendingChoose: { index: number; dueOfferTick: number } | null = null;
  private pendingReroll: { dueOfferTick: number } | null = null;
  private pendingBuy: { index: number; dueTick: number } | null = null;
  private readonly seed: number;
  private readonly runOptions: RunOptions;
  private readonly warn: (message: string) => void;

  constructor(options: SessionOptions = {}) {
    this.mode = options.mode ?? 'autonomous';
    const requested = options.handicap ?? {};
    this.handicap = isResolved(requested) ? requested : resolveHandicap(requested);
    this.seed = options.seed ?? 1;
    this.runOptions = options.runOptions ?? {};
    this.warn = options.warn ?? ((m) => process.stderr.write(`${m}\n`));
    this.headless = options.engine === undefined;
    if (options.engine) this.attach(options.engine);
  }

  get engine(): RunEngine {
    if (!this.engineOrNull) {
      throw new SessionError('no_run', 'No run is active. Call start_run first.');
    }
    return this.engineOrNull;
  }

  get offerTicks(): number {
    return this.engine.offerTicks;
  }

  get agentProfile(): string | null {
    // AC-29.1: a human-driven run records null, whatever the perception filter did.
    return this.mode === 'autonomous' ? this.handicap.profile : null;
  }

  private attach(engine: RunEngine): void {
    this.engineOrNull = engine;
    this.gate = new PerceptionGate(this.handicap, engine.config.content);
    this.actuator = new Actuator(this.handicap);
    this.pendingChoose = null;
    this.pendingReroll = null;
    this.pendingBuy = null;
    if (this.mode === 'autonomous') {
      engine.annotations = { handicap: this.handicap.profile };
      if (this.handicap.profile === 'unrestricted') {
        // AC-29.3: an unhandicapped run must announce itself.
        this.warn(
          'WARNING: agent handicap profile "unrestricted" — perception and actuation filters are OFF. ' +
            'Results are not comparable with human-parity runs.',
        );
      }
    }
    engine.subscribe((e) => this.gate?.record(e.state, e.offerTicks));
    this.gate.record(engine.state, engine.offerTicks);
  }

  /** FR-24 `start_run`. */
  startRun(args: { seed?: number; characterId?: string } = {}): {
    seed: number;
    tick: number;
    profile: string | null;
  } {
    const seed = args.seed ?? this.seed;
    const options: RunOptions = {
      ...this.runOptions,
      ...(args.characterId !== undefined ? { characterId: args.characterId } : {}),
    };
    const config = makeRunConfig(seed, options);
    if (this.engineOrNull && !this.headless) {
      this.engineOrNull.reset(config);
      this.attach(this.engineOrNull);
    } else {
      this.attach(new RunEngine(config));
    }
    return { seed, tick: this.engine.state.tick, profile: this.agentProfile };
  }

  /** FR-24 `step`. Headless only: a live game owns its own clock (AC-23.1). */
  stepTicks(ticks: number): { tick: number; phase: string; offerTicks: number; ended: boolean } {
    if (!this.headless) {
      throw new SessionError(
        'headless_only',
        'step is rejected against a live game: the game owns its clock. Use it only with --headless.',
      );
    }
    const engine = this.engine;
    this.requireLive();
    for (let i = 0; i < ticks; i++) {
      if (engine.state.phase === 'ended') break;
      engine.tickOnce(this.nextInput());
    }
    return {
      tick: engine.state.tick,
      phase: engine.state.phase,
      offerTicks: engine.offerTicks,
      ended: engine.state.phase === 'ended',
    };
  }

  /**
   * The InputFrame for the coming tick. This is the ONLY channel into the sim, and
   * it is what the live game's loop pulls once per tick.
   */
  nextInput(): InputFrame {
    const engine = this.engine;
    const state = engine.state;
    if (state.phase === 'ended') return NO_INPUT;

    if (state.phase === 'offer' && state.offer) {
      const offerTicks = engine.offerTicks + 1; // the tick about to be produced
      // AC-25.3: autonomous mode does not stall forever on an unanswered offer.
      if (
        this.mode === 'autonomous' &&
        !this.pendingChoose &&
        offerTicks >= this.handicap.offerTimeoutTicks
      ) {
        this.pendingChoose = { index: 0, dueOfferTick: offerTicks };
        engine.pushAgentEvent('agent_offer_timeout', {
          index: 0,
          offerTicks,
          timeoutTicks: this.handicap.offerTimeoutTicks,
        });
      }
      if (this.pendingReroll && offerTicks >= this.pendingReroll.dueOfferTick) {
        this.pendingReroll = null;
        return { move: { x: 0, y: 0 }, reroll: true };
      }
      if (this.pendingChoose && offerTicks >= this.pendingChoose.dueOfferTick) {
        const index = this.pendingChoose.index;
        this.pendingChoose = null;
        if (index < state.offer.options.length) {
          return { move: { x: 0, y: 0 }, chooseIndex: index };
        }
      }
      return { move: { x: 0, y: 0 } };
    }

    const producedTick = state.tick + 1;
    const obs = this.observation();
    const move = this.actuator!.moveVectorFor(producedTick, obs);
    if (this.pendingBuy && producedTick >= this.pendingBuy.dueTick) {
      const index = this.pendingBuy.index;
      this.pendingBuy = null;
      return { move, buyIndex: index };
    }
    return { move };
  }

  // ---- Read tools ------------------------------------------------------------

  /** FR-24 `get_state`, filtered by FR-27 — in advisor mode too (AC-29.5). */
  getState(): Observation {
    return this.observation();
  }

  /** FR-24 `get_offer`. */
  getOffer(): { offer: ObservedOffer | null } {
    return { offer: this.observation().offer };
  }

  /** FR-24 `get_build`. */
  getBuild(): BuildReport {
    const obs = this.observation();
    const bundle = this.engine.config.content ?? content;
    const tomes: BuildReport['tomes'] = [];
    const items: BuildReport['items'] = [];
    for (const held of obs.player.items) {
      const tome = bundle.tomes[held.id];
      if (tome) tomes.push({ id: held.id, name: tome.name, stacks: held.stacks });
      else {
        items.push({
          id: held.id,
          name: bundle.items[held.id]?.name ?? held.id,
          rarity: held.rarity,
          stacks: held.stacks,
        });
      }
    }
    return {
      level: obs.player.level,
      weapons: obs.player.weapons.map((w) => ({
        id: w.id,
        name: bundle.weapons[w.id]?.name ?? w.id,
        level: w.level,
      })),
      tomes,
      items,
      buffs: obs.player.buffs,
      stats: obs.player.stats,
    };
  }

  /**
   * FR-24 `get_events`. Events newer than the observation are withheld: the log is
   * a perception channel too, and a zero-delay log would undo AC-27.1.
   */
  getEvents(cursor = 0): { events: readonly SimEvent[]; cursor: number } {
    const observedTick = this.observation().tick;
    const visible = this.engine.eventLog.filter((e) => e.tick <= observedTick);
    const from = Math.max(0, Math.min(cursor, visible.length));
    return { events: visible.slice(from), cursor: visible.length };
  }

  /** FR-24 `get_run_summary`, with the FR-29 disclosure attached. */
  getRunSummary(): AgentRunSummary {
    const engine = this.engine;
    const base = summarise(engine.eventLog, this.agentProfile);
    return { ...base, handicap: this.handicap, inProgress: engine.state.phase !== 'ended' };
  }

  // ---- Write tools -----------------------------------------------------------

  /** FR-24 `set_intent`. Level-triggered, delayed and rate-limited (FR-28). */
  setIntent(intent: MovementIntent): { appliesAtTick: number; intent: MovementIntent } {
    this.requireLive();
    const result = this.actuator!.submitIntent(intent, this.engine.state.tick);
    if (!result.ok) {
      throw new SessionError(result.error.code, result.error.message, result.error.data);
    }
    return { appliesAtTick: result.appliesAtTick, intent };
  }

  /** FR-24 `choose_upgrade`. AC-24.2, AC-24.3, AC-28.4 all land here. */
  chooseUpgrade(index: number): { accepted: true; appliesInTicks: number } {
    this.requireLive();
    const state = this.engine.state;
    if (state.phase !== 'offer' || !state.offer) {
      throw new SessionError('no_offer', 'No upgrade offer is pending.');
    }
    if (!Number.isInteger(index) || index < 0 || index >= state.offer.options.length) {
      throw new SessionError(
        'index_out_of_range',
        `Offer index ${index} is out of range (0..${state.offer.options.length - 1}).`,
        { options: state.offer.options.length },
      );
    }
    const offerTicks = this.engine.offerTicks;
    if (!this.actuator!.offerDecisionAllowed(offerTicks)) {
      throw new SessionError(
        'too_early',
        `Too early: the offer has been open ${offerTicks} ticks, the decision floor is ${this.handicap.offerDecisionFloorTicks}.`,
        {
          offerTicks,
          floorTicks: this.handicap.offerDecisionFloorTicks,
          waitTicks: this.handicap.offerDecisionFloorTicks - offerTicks,
        },
      );
    }
    // Idempotent for the same index: a policy that re-asserts its pick every tick
    // must not push the action delay forward forever.
    if (this.pendingChoose && this.pendingChoose.index === index) {
      return { accepted: true, appliesInTicks: Math.max(0, this.pendingChoose.dueOfferTick - offerTicks) };
    }
    this.pendingChoose = { index, dueOfferTick: offerTicks + this.handicap.actionDelayTicks };
    return { accepted: true, appliesInTicks: this.handicap.actionDelayTicks };
  }

  /** FR-24 `reroll_offer`. */
  rerollOffer(): { accepted: true; appliesInTicks: number } {
    this.requireLive();
    const state = this.engine.state;
    if (state.phase !== 'offer' || !state.offer) {
      throw new SessionError('no_offer', 'No upgrade offer is pending.');
    }
    if (state.player.rerolls <= 0) {
      throw new SessionError('no_rerolls', 'No rerolls remaining.');
    }
    const offerTicks = this.engine.offerTicks;
    if (!this.actuator!.offerDecisionAllowed(offerTicks)) {
      throw new SessionError('too_early', `Too early: the decision floor is ${this.handicap.offerDecisionFloorTicks} ticks.`, {
        offerTicks,
        floorTicks: this.handicap.offerDecisionFloorTicks,
      });
    }
    this.pendingReroll = { dueOfferTick: offerTicks + this.handicap.actionDelayTicks };
    return { accepted: true, appliesInTicks: this.handicap.actionDelayTicks };
  }

  /** FR-24 `buy`. */
  buy(index: number): { accepted: true; appliesInTicks: number } {
    this.requireLive();
    const state = this.engine.state;
    if (!state.merchant) throw new SessionError('no_merchant', 'No merchant is present.');
    const entry = state.merchant.stock[index];
    if (!Number.isInteger(index) || !entry) {
      throw new SessionError(
        'index_out_of_range',
        `Merchant index ${index} is out of range (0..${state.merchant.stock.length - 1}).`,
      );
    }
    if (entry.sold) throw new SessionError('already_sold', `Stock ${index} is already sold.`);
    if (state.player.gold < entry.price) {
      throw new SessionError('insufficient_gold', `Need ${entry.price} gold, have ${state.player.gold}.`, {
        price: entry.price,
        gold: state.player.gold,
      });
    }
    this.pendingBuy = { index, dueTick: state.tick + this.handicap.actionDelayTicks };
    return { accepted: true, appliesInTicks: this.handicap.actionDelayTicks };
  }

  /** FR-24 `advise`. Never mutates sim state — it only records a recommendation. */
  advise(recommendation: string, rationale?: string): { logged: true; count: number } {
    const tick = this.engineOrNull ? this.engineOrNull.state.tick : 0;
    this.adviceLog.push(
      rationale === undefined ? { tick, recommendation } : { tick, recommendation, rationale },
    );
    this.engineOrNull?.pushAgentEvent('agent_advice', { recommendation });
    return { logged: true, count: this.adviceLog.length };
  }

  // ---- internals -------------------------------------------------------------

  private observation(): Observation {
    const engine = this.engine;
    if (!this.gate) throw new SessionError('no_run', 'No run is active. Call start_run first.');
    return this.gate.observe(engine.state);
  }

  /** AC-25.4: anything that would mutate the run is refused once it has ended. */
  private requireLive(): void {
    if (this.engine.state.phase === 'ended') {
      throw new SessionError(
        'run_ended',
        `The run has ended (${String(this.engine.state.outcome)}) at tick ${this.engine.state.tick}. Start a new run.`,
      );
    }
  }
}

export function createSession(options: SessionOptions = {}): McpSession {
  return new McpSession(options);
}
