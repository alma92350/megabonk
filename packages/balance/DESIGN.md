# Megabonk — balance and game-feel design

Everything here is measured, not asserted. `npx tsx packages/balance/src/cli.ts 8 900`
reproduces every number; `npx vitest run packages/balance` fails if any of it drifts.

## 1. The two sim facts that determine every number

1. **Incoming damage is capped, not summed.** `applyEnemyContact` takes the
   *maximum* damage among touching enemies and then sets 30 ticks of
   invulnerability, which enemy projectiles share. So incoming DPS is
   `2 * (worstDamage - armour)` with a 1-damage floor — never the sum of a swarm.
   Consequence: enemy `damage` decides how expensive one mistake is; enemy `speed`
   and `hp` decide how often you make one; and **armour is the strongest defensive
   stat in the game** because flat reduction against a 2 Hz cap is enormous.
2. **A melee swing re-targets per hit.** `runWeapons` re-selects the nearest living
   enemy for every one of `targets` hits, so a wide arc clears the perimeter at
   `targets / cooldown` kills per second regardless of how the crowd is shaped.
   Arc `range` × `targets` is the dominant lever in the roster, not `damage`.

## 2. Pacing intent, per segment (900 s run)

| Segment | Authored rate | Roster added | Intent |
|---|---|---|---|
| 0–180 s **LEARN** | 2.4 → 3.6/s | Grunt, Runner, **Lobber** | 3–4 damage a hit against 145 HP. A novice who never reacts survives. |
| 180–360 s **COMMIT** | 3.6 → 4.2/s | Brute, Stalker | Stalker (3.1) outruns an unbooted player: mobility-or-armour is forced. Boss at 300 s. |
| 360–540 s **SQUEEZE** | 4.2 → 4.8/s | Hulk, **Seer** | Enemy HP is up 2.2×. A build that has not started multiplying loses ground here. This is where runs end. |
| 540–720 s **HOLD** | 4.8 → 5.8/s | — | Boss at 600 s. Needs a maxed weapon plus two multiplier lines. |
| 720–900 s **BURN** | 6.8/s authored, ~11.5/s after the in-phase ramp | — | Pure throughput check, final boss at 870 s. |

`spawnRateAt` adds +35 %/minute *inside* each phase, so the authored numbers are
floors and the real curve is smooth. Authored rates are monotonically
non-decreasing because AC-5.1 depends on it, and the validator enforces it.

## 3. Problem 1: standing still took zero damage

**Diagnosed, not guessed.** At the old tuning the Bonker was 14 damage / 3 targets /
26-tick cooldown = 6.9 kills per second against 12 HP grunts, against an opening
spawn rate of 1.4/s — a **5× throughput surplus** — and its 3.2-unit range against
a 0.9-unit contact distance left a 2.3-unit moat a 2.2 u/s grunt needed 1.05 s
(two full swings) to cross. Knockback was irrelevant: 6 stagger ticks out of a
26-tick cycle. Standing still was safe by a wide margin, not by a hair.

The first fix attempt was to starve the arc (range 2.4, 2 targets, grunt HP above
per-hit damage). It worked and it was **wrong**: it made the game a knife-edge
throughput race in which the reference kiting policy died at 149 s median, because
a 3-unit arc cannot hold a front against enemies arriving from every direction.

**The shipped fix is a ranged enemy in the opening wave.** The Lobber holds a
4.0-unit standoff — outside the Bonker's 3.0-unit arc, inside the Halo's 5.0 — and
fires dodgeable projectiles at 1-in-10 of all opening spawns. A stationary player
now bleeds by construction, and the arc is free to be generous (3.0 range,
3 targets) so a *moving* player is not overwhelmed. Measured: the stationary policy
dies at **~34 s median** and takes damage inside 60 s on every seed; the kiting
policy on the same seeds lives 8–25× longer.

Standoff numbers were the hard part. At 6.5 (the first draft) nothing in a melee
build could ever reach a Lobber, they accumulated unreachable, projectiles became
**100 % of all damage taken**, and the cohort median fell to 230 s. A ranged enemy
must be answerable by *stepping toward it* — that is the decision it exists to pose
— not by owning one specific weapon. Hence Lobber 4.0 / Seer 7.0, and a validator
rule that rejects any `standoff` beyond every weapon's base range.

**Projectile speed is a game-feel number.** Lobber 11 u/s over 4 units is 0.36 s of
flight, in which a 5.0 u/s player covers 1.8 units against a 0.7-unit combined
hitbox: dodged if you are moving at all, guaranteed if you are not. Seer 24 u/s
over 7 units is 0.29 s — too fast to *react* to, never a threat to a player already
moving laterally. That asymmetry is deliberate: the game should reward continuous
repositioning, which it has a vocabulary for, not twitch reflexes, which it does not.

Ranged `damage` turned out to be the most load-bearing number in the roster,
because a connecting projectile pins the player to the 2 Hz global cap. Lobber at 6
killed the cohort at ~85 s with 100 % projectile damage; at **4** a full bar is 30+
connecting shots and one Scrap Plating stack takes each to the 1-damage floor.

## 4. Problem 2: widening the survivable band

- **Floor raised:** Bonker character carries +45 flat max HP (145 total). Flat, not
  multiplicative, so the forgiveness lands in minute one where it is proportionally
  largest. Early enemy damage is 2–4, i.e. 1.4–2.8 % of the bar per hit.
- **Ceiling raised:** enemy HP rises 3.55× and the spawn rate ~4.8× over the run, so
  the endgame is a throughput check (~1 900 DPS needed at 890 s) that only a build
  with a maxed weapon and two multiplier lines passes.
- Measured band at 300 s: novice (never reacts) 100 % alive at 90 s; charge-headlong
  policy dies at ~113 s median; competent kiting reaches the first boss on ≥ 75 % of
  seeds. That is a wide band with a real skill gradient in it.

## 5. Why each weapon exists

| Weapon | Identity | Build it enables |
|---|---|---|
| **Bonker** 12 dmg / 3.0 range / 3 targets / 28 t | Crowd clear. 3 → 7 targets and 12 → 44 damage over 5 levels: 13× growth, the steepest in the roster. | Bruiser and crit builds; the default answer to volume. |
| **Dartgun** 20 dmg / 11 range / 1 target / 26 t | Highest damage per hit, single target for its whole life. The only thing that reaches a Seer at base. | Boss-killer, and the Sliver glass-cannon start. |
| **Halo** 6 dmg / 5.0 range / 2 targets / 16 t | Fastest cadence, so it scales hardest with attack speed and Area. | Swarm builds, Zip's start, and the cheap answer to Lobbers. |

Measured at 10 picks (level 11) in a packed dummy arena, the five combat archetypes
span **≈2.1×** peak-to-trough, inside the 2.5× budget the test enforces.

## 6. Two-item synergy design

Three pairs, one per item family, so a synergy rewards *committing to a plan*
rather than drawing two specific cards:

| Tag | Granter | Partner | Why the pair |
|---|---|---|---|
| `swift` | Stompers (+0.6 flat) | Spurs (×1.10, ×1.22 more) | Flat is best early, multiplicative best late, and only the pair beats a Stalker's 3.1 speed. |
| `magnetic` | Lodestone (×1.6 pickup) | Vacuum Tube (×1.15 XP, ×1.30 more) | Radius lets a kiting player bank XP without re-entering the train; the XP multiplier is worth little without it. |
| `armoured` | Scrap Plating (+3 armour) | Field Tonic (+20 HP, ×1.15 more) | Armour and a bigger bar multiply each other against a 2 Hz damage cap. |

Each partner is useful alone (an unconditional mod) and clearly better paired — a
synergy that is dead without its partner is a trap card, and the validator rejects a
`requires` nobody grants.

## 7. Gold, shrines and chests

Gold previously had one sink (three merchant visits) and every coin past ~200 was
dead. Now: four merchant visits and **five shrines** drawn from four definitions.
Shrines charge gold for a *timed* buff, so the decision is when to cash in, and the
walk to one costs kiting lane. Forge (60 g, ×1.5 might, 45 s) is a boss window;
Fleetfoot (35 g) an escape hatch; Bulwark (70 g, +6 armour) a panic button; Avarice
(30 g, ×1.8 gold, +4 Luck, 90 s) is the only `stackable: true` one, because stacking
an economy buff compounds into build quality, not into damage.

**Four chests**, each a free offer rolled at +8 Luck, placed ≥ 10 units from spawn.
Four rather than six: each is worth a level's pick, and six made the mid-game curve
outrun the wave table.

## 8. The characters

| | HP | Speed | Might | Start | Failure mode |
|---|---|---|---|---|---|
| **Bonker** | 145 | 5.0 | 10 | Bonker | none in particular — the reference |
| **Sliver** | 60 | 5.4 | 14.5 | Dartgun | one careless step at 600 s+ |
| **Bastion** | 208 (+3 armour) | 4.1 | 8.5 | Bonker | cannot escape what it cannot out-damage |
| **Zip** | 80 | 7.2 (×1.2 atk spd) | 9 | Halo | its damage only lands on what is already close |

Zip's 7.2 outruns every non-boss enemy even at the 1.5× late-game speed cap
(fastest: Runner 3.7 → 5.55), so Zip can always disengage — that is its whole
identity and it is paid for in HP and might.

## 9. Content-exhaustion budget

3 weapons, 5 tomes, 11 items → **19 upgrade lines**, 79 total stacks. At level ~20
by 420 s the offer pool is still live, so `AC-3.3`'s gold padding stays a rare
fallback rather than the late-run default. Whetstone exists specifically so a bad
offer is never a wasted level, which is the cheapest mitigation available for the
PRD's "RNG frustration" risk; Tome of Fortune (+2 Luck/stack) is the expensive one.
