/**
 * The client's state machine: meta hub -> run -> summary.
 *
 * Deliberately DOM-free. Everything here is driven by `advance(frameMs)` and
 * `onKey(code, down)`, which is what lets the whole loop — accumulator, camera,
 * HUD, run banking — be tested headlessly in Node with no canvas at all. The
 * only thing left in main.ts is the canvas, rAF and the event listeners.
 *
 * Hard rules this class exists to enforce:
 *  - the renderer never mutates sim state; `step()` is the only writer;
 *  - dt handed to `step()` is always exactly TICK_MS;
 *  - interpolation is display-only: `prev` is kept as a read-only snapshot and
 *    nothing interpolated is ever written back.
 */

import {
  RecordingBuilder,
  TICKS_PER_SECOND,
  TICK_MS,
  createRun,
  step,
  summarise,
  type Recording,
  type GameState,
  type InputFrame,
  type RunConfig,
  type RunSummary,
  type SimEvent,
} from '@megabonk/sim';
import { content, makeRunConfig } from '@megabonk/content';
import {
  QUESTS,
  UNLOCKS,
  applyRun,
  purchase,
  unlocksFor,
  type Profile,
} from '@megabonk/meta';
import { clampCamera, createCamera, updateCamera, zoomFor, type CameraState } from './camera.js';
import { KeyTracker, type Action } from './input.js';
import { planTicks } from './loop.js';
import { buildHud, type HudModel } from './hud.js';
import { detectStorage, loadProfile, saveProfile, type StoragePort } from './storage.js';
import { saveRecording } from './recordings.js';
import type { Viewport } from './render/projection.js';
import { FxManager } from './render/fx/index.js';
import { Atmosphere, attachAtmosphere } from './render/atmosphere/index.js';

export type Screen = 'hub' | 'run' | 'summary';

export interface GameClientOptions {
  readonly storage?: StoragePort | null;
  readonly viewport?: Viewport;
  readonly seedSource?: () => number;
  readonly reduceMotion?: boolean;
}

export interface HubEntry {
  readonly kind: 'unlock' | 'start';
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly cost: number;
  readonly owned: boolean;
  readonly affordable: boolean;
}

export interface QuestDelta {
  readonly id: string;
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly target: number;
  readonly completed: boolean;
}

/** Display-only feedback intensities, all in [0,1], all decaying in real time. */
export interface Fx {
  shake: number;
  damageFlash: number;
  levelFlash: number;
  killFlash: number;
  bossFlash: number;
}

const FX_DECAY_MS = 210;
const DEFAULT_VIEW: Viewport = { width: 960, height: 540 };

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export class GameClient {
  view: Viewport;
  screen: Screen = 'hub';
  paused = false;
  helpOpen = false;

  profile: Profile;
  storageAvailable: boolean;
  notice: string | null = null;
  hubIndex = 0;

  config: RunConfig | null = null;
  state: GameState | null = null;
  /** The snapshot before the most recent tick — read-only, for interpolation. */
  prev: GameState | null = null;
  events: SimEvent[] = [];

  camera: CameraState;
  alpha = 0;
  totalTicks = 0;
  ticksLastFrame = 0;
  droppedTicks = 0;

  summary: RunSummary | null = null;
  questDeltas: QuestDelta[] = [];

  readonly fx: Fx = { shake: 0, damageFlash: 0, levelFlash: 0, killFlash: 0, bossFlash: 0 };
  readonly keys = new KeyTracker();
  readonly reduceMotion: boolean;
  /** Display-only combat effects; derived from state pairs, never read by the sim. */
  readonly combatFx: FxManager;
  /** Boss arrival, ambient motes and chest light: display-only, derived from state pairs. */
  readonly atmosphere: Atmosphere;

  private readonly storage: StoragePort | null;
  private readonly seedSource: () => number;
  private acc = 0;
  private banked = false;
  /**
   * Agent co-play. `agentControl` is opt-in and human-revocable: the human hands
   * over movement, and any key press takes it straight back (see onKey). An
   * agent can always ADVISE without this being on — advice is rendered, never
   * applied, which is the whole distinction between advisor and autonomous mode.
   */
  /**
   * Every run is recorded as seed + input log. It costs a few hundred bytes and
   * an equality check per tick, and it is the only way to build the corpus of
   * real human runs that FR-30's parity validation needs (AC-30.1).
   */
  private recorder: RecordingBuilder | null = null;
  lastRecording: Recording | null = null;

  /**
   * Seal the in-progress run into a recording without ending it.
   *
   * Useful for exporting a run you are still playing, and it is what makes the
   * replay guarantee testable without having to die first.
   */
  sealRecording(): Recording | null {
    if (this.recorder === null || this.state === null) return this.lastRecording;
    return this.recorder.build(this.state.tick);
  }

  agentControl = false;
  agentMove: { x: number; y: number } | null = null;

  private pendingChoose: number | null = null;
  private pendingReroll = false;
  private pendingBuy: number | null = null;

  constructor(options: GameClientOptions = {}) {
    this.view = options.viewport ?? DEFAULT_VIEW;
    this.reduceMotion = options.reduceMotion ?? false;
    this.combatFx = new FxManager({ reduceMotion: this.reduceMotion });
    this.atmosphere = new Atmosphere({ reduceMotion: this.reduceMotion });
    attachAtmosphere(this.combatFx, this.atmosphere);
    this.seedSource = options.seedSource ?? randomSeed;
    this.storage = options.storage === undefined ? detectStorage() : options.storage;

    const loaded = loadProfile(this.storage);
    this.profile = loaded.profile;
    this.storageAvailable = loaded.available;
    this.notice = loaded.warning ?? null;
    this.camera = createCamera(0, 0, zoomFor(this.view));
  }

  // ---- lifecycle -----------------------------------------------------------

  setViewport(width: number, height: number): void {
    this.view = { width, height };
    this.camera = { ...this.camera, zoom: zoomFor(this.view) };
  }

  startRun(): void {
    const seed = Math.abs(Math.floor(this.seedSource())) >>> 0;
    this.config = makeRunConfig(seed, { unlocks: unlocksFor(this.profile) });
    const state = createRun(this.config);
    this.state = state;
    this.prev = state;
    this.combatFx.clear();
    this.atmosphere.clear();
    this.events = [...state.events];
    this.acc = 0;
    this.alpha = 0;
    this.totalTicks = 0;
    this.ticksLastFrame = 0;
    this.droppedTicks = 0;
    this.banked = false;
    this.paused = false;
    this.summary = null;
    this.questDeltas = [];
    this.notice = null;
    this.pendingChoose = null;
    this.pendingReroll = false;
    this.pendingBuy = null;
    this.recorder = new RecordingBuilder({
      seed,
      characterId: this.config.characterId,
      biomeId: this.config.biomeId,
      ...(this.config.unlocks !== undefined ? { unlocks: this.config.unlocks } : {}),
      ...(this.config.difficulty !== undefined ? { difficulty: this.config.difficulty } : {}),
      source: 'human',
    });
    this.lastRecording = null;
    this.camera = clampCamera(
      createCamera(state.player.pos.x, state.player.pos.y, zoomFor(this.view)),
      state.map.halfExtent,
      this.view,
    );
    this.screen = 'run';
  }

  toHub(): void {
    this.screen = 'hub';
    this.paused = false;
    this.keys.clear();
  }

  hud(): HudModel | null {
    return this.state === null ? null : buildHud(this.state, content);
  }

  /** Display-only screen shake. Damped hard under prefers-reduced-motion (NFR-3). */
  shake(amount: number): void {
    const scaled = this.reduceMotion ? amount * 0.15 : amount;
    this.fx.shake = Math.min(1, this.fx.shake + scaled);
  }

  private flash(key: 'damageFlash' | 'levelFlash' | 'killFlash' | 'bossFlash', amount: number): void {
    const scaled = this.reduceMotion ? amount * 0.3 : amount;
    this.fx[key] = Math.min(1, this.fx[key] + scaled);
  }

  // ---- input ---------------------------------------------------------------

  onKey(code: string, down: boolean): void {
    if (!down) {
      this.keys.up(code);
      return;
    }
    this.keys.down(code);
    for (const action of this.keys.drainActions()) this.handleAction(action);
  }

  blur(): void {
    this.keys.clear();
    this.pendingChoose = null;
    this.pendingReroll = false;
    this.pendingBuy = null;
  }

  private handleAction(action: Action): void {
    if (this.screen === 'hub') {
      this.handleHubAction(action);
      return;
    }
    if (this.screen === 'summary') {
      if (action.type === 'reroll') this.startRun();
      else if (action.type === 'confirm' || action.type === 'pause') this.toHub();
      else if (action.type === 'toggleHelp') this.helpOpen = !this.helpOpen;
      return;
    }

    // screen === 'run'
    switch (action.type) {
      case 'pause':
        this.paused = !this.paused;
        this.acc = 0; // never bank real time across a pause
        break;
      case 'toggleHelp':
        this.helpOpen = !this.helpOpen;
        break;
      case 'confirm':
        if (this.paused) {
          this.paused = false;
          this.acc = 0;
        }
        break;
      case 'choose':
        if (this.paused) break;
        // Digits mean "pick a card" on the offer screen and "buy" at a merchant.
        if (this.state?.phase === 'offer') this.pendingChoose = action.index;
        else this.pendingBuy = action.index;
        break;
      case 'reroll':
        if (!this.paused && this.state?.phase === 'offer') this.pendingReroll = true;
        break;
      default:
        break;
    }
  }

  private handleHubAction(action: Action): void {
    const count = this.hubEntries().length;
    switch (action.type) {
      case 'menu':
        this.hubIndex = (this.hubIndex + action.dir + count) % count;
        break;
      case 'choose':
        if (action.index < count) {
          this.hubIndex = action.index;
          this.activateHubEntry();
        }
        break;
      case 'confirm':
        this.activateHubEntry();
        break;
      case 'toggleHelp':
        this.helpOpen = !this.helpOpen;
        break;
      default:
        break;
    }
  }

  // ---- meta hub ------------------------------------------------------------

  hubEntries(): HubEntry[] {
    const entries: HubEntry[] = UNLOCKS.map((u) => ({
      kind: 'unlock' as const,
      id: u.id,
      label: u.name,
      detail: u.description,
      cost: u.cost,
      owned: this.profile.purchased.includes(u.id),
      affordable: this.profile.silver >= u.cost,
    }));
    entries.push({
      kind: 'start',
      id: 'start',
      label: 'Descend',
      detail: 'Begin a run in Verdant Hollow.',
      cost: 0,
      owned: false,
      affordable: true,
    });
    return entries;
  }

  activateHubEntry(): void {
    const entries = this.hubEntries();
    const entry = entries[this.hubIndex];
    if (entry === undefined) return;
    if (entry.kind === 'start') {
      this.startRun();
      return;
    }
    const result = purchase(this.profile, entry.id);
    if (!result.ok) {
      this.notice = result.reason ?? 'That purchase was refused.';
      return;
    }
    this.profile = result.profile;
    this.notice = `Unlocked ${entry.label}.`;
    this.persist();
  }

  private persist(): void {
    const saved = saveProfile(this.storage, this.profile);
    if (!saved.ok) {
      this.storageAvailable = false;
      this.notice = 'Progress could not be saved to this browser.';
    }
  }

  // ---- the frame -----------------------------------------------------------

  advance(frameMs: number): void {
    this.decayFx(frameMs);
    this.ticksLastFrame = 0;

    if (this.screen !== 'run' || this.state === null || this.config === null) return;
    if (this.paused) return;

    if (this.state.phase === 'ended') {
      this.finishRun();
      return;
    }

    const plan = planTicks(this.acc, frameMs);
    this.acc = plan.accumulator;
    this.alpha = plan.alpha;
    this.droppedTicks += plan.dropped;

    for (let i = 0; i < plan.ticks; i++) {
      const before = this.state;
      const input = this.buildInput(i === 0);
      // Recorded against the tick the input is APPLIED to, which is what replay
      // reads back; recording after the step would be off by one and diverge.
      this.recorder?.record(before.tick, input);
      let next: GameState;
      try {
        next = step(before, input, TICK_MS, this.config);
      } catch (err) {
        // A malformed action (an out-of-range card) must not kill the run.
        this.notice = err instanceof Error ? err.message : String(err);
        this.pendingChoose = null;
        this.pendingReroll = false;
        this.pendingBuy = null;
        break;
      }
      this.prev = before;
      this.state = next;
      this.totalTicks++;
      this.ticksLastFrame++;
      this.observe(before, next);
      if (next.phase === 'ended') {
        this.finishRun();
        return;
      }
    }

    const p = this.state.player.pos;
    this.camera = updateCamera(
      this.camera,
      p.x,
      p.y,
      frameMs,
      this.state.map.halfExtent,
      this.view,
    );
  }

  private buildInput(firstTickOfFrame: boolean): InputFrame {
    // The human's keys always win: if any movement key is held, that is what
    // happens, whatever the agent last asked for. Handing over control must
    // never feel like losing the controller.
    const keyMove = this.keys.move();
    const human = keyMove.x !== 0 || keyMove.y !== 0;
    const move =
      this.agentControl && !human && this.agentMove !== null ? this.agentMove : keyMove;
    if (!firstTickOfFrame) return { move };

    const frame: {
      move: typeof move;
      chooseIndex?: number;
      reroll?: boolean;
      buyIndex?: number;
    } = { move };

    if (this.state?.phase === 'offer') {
      // Reroll wins over a choose queued in the same frame: it is the cheaper
      // mistake to recover from.
      if (this.pendingReroll) {
        frame.reroll = true;
        this.pendingReroll = false;
        this.pendingChoose = null;
      } else if (this.pendingChoose !== null) {
        const options = this.state.offer?.options.length ?? 0;
        if (this.pendingChoose < options) frame.chooseIndex = this.pendingChoose;
        this.pendingChoose = null;
      }
    } else {
      this.pendingReroll = false;
      this.pendingChoose = null;
      if (this.pendingBuy !== null) {
        frame.buyIndex = this.pendingBuy;
        this.pendingBuy = null;
      }
    }
    return frame;
  }

  /** Derive display feedback from the tick that just ran. Never writes to state. */
  private observe(before: GameState, after: GameState): void {
    for (const e of after.events) this.events.push(e);
    this.combatFx.observe(before, after, content.weapons, content.enemies);
    this.atmosphere.observe(before, after);
    // Low rumble while the boss arrives (already scaled down for reduced motion).
    const rumble = this.atmosphere.takeRumble();
    if (rumble > 0) this.fx.shake = Math.min(1, this.fx.shake + rumble);

    if (after.player.hp < before.player.hp) {
      this.flash('damageFlash', 0.85);
      this.shake(0.35);
    }
    if (after.kills > before.kills) this.flash('killFlash', 0.3);
    for (const e of after.events) {
      if (e.type === 'level_up') this.flash('levelFlash', 1);
      else if (e.type === 'boss_killed') {
        this.flash('bossFlash', 1);
        this.shake(0.8);
      }
    }
  }

  private decayFx(frameMs: number): void {
    const dt = Number.isFinite(frameMs) ? Math.max(0, Math.min(frameMs, 250)) : 0;
    const k = Math.exp(-dt / FX_DECAY_MS);
    this.fx.shake *= k;
    this.fx.damageFlash *= k;
    this.fx.levelFlash *= k;
    this.fx.killFlash *= k;
    this.fx.bossFlash *= k;
  }

  private finishRun(): void {
    if (this.banked) {
      this.screen = 'summary';
      return;
    }
    this.banked = true;
    if (this.recorder !== null && this.state !== null) {
      this.lastRecording = this.recorder.build(this.state.tick);
      this.recorder = null;
    }
    const summary = summarise(this.events, null);
    if (this.lastRecording !== null) {
      // Kept locally so a player can export a corpus of real runs later; a
      // storage failure must never disturb the summary screen.
      saveRecording(this.storage, {
        recording: this.lastRecording,
        seconds: summary.seconds,
        kills: summary.kills,
        level: summary.level,
        outcome: summary.outcome,
      });
    }
    const before = new Map(this.profile.quests.map((q) => [q.id, q.progress]));
    const after = applyRun(this.profile, summary);

    this.questDeltas = after.quests
      .map((q) => {
        const def = QUESTS.find((d) => d.id === q.id);
        return {
          id: q.id,
          name: def?.name ?? q.id,
          from: before.get(q.id) ?? 0,
          to: q.progress,
          target: def?.target ?? q.progress,
          completed: q.completed,
        };
      })
      .filter((d) => d.to > d.from || d.completed);

    this.profile = after;
    this.summary = summary;
    this.persist();
    this.screen = 'summary';
  }

  /** Seconds of sim time elapsed, for display. */
  get runSeconds(): number {
    return this.state === null ? 0 : this.state.tick / TICKS_PER_SECOND;
  }
}
