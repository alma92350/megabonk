# Art Review — independent art direction pass

Reviewer: external art/creative director. Build reviewed: current working tree (dev server, Chromium 1280x800, DPR 1 and 2).
Screenshots referenced live in the review scratch folder `.../scratchpad/review/` (names below). The pink-grunt recolour, golem fist sizing and hit-flash/death-fade verification were in flight during the review and are deliberately not judged.

Method: fresh captures of hub, early play, mid-run crowd, boss, level-up cards, chest cards, death summary, controls overlay, creature lineup, prop lineup/loot/explore; a deuteranopia/protanopia SVG colour-matrix pass on the lineup (`cb.png`); a read of `render/theme.ts`, `render/props/palette.ts`, `render/world.ts`, `render/renderer.ts`.

## 1. Scorecard

| Axis | Score | One-line reason |
|---|---|---|
| Moment-to-moment readability | 4 | Creatures have strong, distinct silhouettes and hue families, ground is calm, pickups glow; only the missing weapon feedback and edge-beacon clutter cost points (`04-midrun-crowd.png`). |
| Attractiveness | 3.5 | World, creatures and props are charming and confident; hub, cards and HUD look like a different, unfinished product (`01-hub.png`, `03-levelup-cards.png`). |
| Stylistic cohesion | 3 | Creatures and props do belong together (same outline, saturation ceiling, top-left light); the UI does not, and the hero/goblin are far more "cartoon" than the mossy, muted trees (`02-early-play.png` vs `03-levelup-cards.png`). |
| Silhouette / colour language | 3.5 | Silhouettes are excellent, but blue means four different things (goblin, XP gem, "rare", speed shrine) and purple/magenta is shared by imp, seer and boss (`lineup-2x.png`). |
| Animation and juice | 2 | Bobbing, glows and screen shake exist, but there is no visible weapon effect at all, no damage numbers, no hit particles (`world.ts`, `renderer.ts`: only a dashed reach ring). |
| Originality of visual identity | 3 | The cast is charming but archetypal; the game has no signature motif yet, and the title and "Bonker" name undercut it (see ORIGINALITY.md). |
| UI polish | 2.5 | Clean, consistent and legible, but placeholder glyphs on cards, two-letter cryptic loadout tiles, a menu with no art and a duplicated boss bar read as prototype (`03`, `08-boss.png`). |

## 2. What works — protect this

- **Silhouette-first creature design.** Goblin, fox, beetle, spiny wolf, tusked brute, hooded imp, seer, golem and boss are identifiable at 1x in a 44-enemy crowd (`crowd-1x.png`, `04-midrun-crowd.png`). Do not add detail that breaks this.
- **Consistent thick dark outline + top-left light + flat cel shading** across creatures and props. It is the glue of the world.
- **Calm dark-green ground and desaturated scenery** keep every hostile and reward saturated relative to the background. The ground/scenery = quiet rule in `props/palette.ts` is the right instinct.
- **Shrines as a colour-coded family** (forge orange, cairn blue, bulwark violet, idol gold) with a glyph on each, and pickups with distinct shapes (gem/coin/cross). Colour is not the only cue (`01-lineup.png`).
- **Rarity encoded by hue, shape and pip count** on cards (`05-chest-reward.png`) — good accessibility thinking.
- **The merchant** (hooded, lantern, sack) is the best-characterised prop; it tells a story in one glance.
- **The Warden's silhouette** (antlers, spiked mace, giant shoulders) is a real boss read at a distance (`08-boss.png`).

## 3. Prioritised feedback

Owners: C = creatures, P = props+ground, U = UI+HUD, L = lead. Effort: S/M/L.

### P0 — first impression or gameplay readability

**P0-1. No visible weapon or hit feedback.** Where: `render/world.ts` (only a dashed reach ring near line 404 and a gold foot-pool), `renderer.ts`; every gameplay screenshot shows the hero standing with an idle club. Why: in a bullet-heaven the weapon IS the spectacle; the player cannot tell what killed what, or whether their build is working. Fix: (a) melee arc: a 3-frame crescent smear in the weapon colour drawn along the swing arc, with a brief hit-stop (2-3 frames) on enemies; (b) dart: a bright streak + muzzle puff and a small impact spark; (c) orbital: draw the orbiting shards with a short fading trail; (d) on hit: 4-6 tiny white/yellow sparks and a punchy 80 ms squash on the target; (e) on kill: a puff of leaves/dust in the enemy's colour, and an XP-gem "pop"; (f) optional pooled damage numbers (small, only crits large) with a per-frame cap. Keep it batched, no `shadowBlur`, to respect the 1500-entity budget. Owner: L to spec, C for target reactions, P for particles. Effort: M-L.

**P0-2. Level-up and chest cards use placeholder icons.** Where: `03-levelup-cards.png` — tomes and items show a plain grey disc; only the boots have a glyph. Why: this is the screen the player sees dozens of times and the only place upgrade identity lives; grey discs look unfinished beside the painted world, and the player cannot recognise an item they own in the bottom loadout. Fix: one bespoke 48-64 px painted icon per weapon/tome/item, drawn with the same outline and palette as props, reused on the loadout tiles. Owner: U with P. Effort: M (about 20 icons, procedural).

**P0-3. Boss bar defects.** Where: `08-boss.png` (x 880-1017, y 62-74): a second, clipped red bar peeks out from behind the top boss bar (the per-entity overhead bar is not suppressed when the top bar is up); `lineup-2x.png`: the boss bar and timer overlap. Why: it reads as a bug on the most important moment of the run. Fix: hide the overhead bar for the boss while the banner is shown, and move the banner under the timer with a 12 px gap. Owner: U. Effort: S.

**P0-4. Blue is overloaded.** Where: goblin body (`lineup-2x.png`), XP gems and level-up chevron beacons (`03-explore.png`), "Rare" rarity (`03-levelup-cards.png`), fleetfoot shrine. Why: the most numerous enemy is the same hue as the thing you are supposed to run TOWARD (XP). In a crowd the eye briefly parses enemy as pickup. Fix: pick one meaning for blue. Recommendation: blue = friendly resource/sacred (XP, rare, speed shrine); move the goblin to olive/mustard-green-brown or a dull red-brown (the in-flight pink recolour is a chance to fix this, so coordinate). Owner: C + lead. Effort: S.

### P1 — clearly worth doing

**P1-1. UI does not belong to the painted world.** Where: `01-hub.png`, `03-levelup-cards.png`, `10-help-overlay.png`, `11-death-summary.png` versus `02-early-play.png`. The theme comment still says "stamped brass on slate" and "storybook woodcut"; the world is now bright cartoon vector with fat ink outlines. UI is thin-ruled, letter-spaced, near-black rectangles with hairline borders: the rendering language (line weight, roundness, fill) is different. Fix: adopt the world's language in the UI: 3 px dark ink outline on panels, rounded 10-12 px corners, a warm bark-brown or deep-moss panel fill instead of neutral black-slate, a brass/gold inner highlight on the top edge only, chunky (not letter-spaced) headings. Keep the layout and the contrast. Owner: U. Effort: M.

**P1-2. Hub/title screen has no identity.** `01-hub.png`: a centred slate box on a diagonal lattice, with "MEGABONK" in plain type. Fix: put the hero and the Warden's silhouette in the scene (already drawable with existing sprite code), a logo lockup, ground and a few props behind the menu; retitle (see ORIGINALITY.md, this also removes an IP risk). Owner: U + C. Effort: M.

**P1-3. Hero presence.** `02-early-play.png`, `lineup-2x.png`: the hero is smaller and paler than the goblins around them, wears cream/yellow, and is placed on a warm gold pool that is the same yellow as pickups and the brute. In crowds (`04-midrun-crowd.png`) the hero is findable only by the pool. Fix: a slightly larger hero (about +12% scale), a saturated signature colour no enemy uses (e.g. a warm coral scarf plus the lamp-light pool), a 2 px light rim outline (white-ish) so the hero is the only actor with a light outline, and a subtle ring pulse when hit. Owner: C. Effort: S.

**P1-4. Two-letter loadout tiles (TH, TO, ST, FA, SP, GA, BR).** `04-midrun-crowd.png`, bottom centre. They are unreadable as a language ("TO" is Tome of Wrath? "ST" is Stompers?). Fix: use the new icons (P0-2), keep the level/stack number, show the name in a tooltip while the run is paused. Owner: U. Effort: S once icons exist.

**P1-5. Off-screen beacon clutter.** `04-midrun-crowd.png` shows 8-9 edge arrows at once; chests, shrines and pickups pile up on the right and left edges. Fix: show at most 3 beacons (nearest chest, nearest shrine, merchant when present), fade by distance, and drop XP-chevron beacons entirely (`03-explore.png`) unless a level-up bonus is close. Owner: P. Effort: S.

**P1-6. Scale and detail consistency between creatures and props.** In `01-lineup.png` and `02-early-play.png` trees are about 3-4x the goblin height with soft, low-contrast leaf blobs, while creatures are crisp and high-contrast. The trees are rendered with softer outlines and desaturated fills (deliberate, and mostly right) but their outline weight is visibly thinner than the actors'. Fix: raise obstacle outline weight to match actors (about 2.5-3 px at zoom), keep saturation low, and add a consistent one-side highlight. Also add a slightly lighter "ground contact" ring for the golem/brute/warden so large actors are not swallowed by trees. Owner: P. Effort: S-M.

**P1-7. Screen-space effects are thin.** There is a fog-colour edge vignette and a low-HP/damage vignette (`world.ts` line ~155, `renderer.ts` line 105), which is good, but nothing else: no ambient particles (drifting pollen, leaves, fireflies), no light-shaft variation, no boss arrival cue beyond the bar. Fix: 20-30 slow drifting motes (fireflies, consistent with the lamp motif), a 0.4 s red rim and a low rumble shake on boss spawn, and a subtle warm light pool around the merchant/shrines that exists in-world already (extend it to the chests). Owner: P + U. Effort: M.

**P1-8. Text legibility and typography.** `FONT_STACK` is `"Trebuchet MS", "Segoe UI", system-ui, sans-serif` (`theme.ts`); nothing is bundled, so the screenshots here render in the Linux fallback (DejaVu Sans Bold) while players on other systems will see something else. Small uppercase labels are letter-spaced 1-2 px, and dim text (`#8fa598` on `#0d1417`) passes contrast but is small (10-13 px) on cards and the summary (`11-death-summary.png`). Fix: bundle one open-licensed display face for titles/numerals (for example an OFL-licensed rounded slab or brush face) and one for body, check licence on delivery and record it in ORIGINALITY.md; stop letter-spacing lower-case body text; minimum 13 px for anything a player must read. Owner: U. Effort: M.

**P1-9. Death screen mood.** `11-death-summary.png`: same near-black panel as everything else; "YOU DIED" in red is also a well-known trope from other games. Fix: a softer, on-theme phrase ("The Hollow claims you", see bible), the hero slumped on the ground behind the panel, and lead with silver/motes earned. Owner: U. Effort: S.

**P1-10. Colour-blind safety.** Simulated with SVG colour matrices (`cb.png`, deuteranopia). Silhouettes and shape cues hold. Problems: HP bar red, gold, fox and brute all collapse to similar olive-yellow, so "health" and "reward" share a hue under deuteranopia; goblin blue and stalker teal/violet converge; the magenta Warden turns grey (still readable by size and antlers, but the "hostile = hot pink" rule vanishes). Fix: give the HP bar a dark inner tick pattern or a heart icon at its left, give enemy projectiles a distinct shape (a diamond or spiked orb, already partly true) and a white core, and keep the Warden's antlers/scale as the primary cue. Note: I did not exhaustively test tritanopia. Owner: U + C. Effort: S.

### P2 — polish

- **P2-1. Boss spectacle.** The Warden is a good sprite but only a large enemy in practice (`08-boss.png`). Add an entrance (0.8 s slow-motion scale-in with ground crack rings), a phase tell (eye glow intensifies under 50%), and a telegraphed attack ring on the ground before contact damage (also fixes readability of danger). Owner: C + P. Effort: M.
- **P2-2. Attack/hit reactions differ per creature.** Currently a shared white flash; add per-creature squash or recoil (brute barely moves, beetles scatter). Owner: C. Effort: S-M.
- **P2-3. Pickup magnet feedback.** Add a small trail when gems fly to the hero and a slightly louder "pop" size on collection. Owner: P. Effort: S.
- **P2-4. Ground richness.** Grass tufts and three obstacle types are pleasant but repetitive over a 120x120 arena; add two scatter families (fallen logs, mushroom rings), a faint path or clearing near shrines, and two ground tints in large patches. Owner: P. Effort: M.
- **P2-5. Controls overlay** (`10-help-overlay.png`) is a plain block of prose; use key-cap glyphs and two columns. Owner: U. Effort: S.
- **P2-6. Chest "Legendary" x2 on a common chest**: rarity colour brown-gold (`05-chest-reward.png`) on dark-brown card bodies is warm-on-warm; lighten the icon panel or add a shine sweep. Owner: U. Effort: S.
- **P2-7. Hero and enemy idle animation** should have distinct tempos (hero calm, goblins jittery, golem heavy) so the world has rhythm. Owner: C. Effort: S.

## 4. Top 5 changes for the biggest quality jump

1. **Add weapon, hit and kill effects (P0-1).** Effort M-L. The single largest gain in feel; the game currently plays silently in the visual channel.
2. **Restyle the UI in the world's painted language, including icons for every upgrade (P0-2, P1-1, P1-4).** Effort M. Removes the "two games glued together" impression and makes card choices meaningful.
3. **Fix the colour language: blue overload, hero distinctness, colour-blind-safe HP (P0-4, P1-3, P1-10).** Effort S. Cheap, high readability payoff in crowds.
4. **Rework the hub/title and rename the game (P1-2).** Effort M. First impression; also removes the highest-risk IP problem (see ORIGINALITY.md).
5. **Boss entrance and ground telegraphs, plus ambient particles (P2-1, P1-7).** Effort M. Turns the three boss beats into the run's memorable moments.
