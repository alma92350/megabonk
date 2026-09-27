# PRD: Megabonk (local TDD build)

**Status:** Draft v2 — supersedes the market-research PRD
**Scope:** A locally-run, test-driven 2.5D roguelike survival game with an MCP server that lets an AI agent advise or play alongside a human.

> **Note on origin.** This project is *mechanically inspired by* the "bullet heaven" genre (Vampire Survivors, Risk of Rain 2, Megabonk). It is not a reproduction of any commercial title, ships no third-party assets, and uses no third-party names in shipped content. `megabonk` is the working repository name only.

---

## 1. Product overview

A single-player roguelike survival game. The player's character auto-attacks; the player controls movement, positioning, and level-up build decisions while surviving escalating enemy waves on a procedurally generated map. It runs locally in a browser via `npm start`.

The distinguishing feature of this build is that the **game simulation is a pure, deterministic, headless-runnable function**. Rendering is a consumer of simulation state, never a participant in it. This is what makes the whole thing testable, replayable, and drivable by an agent.

### 1.1 The three hard constraints

Every decision in this document descends from these:

| # | Constraint | Consequence |
|---|---|---|
| C1 | **Test-driven development** | Every behaviour has a numeric acceptance criterion before it has an implementation. All randomness is seeded and injectable. The simulation must run headless in Node with no DOM, no canvas, no WebGL. |
| C2 | **Local deployment via `npm start`** | No Steam, no Steam Cloud, no native builds, no Deck verification, no telemetry backend, no anti-tamper. Saves are a local JSON file. One command starts everything. |
| C3 | **MCP server for agent co-play** | The simulation must be observable and drivable over a process boundary. State must be serialisable. Agent latency must not stall the human. |

### 1.2 Decisions taken

- **Renderer:** 2.5D on HTML5 canvas (top-down/isometric projection, no WebGL, no 3D physics). "3D verticality" is cut from v1 — it is a large cost multiplier for a TDD prototype and none of the core loop depends on it. Elevation is retained as a *data* concept (tiles have a height value affecting line-of-sight and movement cost) so a 3D renderer could be swapped in later without changing the simulation.
- **Agent role:** **Advisor + optional autonomous player.** Not a co-op second player. The agent reads run state and either (a) recommends upgrade picks and movement to the human, or (b) drives the character itself in autonomous mode. Autonomous mode doubles as the integration-test driver and the balance-tuning harness. This avoids a multi-entity networked simulation entirely. The agent plays under a **human-parity handicap** (§6.8): degraded perception and capped actuation, so its performance is comparable to a skilled human's rather than superhuman.
- **Content model:** all content (items, weapons, enemies, waves) is declarative data validated against a schema. v1 ships a small roster; scaling the roster is authoring work, not engineering work.

---

## 2. Goals and success metrics

### 2.1 Project goals

- A correct, deterministic simulation that a test suite can fully characterise.
- A playable, fun core loop that demonstrates the genre's power curve.
- A working MCP integration that meaningfully improves or automates play.

### 2.2 Player goals

- "One more run" pacing: a run is short, escalating, and ends decisively.
- Build decisions matter — two runs with different picks should feel different.
- Losing should feel attributable to a decision, not to RNG.

### 2.3 Success metrics (engineering, not business)

These replace the retention/refund KPIs of the previous draft, which had no product behind them.

| Metric | Target |
|---|---|
| Line coverage on `packages/sim` | ≥ 90% |
| Branch coverage on `packages/sim` | ≥ 85% |
| Determinism: same seed → identical final state hash | 100% over 1000 randomised seeds |
| Headless full-run execution (15 game-minutes) | < 10 s wall clock |
| Sim step with 2000 live entities | < 8 ms p95 in Node |
| Browser frame time at 1500 entities | < 16 ms p95 |
| `npm install && npm start` on a clean clone | works, zero manual steps |
| Autonomous agent run completion rate (handicap on) | ≥ 80% of runs reach the 10-minute mark |
| Autonomous agent survival vs. human baseline (handicap on) | median run duration within ±25% of the human median over 20 seeds |

---

## 3. Target users

1. **The human player** — wants a satisfying 15-minute roguelike run.
2. **The AI agent (MCP client)** — wants complete, structured, low-latency observation of run state and a small, unambiguous action vocabulary.
3. **The developer** — wants to change a balance number and know within seconds whether it broke anything.

User (3) is a first-class user here and drives most of the architecture.

---

## 4. Scope

### 4.1 In scope for v1.0

- Deterministic fixed-timestep simulation core with seeded RNG
- Auto-attack combat, XP, levelling, 3-choice upgrade selection with rarity
- Time-based wave escalation and one boss
- 2.5D canvas renderer with HUD
- 1 playable character, 1 biome, 1 difficulty tier
- 3 weapons, 4 tomes (passives), 8 items
- 6 enemy archetypes + 1 boss
- Gold economy and one in-run merchant
- Silver meta-currency, local save file, 3 meta-unlocks
- 12 quests (achievement-style objectives)
- MCP server exposing observation and action tools
- Agent advisor overlay in the UI, and a headless autonomous mode
- Run replay from seed + input log

### 4.2 Out of scope for v1.0

- Multiplayer / co-op of any kind, including agent-as-second-player
- True 3D rendering, jump/slide/climb, verticality-based traversal
- Steam, Steam Cloud, Deck verification, controller remapping UI, native builds
- Save-file anti-tamper, remote analytics, localisation beyond English
- Modding tools, level editor
- Audio beyond a minimal SFX layer (deferred to v1.1)

### 4.3 Deliberately deferred (architecture must not preclude)

- Additional biomes and difficulty tiers — the map generator is parameterised by a biome descriptor from day one.
- Full 20-character / 70-item roster — content loader is schema-driven from day one.
- WebGL/3D renderer — renderer sits behind an interface and reads immutable sim snapshots.

---

## 5. Architecture

```
megabonk/
  packages/
    sim/        pure deterministic simulation — no DOM, no I/O, no Date.now, no Math.random
    content/    declarative content data + JSON-schema validation
    client/     canvas renderer, input, HUD, agent overlay  (imports sim)
    mcp/        MCP server; owns a sim instance or attaches to the client's
    harness/    headless run driver, balance sweeps, benchmarks
  docs/
```

### 5.1 The simulation contract (ARCH-1)

The single most important requirement in this document.

```ts
step(state: GameState, inputs: InputFrame, dtMs: number): GameState
```

- **Pure.** No mutation of the input state visible to callers; no side effects.
- **Deterministic.** Depends only on its arguments. `Math.random`, `Date.now`, `performance.now`, and `crypto` are banned inside `packages/sim`, enforced by an ESLint rule and a CI grep.
- **Fixed timestep.** `dtMs` is always exactly `16.667` (60 Hz sim). The renderer accumulates real time and calls `step` zero or more times per frame, interpolating for display. Variable-dt physics is forbidden — it destroys determinism.
- **Serialisable.** `GameState` is plain JSON-compatible data. No class instances, no `Map`/`Set` in persisted state, no functions, no circular references. This is what makes the MCP boundary and replay possible.
- **Headless.** `packages/sim` has zero dependencies on `packages/client`. Enforced by a dependency-cruiser check in CI.

**Acceptance:** `step` called with an identical `(state, inputs, dt)` triple returns deeply-equal output across 10,000 randomised trials. A run of 54,000 steps from seed S produces the same terminal state hash on Node and in the browser.

### 5.2 Seeded RNG (ARCH-2)

- One PRNG implementation (xoshiro128**), constructed from a 32-bit seed.
- The RNG is **carried inside `GameState`**, not held in a module-level variable — otherwise state snapshots are not self-contained and replay breaks.
- Independent **streams** per concern, each derived from the run seed by a labelled hash: `loot`, `spawn`, `mapgen`, `crit`, `upgradeOffer`. This means changing the number of crit rolls does not shift which items drop — essential for stable balance tests.

**Acceptance:** `rng('loot', seed)` produces an identical first 1000 outputs across platforms. Consuming 500 values from the `crit` stream leaves the `loot` stream's next value unchanged.

### 5.3 Data flow

```
input (human keys | MCP action | replay log)
      ↓
  InputFrame  ──→  step()  ──→  GameState'  ──→  renderer (read-only)
                                     │
                                     ├──→ event log (structured, append-only)
                                     └──→ MCP observation projection
```

The event log is the same structure used for: agent observation, test assertions, the run summary screen, and replay verification. One mechanism, four consumers.

---

## 6. Functional requirements

Each requirement carries an ID and at least one numeric acceptance criterion. Anything without a testable criterion is not a requirement, it is a wish, and belongs in §12.

### 6.1 Core loop

**FR-1 Auto-attack targeting.**
The character attacks automatically on a cooldown derived from its attack-speed stat. Target selection is: **lowest Euclidean distance in the XY plane, among enemies within weapon range, that are alive**. Ties are broken by **ascending entity ID** — never by iteration order, which is not stable.

- AC-1.1 Given two enemies at identical distance with IDs 7 and 12, entity 7 is targeted, in 100/100 trials.
- AC-1.2 An enemy at range exactly equal to `weapon.range` is a valid target; at `range + 0.001` it is not.
- AC-1.3 A dead enemy (`hp <= 0`) is never selected, even in the same tick it died.
- AC-1.4 Attack cadence: with `attackSpeed = 2.0/s`, exactly 20 attacks occur in 10.0 game-seconds.

**FR-2 XP and levelling.**
Enemies drop XP orbs on death. Orbs within `pickupRadius` are collected. Level `n → n+1` requires `xpForLevel(n) = ceil(10 * n^1.5)`.

- AC-2.1 `xpForLevel(1) = 10`, `xpForLevel(4) = 80`, `xpForLevel(10) = 317`.
- AC-2.2 A single XP grant that crosses two thresholds queues **two** level-ups, presented sequentially. No XP is lost to the rounding.
- AC-2.3 Overflow XP carries: granting 15 XP at level 1 leaves 5 XP toward level 2.

**FR-3 Upgrade offers.**
On level-up the sim pauses and offers exactly 3 distinct options drawn from the eligible pool.

- AC-3.1 No duplicate option appears in one offer of 3.
- AC-3.2 A weapon already at max level is never offered.
- AC-3.3 With fewer than 3 eligible options remaining, the offer is padded with a gold reward; it is never fewer than 3 entries and never throws.
- AC-3.4 The offer is drawn from the `upgradeOffer` stream only; taking a different option does not change the *next* level's offer for the same seed.

**FR-4 Rarity and Luck.**
Each offered option has a rarity. Rarity weights are a pure function of Luck:

```
rarityWeights(luck) = {
  common:    max(0, 60 - 3.0*luck),
  uncommon:  25 + 0.5*luck,
  rare:      10 + 1.5*luck,
  epic:       4 + 0.8*luck,
  legendary:  1 + 0.2*luck,
}   // normalised to sum 1
```

- AC-4.1 At `luck = 0` the distribution is exactly `{60, 25, 10, 4, 1}/100`.
- AC-4.2 At `luck = 10`, legendary probability is strictly greater than at `luck = 0`, and common strictly lower.
- AC-4.3 Weights never go negative; at `luck = 30` common is 0 and the remainder still normalises to 1.0 ± 1e-9.
- AC-4.4 Over 100,000 seeded draws at `luck = 0`, observed legendary frequency is within ±0.15pp of 1.0%.
- AC-4.5 Rarity multiplies the effect magnitude by `{1.0, 1.3, 1.7, 2.2, 3.0}` respectively.

**FR-5 Waves and escalation.**
Spawn rate and enemy HP/damage scale on a published curve, defined in data, not code.

- AC-5.1 `spawnRate(t)` is monotonically non-decreasing over `t ∈ [0, 900s]`.
- AC-5.2 `enemyHp(t) = baseHp * (1 + 0.08*t_minutes)^1.6`; at t=0 the multiplier is exactly 1.0.
- AC-5.3 Live enemy count is hard-capped at `MAX_ENTITIES = 2000`; spawns beyond the cap are dropped, not queued, and the sim does not degrade.
- AC-5.4 A boss spawns at t = 300s and again at t = 600s. The run ends at t = 900s with a final boss encounter.

**FR-6 Run termination.**
A run ends on player death or at t = 900s. Both produce a `RunSummary`.

- AC-6.1 `RunSummary` contains: outcome, seed, duration, kills, level reached, gold earned, silver earned, items held, quest deltas.
- AC-6.2 The summary is derivable *purely from the event log*, with no access to live sim state. (This is what lets the harness and the MCP server produce it identically.)

### 6.2 Movement

**FR-7 Movement.** 8-directional movement on a 2.5D plane at `moveSpeed` units/s, normalised so diagonal speed equals cardinal speed.

- AC-7.1 Holding up+right for 1.0s displaces the player exactly `moveSpeed` units, not `moveSpeed * √2`.
- AC-7.2 Movement into an impassable tile slides along the obstacle rather than stopping dead.
- AC-7.3 The player cannot leave the map bounds.

**FR-8 Elevation (data only, v1).** Tiles carry a `height` value. Height blocks line-of-sight for ranged enemies and applies a movement-cost multiplier. No jumping, climbing, or traversal abilities in v1.

- AC-8.1 A ranged enemy with a height-2 tile on the segment to the player does not fire.
- AC-8.2 Moving onto a tile one step higher costs 1.5× the movement time.

### 6.3 Build systems

**FR-9 Stat composition.** *This is the highest-risk correctness area in the genre and is specified explicitly.*

Every stat resolves in a fixed four-phase order:

1. **Base** — from character + level
2. **Flat additive** — all `+N` modifiers summed
3. **Multiplicative** — all `×M` modifiers multiplied together
4. **Clamp** — per-stat floor/ceiling

```
final = clamp(  (base + Σ flat)  *  Π mult  )
```

- AC-9.1 Base 100, two `+10` flats, two `×1.2` mults → `(100+20) * 1.44 = 172.8`. Not 168, not 176.4.
- AC-9.2 Modifier application order does not affect the result: 100 shuffled permutations of the same modifier set yield bit-identical output.
- AC-9.3 `attackSpeed` is clamped to `[0.1, 20.0]`; `moveSpeed` to `[0.5, 30.0]`; `critChance` to `[0, 1]`.
- AC-9.4 Removing a modifier restores the exact prior value — modifiers are never applied destructively to the base.
- AC-9.5 Recomputation is cached and invalidated on modifier-set change; the cached value always equals the freshly computed one (property test).

**FR-10 Weapons.** 3 in v1, each with distinct behaviour (melee arc, projectile, orbital). Each has 5 levels.
- AC-10.1 Each weapon level increases damage by exactly the value in its data table.
- AC-10.2 A weapon at level 5 is excluded from the offer pool (see AC-3.2).

**FR-11 Tomes (passives).** 4 in v1: crit chance, attack speed, defence, Luck. Each stacks to 5.
- AC-11.1 Stacked tomes contribute as flat or multiplicative modifiers per their declared `modKind`, consistent with FR-9.

**FR-12 Items.** 8 in v1, including at least 2 with an explicit pairwise synergy (a conditional modifier that activates only when another item is held).
- AC-12.1 A synergy item's bonus is absent when its partner is not held, and present when it is, verified in the same test run.
- AC-12.2 Every item in `packages/content` validates against the item JSON schema; CI fails on any that does not.

### 6.4 In-run economy

**FR-13 Gold.** Dropped by enemies and chests, auto-collected, spent at merchants.
- AC-13.1 Gold is never negative. A purchase with insufficient gold is rejected and mutates nothing.
- AC-13.2 Merchant stock is drawn from the `loot` stream and is stable for a given seed and spawn index.

**FR-14 Chests and shrines.** Chests give a curated 3-choice item pick. Shrines give a timed buff with a cost.
- AC-14.1 A shrine buff expires at exactly its declared duration in sim-ticks, not wall-clock time.
- AC-14.2 Re-triggering an active buff refreshes duration rather than stacking, unless the buff declares `stackable: true`.

### 6.5 Meta-progression

**FR-15 Silver and save file.** Silver is earned per run as `floor(kills/10) + level*2 + (survived ? 50 : 0)` and persisted to `./save/profile.json`.
- AC-15.1 Silver awarded is a pure function of the `RunSummary`.
- AC-15.2 Save/load round-trips to a deeply-equal profile.
- AC-15.3 A corrupt or unparseable save file produces a fresh default profile plus a warning, never a crash. *(No integrity/anti-tamper checking — this is a local single-player game and the previous draft's anti-tamper requirement is cut as pure overhead.)*
- AC-15.4 A save written by schema version N is migrated or rejected explicitly; it is never silently misread.

**FR-16 Meta-unlocks.** 3 in v1: +1 upgrade reroll, +1 weapon slot, +5 starting Luck.
- AC-16.1 Purchasing deducts silver and persists atomically; an interrupted write leaves the prior profile intact (write-temp-then-rename).
- AC-16.2 Unlocks are applied at run start and are visible in the initial `GameState`.

**FR-17 Quests.** 12 objectives evaluated against the event log after each run.
- AC-17.1 Quest evaluation is a pure function of `(profile, RunSummary)`.
- AC-17.2 Progress is monotonic — a bad run never reduces quest progress.

### 6.6 UX / UI

**FR-18 HUD.** Displays HP, XP bar, level, timer, gold, kills, and active weapons/tomes/items with stack counts.
- AC-18.1 Every value shown is read from the sim snapshot; the HUD holds no independent state.

**FR-19 Upgrade screen.** 3 cards with rarity colour, name, and concise effect text; reroll button if unlocked.
- AC-19.1 Rarity is conveyed by **colour *and* a distinct shape/icon *and* a text label** — colour alone fails the accessibility requirement (NFR-3).
- AC-19.2 The sim is paused while the offer is open; zero ticks elapse.

**FR-20 Run summary.** Shows the `RunSummary` plus quest deltas and silver earned.

**FR-21 Agent overlay.** When an agent is attached in advisor mode, the UI shows its recommended pick and a one-line rationale, and marks the recommended card. The human always decides.
- AC-21.1 With no agent attached, the overlay is absent and the game plays identically (same seed → same result).
- AC-21.2 An agent that never responds does not block the upgrade screen; the overlay shows a pending state and the human can pick freely.

### 6.7 MCP server

*Entirely absent from the previous draft despite being a stated constraint.*

**FR-22 Transport and lifecycle.** The MCP server runs over **stdio** (standard for local MCP clients) and is started by `npm run mcp`. `npm start` starts the game and the MCP server together; `npm run start:game` starts the game alone.

- AC-22.1 The server completes the MCP initialise handshake and lists its tools.
- AC-22.2 Killing the MCP server does not crash or stall the running game.
- AC-22.3 The server binds to loopback only; no external network listener is opened.

**FR-23 Attachment model.** The MCP server connects to a running game over a local IPC channel, or, with `--headless`, owns its own sim instance with no renderer. Same tool surface either way.

- AC-23.1 The identical tool-call sequence against a headless server and an attached live game produces the same terminal state for the same seed and no human input.

**FR-24 Tools.** Read and write tools are explicitly separated so an advisor-only agent can be run with write tools disabled.

*Read tools:*

| Tool | Returns |
|---|---|
| `get_state` | Compact observation: player stats, position, HP/XP/level/gold, nearby enemies (capped, nearest-first), active buffs, held items, timer, pending offer |
| `get_offer` | The pending 3-option upgrade offer with full effect text, or null |
| `get_build` | Current weapons/tomes/items with levels and resolved stats |
| `get_events` | Structured event log since a supplied cursor |
| `get_run_summary` | Summary of the last completed run |

*Write tools (disabled in advisor mode):*

| Tool | Effect |
|---|---|
| `start_run` | Begins a run with an optional seed and character |
| `set_intent` | Sets a movement intent (direction vector, or "kite nearest", "collect nearest orb", "approach merchant") that persists until changed |
| `choose_upgrade` | Resolves the pending offer by index |
| `reroll_offer` | Consumes a reroll if available |
| `buy` | Purchases a merchant item by index |
| `step` | *Headless only.* Advances N sim ticks. Rejected against a live game. |

*Advisor tool (always available):*

| Tool | Effect |
|---|---|
| `advise` | Posts a recommendation + rationale to the human's UI overlay. Never mutates sim state. |

- AC-24.1 Every tool has a declared JSON schema; malformed arguments return a structured MCP error, never an exception or a crash.
- AC-24.2 `choose_upgrade` with no offer pending returns an error and mutates nothing.
- AC-24.3 `choose_upgrade` with an out-of-range index returns an error and mutates nothing.
- AC-24.4 In advisor mode, every write tool is absent from `tools/list` — not merely rejected at call time.
- AC-24.5 `get_state` never exposes information the human player cannot see (unspawned waves, future offers, the raw RNG state), and is additionally filtered by the perception handicap of FR-27. The agent's observation is a subset of what is on the human's screen — never a superset.
- AC-24.6 `get_state` response is < 8 KB at 2000 live entities — the nearby-enemy list is capped at 24.

**FR-25 Latency and the tick model.** *The question the previous draft never asked.*

The simulation **does not wait for the agent**. `set_intent` is level-triggered: the intent persists until replaced, so a slow agent yields stale-but-valid behaviour rather than a stalled character. The one exception is the upgrade offer, which pauses the sim for both human and agent alike (FR-19), with a configurable timeout.

- AC-25.1 An agent that takes 3 s to respond to `get_state` does not cause the human's game to drop a frame.
- AC-25.2 An intent set at tick T applies from tick T+1 and persists until changed or the run ends.
- AC-25.3 In autonomous mode, an upgrade offer left unanswered for `offerTimeoutMs` (default 30 s) auto-picks option 0 and logs the timeout.
- AC-25.4 Actions arriving after run end are rejected with a clear error.

**FR-26 Autonomous mode.** `npm run agent:auto -- --seed=N` drives a full headless run via the MCP tool surface and prints a `RunSummary`.
- AC-26.1 A scripted baseline policy (always pick option 0, kite nearest enemy) completes a full 900 s run without error.
- AC-26.2 The same policy + same seed produces an identical summary across runs. *This makes the agent path itself a regression test.*

### 6.8 Agent parity handicap

*Resolves open question #1 of the previous revision: the agent is deliberately degraded to
human-comparable capability. The goal is an agent that plays **like a good player**, not one that
wins by reading state at 60 Hz with perfect global vision and frame-perfect reactions.*

Two principles govern the whole section:

1. **Everything is measured in sim ticks, never milliseconds of wall clock.** A wall-clock reaction
   delay would make the agent path non-deterministic and destroy AC-26.2 and the golden-run corpus.
   Latencies are declared in ms in config purely for human readability and converted to an integer
   tick count at run start (`ticks = round(ms / 16.667)`).
2. **The handicap lives in the observation/action boundary, never in `packages/sim`.** The
   simulation has no concept of "agent" or "handicap"; it only ever sees an `InputFrame`. The
   handicap is a filter applied by `packages/mcp` on the way out and a queue applied on the way in.
   This keeps the sim pure (ARCH-1) and lets the same simulation serve a human, a handicapped agent,
   and an unhandicapped debug agent identically.

**FR-27 Perception handicap.**

| Constraint | v1 default | Rationale |
|---|---|---|
| Observation delay | 12 ticks (200 ms) | Human visual→motor reaction time. `get_state` returns the snapshot from `currentTick − 12`, not the live one. |
| Observation rate | 30 Hz (every 2nd tick) | The agent cannot sample faster than a human perceives distinct frames; repeat calls within the same window return the same cached snapshot. |
| Vision | On-screen only — entities inside the camera viewport, plus a 10% margin | A human cannot see off-screen enemies. Global awareness is the single largest source of superhuman play. |
| Enemy HP | Bucketed to 5 levels (`full`, `high`, `mid`, `low`, `critical`) | The human sees a health bar, not an integer. Exact HP is exposed **only** for bosses, which display a numeric bar. |
| Position precision | Quantised to the render pixel grid (0.25 world units) | The human reads positions off a rasterised screen. |
| Enemy intent | Not exposed. No `nextAttackTick`, no velocity vector, no AI state | A human infers these from animation; the agent must infer them from successive snapshots too. |
| Off-screen audio cues | A coarse directional hint only (8 compass sectors, no distance) | Matches what the SFX layer conveys. |

- AC-27.1 `get_state` at tick 1000 returns data identical to a snapshot captured at tick 988. An enemy spawned at tick 995 is absent from that response.
- AC-27.2 Two `get_state` calls within the same 2-tick observation window return byte-identical payloads, and the second does not advance any cursor.
- AC-27.3 An enemy outside the camera viewport + 10% margin is absent from `get_state.enemies`, even when within weapon range.
- AC-27.4 A non-boss enemy at 47/100 HP reports `hpBucket: "mid"` and carries no numeric `hp` field at all — the field is absent, not zeroed, so a policy cannot accidentally read 0.
- AC-27.5 A boss reports exact `hp` and `maxHp`.
- AC-27.6 All reported positions are exact multiples of 0.25.
- AC-27.7 No key anywhere in the `get_state` payload matches `/velocity|intent|nextAttack|aiState|seed|rng/i`. Enforced as a schema test over a full recorded run, not a spot check.
- AC-27.8 The delayed-snapshot buffer costs O(delayTicks) memory and is capped; at 2000 entities and 12 ticks of delay it stays under 4 MB.

**FR-28 Actuation handicap.**

| Constraint | v1 default | Rationale |
|---|---|---|
| Action delay | 5 ticks (~83 ms) | Decision→keypress→engine latency. An action submitted at tick T applies at T+5. |
| Intent change rate | ≤ 8 per second | A human cannot meaningfully redirect more often than this. Excess calls are rejected, not queued — queueing would let an agent bank a burst. |
| Movement granularity | 8 compass directions only | Matches the keyboard's actual expressive range (FR-7). No arbitrary-angle vectors. |
| Upgrade decision floor | ≥ 30 ticks (500 ms) on the offer screen before `choose_upgrade` is accepted | A human must at least read three cards. Prevents instant-optimal picking. |
| Aim | Not available | Attacks are automatic (FR-1); there is no aim channel for either player. Listed for completeness so no one adds one for the agent alone. |

- AC-28.1 `set_intent` at tick 100 leaves the player's movement unchanged through tick 104 and takes effect at tick 105.
- AC-28.2 A 9th `set_intent` within one second is rejected with a structured rate-limit error; the 8 accepted ones all applied, and the rejection mutates nothing.
- AC-28.3 An intent vector of `(0.31, 0.95)` is snapped to the nearest of the 8 compass directions; a policy cannot express a 17° heading.
- AC-28.4 `choose_upgrade` called 20 ticks after the offer opened is rejected with a "too early" error and the offer remains pending; the same call at tick 30 succeeds.
- AC-28.5 With the handicap active, a full autonomous run remains deterministic: same seed + same policy → identical `RunSummary` across 100 executions.

**FR-29 Handicap configuration and disclosure.**

The handicap is a named profile, not scattered constants, and which profile ran is **recorded in the
run summary**. Comparing a handicapped run against an unhandicapped one otherwise silently poisons
every balance conclusion.

Profiles: `human-parity` (the FR-27/FR-28 defaults, the shipped default), `unrestricted` (all
filters off — for debugging the sim and for deliberately measuring the performance ceiling), and
`custom` (explicit overrides).

- AC-29.1 `RunSummary` carries `agentProfile` and the fully-resolved handicap parameters. A run driven by a human records `agentProfile: null`.
- AC-29.2 The default profile when none is specified is `human-parity`. `unrestricted` must be requested explicitly, by name, on the command line — never reachable by omitting a flag.
- AC-29.3 Starting a run under `unrestricted` emits a `run_start` event with `handicap: "unrestricted"` and prints a one-line warning to stderr.
- AC-29.4 The balance harness refuses to aggregate runs across differing profiles and errors out naming the mismatch, rather than averaging them.
- AC-29.5 Advisor mode applies the FR-27 perception handicap to `get_state` too — an advisor with global vision and zero delay is a wallhack with extra steps, and its advice would be unreachable for the human acting on it.

**FR-30 Parity validation.** The claim "comparable to a human" is measured, not asserted.

- AC-30.1 A recorded corpus of ≥ 10 human runs (seed + input log, committed) establishes a baseline median duration and median level reached.
- AC-30.2 The baseline policy under `human-parity` lands within ±25% of the human median duration over the same 20 seeds. A result far above the band is a handicap leak and fails CI; far below means the policy or the handicap needs work and is reported, not failed.
- AC-30.3 The same policy under `unrestricted` performs measurably better than under `human-parity`. If it does not, the handicap is not actually binding and the test fails — this is the check that catches a handicap silently wired to a no-op.


---

## 7. Non-functional requirements

**NFR-1 Determinism.** Restated as a top-level NFR because everything depends on it. Enforced by lint rule, CI grep, and a 1000-seed replay suite.

**NFR-2 Performance.** Budgets per §2.3, enforced as CI benchmarks that fail the build on a >20% regression versus the committed baseline. "Stable 60 FPS" is not a requirement; a measured sim-step budget is.

**NFR-3 Accessibility.** Rarity conveyed by colour + shape + text (AC-19.1). UI text scalable to 150% without clipping. Full keyboard play; no mouse-only action. No flashing above 3 Hz.

**NFR-4 Reliability.** An unhandled exception in the renderer or the MCP server must not corrupt the save file or the in-progress run. Save writes are atomic (temp + rename).

**NFR-5 Portability.** Node ≥ 20, any modern browser. No native modules, no build step required to *run* (`npm start` may build, but must not require a preinstalled toolchain beyond Node).

**NFR-6 Localisation.** All player-facing strings live in a single catalogue from day one. English only in v1; adding a language must require no code change.

**NFR-7 Security.** Loopback-only MCP binding. No remote telemetry. The save file is plain readable JSON — deliberately, since anti-tamper on a local single-player game protects nothing.

---

## 8. Local event log (replaces remote analytics)

The previous draft specified opt-in telemetry to a backend. For a locally-run game that is overhead with no consumer. It is replaced by a **structured local event log**, which serves four purposes at once:

1. Agent observation feed (`get_events`)
2. Test assertions (integration tests assert on emitted events, not on internal state)
3. Run summary derivation (AC-6.2)
4. Balance analysis via the harness

Events: `run_start`, `run_end`, `level_up`, `offer_presented`, `offer_resolved`, `damage_dealt`, `damage_taken`, `enemy_killed`, `boss_killed`, `item_acquired`, `gold_gained`, `gold_spent`, `chest_opened`, `shrine_used`, `quest_progress`, `unlock_purchased`, `agent_advice`, `agent_action`.

- AC-8.1 Every event carries `tick`, `type`, and a typed payload.
- AC-8.2 The log is append-only and replaying it reconstructs the `RunSummary` exactly.
- AC-8.3 Logs are written under `./logs/` and never leave the machine.

---

## 9. Test strategy

TDD is a stated constraint, so the pyramid is specified rather than assumed. **Red-green-refactor throughout: no production code is written without a failing test that demands it.**

**Layer 1 — unit (fast, the bulk).** Pure functions in `packages/sim`: `xpForLevel`, `rarityWeights`, stat composition, targeting, damage. Run in milliseconds; run on every save.

**Layer 2 — property-based.** Invariants that must hold for all inputs (fast-check):
- Stat composition is order-independent (AC-9.2)
- HP never exceeds max HP; gold never negative
- Entity count never exceeds `MAX_ENTITIES`
- RNG streams are independent (AC-2/§5.2)
- Serialise → deserialise → step ≡ step (state is fully captured)

**Layer 3 — deterministic integration.** Full seeded runs executed headless in Node, asserting on the event log. A **golden-run corpus**: ~20 committed seeds with their expected terminal state hash. Any unintended balance or logic change breaks these loudly — and when a change is *intended*, the diff in the goldens is the review artifact.

**Layer 4 — MCP contract tests.** Every tool exercised for happy path, malformed arguments, wrong-phase calls (choose an upgrade with no offer), and mode gating (write tools absent in advisor mode).

**Layer 5 — smoke.** A minimal Playwright test that `npm start` serves, the canvas renders, and a key press moves the player. Deliberately thin — rendering is not where the bugs are.

**CI gate:** layers 1–4 on every push; coverage thresholds per §2.3; determinism suite; benchmark regression check; content-schema validation; the no-`Math.random`-in-sim grep.

---

## 10. Milestones

Risk-ordered, not content-ordered. The previous draft's M1 ("core loop + one biome + a boss") bundles the highest-risk architectural work with content and would produce an untestable codebase.

| M | Deliverable | Exit criteria |
|---|---|---|
| **M0 Foundation** | Monorepo, TypeScript, vitest, lint, CI, `npm start` serving an empty canvas | CI green on an empty project; `npm start` works on a clean clone |
| **M1 Deterministic core** | `step()`, seeded RNG streams, entity store, state serialisation. **No rendering, no content.** | 1000-seed determinism suite passes; serialise→step round-trip property holds |
| **M2 Combat loop** | Movement, targeting, damage, death, XP, levelling, offers, rarity/Luck | FR-1..FR-4 acceptance criteria pass headless; still no renderer |
| **M3 Renderer** | Canvas view, HUD, input, upgrade screen | Playable by a human; same seed + same inputs → same result as headless |
| **M4 MCP server** | Tool surface, advisor overlay, autonomous mode, human-parity handicap | FR-22..FR-29 pass; baseline policy completes a full run under `human-parity`; agent path is in CI. FR-30 parity validation lands in M6, once a human baseline corpus exists to measure against. |
| **M5 Content + economy** | 3 weapons, 4 tomes, 8 items, 6 enemies, boss, gold, merchant, chests, shrines | Content schema validation green; golden-run corpus established |
| **M6 Meta + polish** | Silver, save file, 3 unlocks, 12 quests, run summary, accessibility pass, human baseline corpus | Full acceptance suite green incl. FR-30 parity validation; coverage and perf targets met |

M1 and M2 shipping with no renderer is intentional and is the point of the whole plan: the simulation must be provably correct before anything draws it.

---

## 11. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Determinism leaks in (a stray `Math.random`, a `Date.now`, iteration over a hash-ordered structure) | Replay, tests, and the agent path all silently rot | Lint rule + CI grep + 1000-seed suite; entity iteration always by sorted ID |
| Scope creep back toward the 20-character / 240-quest roster | Nothing ships | Content is data; the roster is an authoring backlog, explicitly out of v1 |
| Performance collapse at high entity counts | Unplayable late run | Entity cap, spatial hash for neighbour queries, typed-array hot paths, CI benchmark gate |
| Agent latency degrades the human's experience | The headline feature makes the game worse | Level-triggered intents (FR-25); agent never on the critical path except the already-paused offer screen |
| Stat composition ambiguity produces "balance bugs" no one can reproduce | Endless debugging | FR-9 fixes the order explicitly; property test proves order-independence |
| Golden-run tests become noisy and get ignored | The main safety net is abandoned | Keep the corpus small (~20 seeds); a goldens diff is a required review artifact, not a rubber stamp |
| RNG frustration for the player (carried over from the original draft — a real risk) | Runs feel unearned | Luck floor, rerolls as an early unlock, no-duplicate guarantee (AC-3.1) |

---

## 12. Open questions

Build questions, not publisher questions.

1. **Handicap defaults** — are the FR-27/FR-28 numbers (200 ms observation delay, 30 Hz sampling, 8 intent changes/s, 500 ms decision floor) right? They are first-principles estimates from human reaction-time literature, and AC-30.2 is the instrument that will tell us. Expect to tune them once the human baseline corpus exists.
2. **Offer timeout default** — is 30 s right for autonomous mode, and should advisor mode have any timeout at all?
3. **Replay artifact** — ship replays as `seed + input log` (tiny, requires identical build) or as periodic state snapshots (robust across versions, much larger)?
4. **Elevation** — is the data-only elevation of FR-8 worth its complexity in v1, or should it be cut entirely and reintroduced with a real 3D renderer?
5. **Run length** — 900 s is inherited from the genre. Is 15 minutes right for a prototype whose runs will mostly be executed by the test harness?

---

## Appendix A: Changes from the previous draft

| Removed | Why |
|---|---|
| All citations to reviews/store pages of the commercial game | A market-research artifact, not a spec; also a trademark exposure |
| Steam, Steam Cloud, Deck verification, native Windows/Linux builds | Contradicts the `npm start` constraint |
| Save anti-tamper / integrity checks | Protects nothing in a local single-player game |
| Remote analytics and business KPIs (retention, refund rate, conversion) | No backend, no store, no consumer for the data |
| 20 characters / 70+ items / 240+ quests / 2 biomes × 3 tiers | Years of content work; reframed as a data-driven authoring backlog |
| True 3D, jump/slide/climb, "sword surf", "microwaves" | Undefined mechanics and a large cost multiplier; 2.5D for v1 |
| Multiplayer framing of the agent | Agent is advisor + autonomous solo player; no multi-entity sim needed |

| Added | Why |
|---|---|
| §5 architecture, ARCH-1 simulation contract, ARCH-2 seeded RNG | Without these, TDD is impossible |
| Numeric acceptance criteria on every requirement | Nothing in the previous draft was testable |
| §6.3 FR-9 explicit stat composition order | The hardest correctness problem in the genre, previously unaddressed |
| §6.7 the entire MCP section | A stated constraint with zero prior coverage |
| FR-25 agent latency and tick model | The unasked question that determines whether the feature is usable |
| §6.8 FR-27..FR-30 agent parity handicap | Degrades the agent to human-comparable perception and actuation, in ticks so determinism survives; includes the measured-parity tests that prove the handicap actually binds |
| §8 local event log replacing telemetry | One mechanism serving agent, tests, summary, and balance |
| §9 test strategy | TDD was asserted but never planned |
| §10 risk-ordered milestones | Previous ordering bundled architecture with content |
