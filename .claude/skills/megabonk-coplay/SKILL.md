---
name: megabonk-coplay
description: Watch and/or play Megabonk (Hollowlight) live in the user's browser via the co-play bridge HTTP API. Use when the user says things like "play megabonk with me", "watch my run and advise me", "take control and play for me", or asks to attach to a running game after starting `npm run bridge` and the browser game. Not for headless/simulation testing — that goes through the MCP server / vitest, not this bridge.
---

# Megabonk co-play (live bridge)

Megabonk's browser game can publish its live state to a tiny local HTTP
"bridge" server, and read back either **advice** (shown on the player's
screen, never applied) or an **intent** (actually moves the character,
only once the human hands over control). There is no MCP tool wired to
this yet — it's a raw loopback HTTP API. Drive it directly with `curl`
or a short script.

## Prerequisites (the user does these, not you)

1. `npm run bridge` — starts the bridge on `http://127.0.0.1:7391` (loopback only).
2. `npm run start` — starts the Vite dev server for the game itself; the
   user opens it in their browser and starts a run.

Until the user has actually started a run in the browser, `/state` will
return `snapshot: null`. Don't loop forever waiting — check once, tell
the user what you see, and let them tell you when they've started.

## Bridge API (base `http://127.0.0.1:7391`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | `{ ok, clientConnected, stateVersion, adviceVersion, intentVersion }` — `clientConnected` tells you whether a browser tab is actually publishing. |
| `/state` | GET | `{ snapshot: GameState \| null, version }` — full unfiltered live state. |
| `/advice` | GET/POST | Advisory payload rendered on the player's screen. Never moves the character. |
| `/intent` | GET/POST | Movement/choice payload. Only takes effect while `control: true` is set AND the human isn't pressing movement keys (human input always wins). |

Poll, don't hammer: the game publishes state at ~10 Hz. Checking every
~200-500ms is plenty; there's nothing new to react to between publishes
(compare `version` to the last one you saw).

### Reading state

```bash
curl -s http://127.0.0.1:7391/state | node -e "process.stdin.once('data',d=>console.log(JSON.stringify(JSON.parse(d).snapshot,null,2)))"
```

Key fields on `snapshot` (from `@megabonk/sim`'s `GameState`):
- `player.pos {x,y}`, `player.hp`, `player.level`, `player.xp`, `player.gold`
- `player.weapons[]`, `player.items[]` — current build
- `enemies[]`, `pickups[]`, `projectiles[]` — nearby world objects
- `offer` — non-null when an upgrade choice is pending (has `.options[]`)
- `tick`, `phase` (`'playing' | 'ended'`), `outcome`

### Advising only (safe default — never touches their controls)

```bash
curl -s -X POST http://127.0.0.1:7391/advice \
  -H 'content-type: application/json' \
  -d '{"advice":{"status":"ready","headline":"Break the ring","rationale":"8 enemies closing from the east; go west through the gap.","move":{"x":-1,"y":0}}}'
```

`move` here is just illustrative — it is NOT applied, only shown.

### Taking control (only when the user explicitly asks you to play)

You must set `control: true`. `move.x`/`move.y` are each in `[-1, 1]`
(same shape as keyboard input — e.g. `{x:1,y:0}` = east, `{x:0.7,y:-0.7}`
≈ north-east). **The human can always take control back instantly** by
pressing a movement key, so this is safe to use.

```bash
# take over and move east
curl -s -X POST http://127.0.0.1:7391/intent \
  -H 'content-type: application/json' \
  -d '{"intent":{"control":true,"move":{"x":1,"y":0}}}'

# pick upgrade option index 0 when state.offer is non-null
curl -s -X POST http://127.0.0.1:7391/intent \
  -H 'content-type: application/json' \
  -d '{"intent":{"control":true,"chooseIndex":0}}'

# reroll the current offer
curl -s -X POST http://127.0.0.1:7391/intent \
  -H 'content-type: application/json' \
  -d '{"intent":{"control":true,"reroll":true}}'
```

### Always release control when you stop

Leaving the browser stuck under agent control after you're done is the
one real failure mode here. When the user says stop, or you're ending
the session, ALWAYS send:

```bash
curl -s -X POST http://127.0.0.1:7391/intent -H 'content-type: application/json' -d '{"intent":{"control":false}}'
curl -s -X POST http://127.0.0.1:7391/advice  -H 'content-type: application/json' -d '{"advice":null}'
```

## Play loop pattern

1. GET `/state`. If `snapshot === null` or `phase === 'ended'`, say so and wait.
2. If `version` unchanged since last check, sleep briefly and re-poll — nothing new happened.
3. Otherwise read `player`, `enemies`, `offer`, decide one action.
4. If advising: POST `/advice` with a short headline + rationale.
   If playing: POST `/intent` with `control:true` and `move`/`chooseIndex`/`reroll`.
5. Repeat. Narrate what you're seeing/doing to the user in plain language every
   few cycles — don't just silently loop.
6. On offer (`state.offer !== null`): stop moving-decisions for a beat and
   pick/reroll instead — the game pauses movement usefulness while an offer is open.
7. When told to stop, or the run ends (`phase === 'ended'`), release control (above).

## Advisor vs autonomous — ask if unclear

Default to **advisor mode** (advice only, never `control:true`) unless the
user explicitly asks you to take over and play. If ambiguous, ask.
