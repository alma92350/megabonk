# Originality, Provenance and IP Audit

**I am an art director, not a lawyer. Nothing here is legal advice and none of it is a trademark clearance.** Where I could not confirm whether a name matches an existing product I write "unverified". I had no ability to search trademark databases or storefronts in this review. Before any commercial release, commission a proper trademark search (see section 4).

Genre mechanics (auto-attacking, wave survival, level-up card picks, chests, shrines, rarity tiers, a meta currency for permanent unlocks, boss timers) are ideas and conventions of the genre, not copyrightable expression. They are not flagged anywhere below. What can be an issue is distinctive names, logos, character designs and copied assets, which is what this audit covers.

## 1. Asset provenance (what is and is not in the repo)

Searched: the whole repo `/home/user/megabonk` excluding `node_modules`, `coverage`, `.git` (and `dist`, examined separately).

| Search | Result |
|---|---|
| Files with extension png/jpg/jpeg/gif/svg/webp/ico/woff/woff2/ttf/otf/mp3/ogg/wav (`find`) | **None.** |
| `@font-face`, `data:image`, `data:font`, `data:audio`, `base64` (grep) | **None.** |
| `<link ...>` and `<script src=...>` to third parties in `packages/client/index.html` | **None.** Only `<script type="module" src="/src/main.ts">` (own code). |
| External URLs / CDNs (grep `https?://`) | Only `http://127.0.0.1:<port>` loopback addresses for the co-play bridge (`main.ts`, `bridge/*`, tests), README's local URL, and the git remote in `.git/config`. No CDN, no analytics, no remote fonts. |
| Foreign licence headers / "Copyright" / "SPDX" / "Licensed under" in source | **None** in project files (only stock git sample hooks in `.git`, not part of the product). |
| Built bundle `dist/assets/index-*.js` (130 KB) | Contains only the two loopback URLs above; no external URLs. |
| `LICENSE` file at repo root | **Absent.** No `license` field in any `package.json`. |

Conclusion: **all shipped art is procedural code** (Canvas 2D drawing in `packages/client/src/render/**`: `creatures/`, `props/`, `world.ts`, `renderer.ts`, `ui.ts`). No image, audio or font file exists in the repository. I read the render code headers and functions and found no embedded raster data or vector path data pasted from an external source; I cannot prove the authors did not visually imitate a reference in their head, which is why section 5 exists. I did not review git history (I was told not to run git).

**Fonts.** `FONT_STACK` in `packages/client/src/render/theme.ts` is `"Trebuchet MS", "Segoe UI", system-ui, sans-serif`, and `index.html` repeats the stack for the boot text. **Nothing is bundled.** The fonts are only *requested* from the player's operating system: Trebuchet MS (Microsoft) and Segoe UI (Microsoft) are proprietary system fonts that are not redistributed by this project (so no licence problem), but the look changes per platform (my Linux renders used a fallback, DejaVu Sans). Recommendation: bundle one or two open-licence (SIL OFL) fonts and record them here.

## 2. Dependency licences

Read from `node_modules/<pkg>/package.json` (not guessed). Workspace packages (`@megabonk/*`) are the project's own code and have no licence field.

| Package | Where declared | Version | Licence |
|---|---|---|---|
| @modelcontextprotocol/sdk | root dependencies | 1.30.1 | MIT |
| zod | root dependencies | 3.25.76 | MIT |
| @types/node | root dev | 22.20.4 | MIT |
| @vitest/coverage-v8 | root dev | 2.1.9 | MIT |
| fast-check | root dev | 3.23.2 | MIT |
| tsx | root dev | 4.23.15 | MIT |
| typescript | root dev | 5.9.3 | Apache-2.0 |
| vite | root dev | 6.4.3 | MIT |
| vitest | root dev | 2.1.9 | MIT |
| @megabonk/sim, content, meta, client, mcp, bridge, harness, balance | `packages/*/package.json` | - | internal workspace, no licence field |

`packages/bridge` and `packages/sim` declare no external dependencies (I read all `packages/*/package.json`). Nothing non-permissive (no GPL/AGPL/SSPL) among direct dependencies. I did not audit the full transitive tree; a tool such as `license-checker` should be run before release.

**Playwright / Chromium**: `playwright` (1.63.0, Apache-2.0) is present in `node_modules` but is **not declared in any package.json**; it is review/test tooling installed outside the manifests. Chromium is used only for screenshots and is not shipped. Neither is part of the game bundle (verified: the `dist` bundle contains no reference to them, and client packages depend only on workspace packages). If Playwright is to be kept, declare it as a devDependency.

## 3. Name and trademark audit

Risk scale: none / low / medium / high. "Unverified" means I believe it may collide but did not confirm.

### 3a. Distinctive or borrowed-feeling terms

| Current term | Where used | Risk | Reasoning | Recommended original replacement |
|---|---|---|---|---|
| **MEGABONK** (title) | `renderer.ts` line 438 hub `kicker`; `index.html` `<title>`, `aria-label`, `<noscript>`; README heading; localStorage keys `megabonk.*`; window globals; repo name | **HIGH** | "Megabonk" is the name of an existing commercial game in this exact genre (3D bullet-heaven/roguelike, released 2025). Same name, same genre, same platform class = the textbook likelihood-of-confusion scenario. The PRD says the name is "working only", but it is player-facing on the hub and in the tab title. | **Kindlewild** (see section 4) |
| "Bonker" (starting weapon "The Bonker", hero "Bonker") | `weapons.ts` id `bonker`; `characters.ts`; comments | **MEDIUM** | Derives from "bonk"; sits on top of the title problem and reads as a nod to the same product. Generic on its own, but a player-facing weapon named the same as the rival's title word is avoidable. | Weapon **Rootclub**; hero **the Kindler** |
| "Tome(s)" / "Tome of Fury..." (passive class) | `tomes.ts` (5 names), `hud.ts`, level-up cards (`ITEM`/`TOME` label) | **MEDIUM (unverified)** | To my knowledge, the closest comparable game uses "Tomes" for its stat-passive class; "tome" is an ordinary English word, but as a *class name for the passive-stat item type* it is a distinctive systemic borrowing. | **Rites** (Rite of Fury, Rite of Wrath, Rite of the Edge, Rite of Hide, Rite of Fortune) |
| "Silver" (meta currency) | `meta/src/index.ts` (`profile.silver`, unlock costs, error strings), `renderer.ts` lines 441, 469, 530; UI text "0 silver", "Silver earned" | **MEDIUM (unverified)** | To my knowledge the same comparable game uses silver as its persistent currency. "Silver" is generic, but pairing with "gold" as in-run currency and "Tomes" as a class stacks up as a pattern. Also a currency called *silver* alongside *gold* is very common, so alone it is low. | **Motes** ("+71 motes", "Motes earned") |
| **"Hulk"** (`tank` enemy display name) | `enemies.ts` | **MEDIUM** | "Hulk" is a Marvel trademark and a character. Used as a generic word for a big brute it is common, but avoid it in a commercial game. | **Cairnwight** |
| **"The Warden"** (boss) | `enemies.ts`, boss bar | **LOW-MEDIUM (unverified)** | "Warden" is a common word, but is the name of a well-known mob in a hugely popular sandbox game; an antlered/crowned variant is dissimilar in look but not in name. | **The Old Crown** |
| "Halo" (orbital weapon) | `weapons.ts` | **LOW-MEDIUM** | "Halo" is a major game franchise name; as an ordinary word for a ring of orbiting shards it is fine, but it is also the game's brand-name for a weapon. | **Wisp Ring** |
| "Bastion" (hero) | `characters.ts` | **LOW (unverified)** | Title of a well-known indie game; ordinary word. | **Barkguard** |
| "Sliver" (hero) | `characters.ts` | **LOW** | A creature type in a well-known card game; ordinary word. | Keep, or **Thistle** |
| "Zip" (hero) | `characters.ts` | none-low | Generic. | Keep |
| "Grunt" | `enemies.ts` | low | Generic word; also an enemy type in a big shooter franchise (unverified as trademarked as a term). | **Scrapper** |
| "Lobber", "Stalker", "Brute", "Seer", "Runner", "Swarmling" | `enemies.ts` | low | Generic English role words. "Stalker" is also a franchise title, "Swarmling" resembles other strategy games' terms (unverified). | Scheme: Ember Fox, Glimmer Beetle, Mossfang, Cinderhex, Tuskback, Hollow Oracle |
| "Second Thoughts", "Bigger Backpack", "Born Lucky" (unlocks) | `meta/src/index.ts` | none-low | Ordinary phrases. | Optional: Second Wind, Deeper Satchel, Lucky Star |
| "First Blood", "Centurion", "Exterminator", "Overachiever", "Untouchable", "Loaded" (quests) | `meta/src/index.ts` | low | Common phrases. "First Blood" is a film title. | Optional: First Ember, Hundredfold, Hollow Cleaner |
| Item names: Stompers, Spurs, Scrap Plating, Field Tonic, Lodestone, Vacuum Tube, Fat Wallet, Gauntlet, Cracked Lens, Brass Bell, Whetstone, "Dartgun" | `items.ts`, `weapons.ts` | none-low | Ordinary compound words; "Gauntlet" and "Dartgun" also exist in other games' contexts but generically. | Naming-grammar alignment only: Barkplate, Siphon Reed, Fat Purse, Wick Lens, Thornsling |
| Shrine names: Ember Forge, Fleetfoot Cairn, Bulwark Stone, Avarice Idol | `shrines.ts` | none | Descriptive. | Keep |
| Biome "Verdant Hollow" | `biomes.ts` | none-low (unverified) | Generic descriptive phrase; likely used as a location name elsewhere, but not a distinctive brand. | Keep |
| Rarity ladder common/uncommon/rare/epic/legendary | `sim/progression.ts` | none | Ubiquitous genre convention. | Optional flavour: Plain, Fine, Rare, Storied, Legendary |
| UI strings ("LEVEL UP", "CHEST REWARD", "MERCHANT", "PAUSED", "CONTROLS", "YOU DIED", "SURVIVED", "Descend", "Kills", "Bosses") | `renderer.ts`, `app.ts` | none / low | Generic. "YOU DIED" is strongly associated with one action-RPG series; a phrase, unprotected in general, but reads as an homage. | "The Hollow claims you" |
| Stat words: might, luck, armour, area | content/sim | none | Generic. | - |

### 3b. Generic words nobody owns (no action)

gold, gem, chest, shrine, merchant, goblin, fox, beetle, wolf, imp, seer, golem, brute, boss, tome (as a word), coin, level, HP, armour, luck, forest/hollow.

## 4. Recommended game title

**Candidates** (all new, fitting the bible: earthy compound, warm, evocative):

1. **Kindlewild** (kindle = the hero's fire; wild = the forest).
2. **Hollowlight**.
3. **Thornlantern**.
4. **Wickwood Wake**.
5. **Lanternmoor**.

**Recommendation: Kindlewild.** It is short, easy to say, describes the premise (a small light carried into a feral forest), carries a strong visual motif (lamp glow) for logo and marketing, and I do not know of any game with that exact name. **Unverified:** I could not search for it. "Hollowlight" is a strong second, but "Hollow" is heavily used in game titles and would be crowded.

**What the owner should do (I cannot do this for you):** search the trademark registers (USPTO TESS/Trademark Search, EUIPO eSearch plus, WIPO Global Brand Database) in classes 9, 41 and 28 for the title and near variants; search Steam, itch.io, the Apple App Store and Google Play, plus general web search and domain/social handles; then have a trademark attorney confirm before spending on branding. Do the same for the renamed weapon, currency and boss if they will appear in marketing.

## 5. Visual similarity check

Judged from screenshots (`lineup-2x.png`, `08-boss.png`, `02-early-play.png`) and my knowledge of well-known characters. I know of no design here that closely copies a specific character; every one is a stock archetype.

| Creature/hero | Verdict | Notes and recommended change |
|---|---|---|
| Hero (blond kid, cream tunic, yellow scarf, wooden club) | Generic archetype, no concern. | Very common "boy with club" read. Add personal identifiers (coral scarf, lamp, patched hood) for identity, which also helps readability. |
| Grunt: blue goblin, big pointed ears, club | Generic goblin. | Blue/purple goblins are common in the genre; recolour and shape are fine. Distinctive ears and eyes are all original. |
| Runner: orange fox, white tail tip | Generic fox. | Fine. |
| Swarmling: teal striped beetle | Generic insect. | Fine. |
| Stalker: spiny teal wolf/lizard | Generic beast. | Fine. |
| Brute: yellow tusked bruiser with bone club | Generic ogre/orc; the spiked shoulders and bone-club cluster is stock. | No change; optionally give it a signature (a belt of scavenged lamps) so it reads as ours. |
| Lobber: purple hooded imp with orb | Generic hooded mage. | Purple hooded caster with glowing eyes is very common; add a cinder-ember trim to the hem to own it. |
| Seer: one-eyed violet robed figure | Generic cyclops/oracle. | Fine. |
| Tank (golem): grey stone body, orange runes | Generic golem. | Orange-glow-rune golem is stock; recommended cairn-stones-and-moss silhouette makes it ours. |
| Warden: magenta armour, gold pauldrons, antlers, spiked mace, red eyes | Generic armoured horned boss; **low** concern. | The antlered helm plus purple-and-gold armour is generic, but its face and mace are unusual enough. To keep it clearly original and to separate it from the caster purple: shift to deep crimson-and-brass, emphasise the stag-crown (asymmetric antlers with hanging lantern charms). |
| Props (trees, mossy rocks, obelisk shrines, chest, merchant) | Generic. | The lantern-carrying hooded merchant resembles a common trope; keep. |

## 6. Licensing recommendation

The repo has no LICENSE file, which by default means all rights reserved (nobody else may legally reuse it), which may or may not be what the owner wants. Options:

1. **All rights reserved**, private or proprietary. Simplest; best if you plan a commercial release. Add a `LICENSE` stating so.
2. **MIT (or Apache-2.0) for the code, and a separate licence for art** (for example CC BY-NC 4.0, or all rights reserved for art and name). Good if you want the engine to be reusable while keeping the identity exclusive.
3. **Everything permissive (MIT for code, CC0/CC BY 4.0 for procedural art).** Maximises sharing; gives up exclusivity, and does not protect the game's name (trademarks are unaffected by copyright licences).

One-line recommendation (your decision): option 2 if you want a community, option 1 if you intend to sell; in both cases, do not license the game's name or logo.

## 7. Provenance statement (publishable draft)

> All visual elements of this game are generated procedurally by original source code in this repository using the browser's Canvas 2D API. The repository contains no image, audio or font files, no embedded raster or base64 assets, and no third-party art. The game loads no external resources at runtime (no CDNs, remote fonts or analytics); it requests standard system fonts from the player's operating system and bundles none. Development dependencies (MIT and Apache-2.0 licensed) are used for build and test only. Character, creature and location designs are original interpretations of common fantasy archetypes and are not derived from any specific existing work.
>
> [Add before publishing: the final game title, the licence chosen, and the result of your trademark search.]

This statement is accurate to what I verified as of this review. It becomes inaccurate if you bundle fonts or add art/audio; update it then. I did not verify git history, transitive dependency licences, or that the authors did not consciously trace any reference.
