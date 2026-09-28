# Megabonk

A 2.5D roguelike survival game — "bullet heaven": your character auto-attacks, you
control movement, positioning and build decisions against escalating waves.
Runs locally in the browser, ships with an MCP server so an AI agent can advise
you or play autonomously under a human-parity handicap.

Built test-first. See [`docs/PRD.md`](docs/PRD.md) for the specification; every
requirement there carries numbered acceptance criteria, and the tests are named
after them.

## Quick start

```bash
npm install
npm start          # http://127.0.0.1:5173
```

Other entry points:

```bash
npm test                      # the whole suite
npm run ci                    # purity check + typecheck + tests (what CI runs)
npm run coverage              # coverage against the thresholds in vitest.config.ts
npm run mcp                   # the MCP server, over stdio
npm run agent:auto -- --seed=1 # a full headless run driven by an agent policy
npm run agent:live             # attach an agent to the game in your browser
npm run bridge                 # the co-play bridge on its own
npm run bench                 # performance budgets
```

## How it is put together

```
packages/
  sim/        the deterministic simulation — pure, headless, no renderer
  content/    all balance numbers as data, plus a schema validator
  meta/       silver, unlocks, quests, save-file handling
  client/     canvas renderer, HUD, screens, input
  mcp/        MCP server and the agent perception/actuation handicap
  bridge/     the loopback co-play bridge between the page and an agent
  harness/    headless driver, determinism sweep, golden runs, benchmarks
  balance/    balance analysis tooling and design tests
```

### The one architectural rule

```ts
step(state: GameState, inputs: InputFrame, dtMs: number): GameState
```

The simulation is a **pure function**. It is deterministic, runs on a fixed 60 Hz
timestep, takes and returns plain JSON-compatible data, and has no dependency on
any renderer. Four consequences follow, and they are why the rest of the project
works at all:

- **It is testable.** The whole game runs headless in Node, so gameplay is covered
  by ordinary unit and property tests instead of by playing it.
- **It is replayable.** A seed plus an input log reproduces a run exactly.
- **An agent can drive it.** State is serialisable, so it crosses a process
  boundary to the MCP server unchanged.
- **Balance is reviewable.** Retuning is a data change plus a golden-run diff.

Everything that threatens those properties is blocked mechanically rather than by
convention: `npm run check:purity` fails the build if anything under
`packages/sim` reaches for `Math.random`, `Date.now`, `performance.now`, the DOM
or `process`, and the RNG state is carried inside `GameState` rather than living
in a module variable.

Two details worth knowing before you read the code:

- **RNG streams are labelled and independent** (`loot`, `spawn`, `crit`,
  `upgradeOffer`, `mapgen`). Changing how many crit rolls happen must not shift
  which items drop, or every balance test becomes fragile.
- **Stat modifiers resolve in a fixed order**: `clamp((base + Σ flat) × Π mult)`,
  applied in a canonical modifier order. The canonical order is not fussiness —
  IEEE-754 addition is not associative, so permutation-independence cannot be met
  by iterating the caller's array however the arithmetic is written.

### Playing alongside an agent

The agent and the game are separate processes that meet over a tiny loopback
bridge, so you can hand over as much or as little as you like:

```bash
npm start                              # terminal 1: the game
npm run agent:live                     # terminal 2: an advisor
npm run agent:live -- --autonomous     # ...or let it play
```

Advisor mode posts a recommendation to a panel on your screen and never touches
the controls. Autonomous mode drives, but your keys always win: press a movement
key and you have it back that frame. The bridge is entirely optional — with
nothing listening, every poll fails quietly and the game is exactly the game it
was, which is asserted rather than assumed.

The page publishes its state RAW and the handicap is applied on the way out to
the agent, in `packages/mcp`. That is deliberate: filtering at the source would
let the client decide what an agent may see, and would make the unrestricted
debug profile impossible.

### The agent handicap

The MCP agent is deliberately degraded to human-comparable capability: a 200 ms
observation delay, 30 Hz sampling, on-screen vision only, bucketed enemy HP,
quantised positions, an ~83 ms action delay, capped intent changes, and a decision
floor on the upgrade screen. All of it measured in **sim ticks, not wall clock** —
a real-time delay would make the agent path non-deterministic and take the golden
corpus with it. The handicap lives at the observation/action boundary in
`packages/mcp`, never in the simulation, so one sim serves a human, a handicapped
agent and an unhandicapped debug agent identically.

See PRD §6.8 (FR-27..FR-30) for the parameters and the tests that prove the
handicap actually binds.

## Contributing

Tests first. A change to `packages/sim` that alters behaviour will move the
golden-run corpus — that diff is the review artifact, not an inconvenience.
