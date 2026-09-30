/**
 * The frame. One entry point, `drawFrame(ctx, client)`, and it reads the client
 * without writing to it — the renderer is a consumer of state, never a
 * participant (PRD §1.1).
 */

import { content } from '@megabonk/content';
import { UNLOCKS } from '@megabonk/meta';
import type { GameState, OfferOption } from '@megabonk/sim';
import { getAdvice, type Advice } from '../advice.js';
import { hubLayout, offerHeadingPlate, summaryLayout } from './layout.js';
import type { GameClient } from '../app.js';
import { formatRuns, formatCount, formatTime } from '../format.js';
import type { HudModel } from '../hud.js';
import { roundedRect, type Ctx2D } from './ctx.js';
import type { Viewport } from './projection.js';
import { pathRaritySigil } from './shapes.js';
import { THEME, font, rarityVisual } from './theme.js';
import { bar, kicker, label, panel, paragraph, scrim } from './ui.js';
import { cardMarkerFor, layoutCards, shouldShowReroll } from './upgrade.js';
import { drawWorld, type WorldFrame } from './world.js';

const FALLBACK_PALETTE = {
  ground: '#1d2a22', groundAlt: '#22322a', fog: '#0c1310',
  obstacle: '#3c5245', accent: '#8fe08a',
} as const;

function paletteFor(client: GameClient): WorldFrame['palette'] {
  const biomeId = client.config?.biomeId;
  if (biomeId === undefined) return FALLBACK_PALETTE;
  return content.biomes[biomeId]?.palette ?? FALLBACK_PALETTE;
}

let frameClock = 0;

export function drawFrame(ctx: Ctx2D, client: GameClient, nowMs = frameClock + 16): void {
  frameClock = nowMs;
  const view = client.view;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;

  if (view.width <= 0 || view.height <= 0) return;

  if (client.screen === 'hub') {
    drawHub(ctx, client);
    return;
  }

  const state = client.state;
  if (state === null) {
    drawHub(ctx, client);
    return;
  }

  const hud = client.hud()!;
  const frame: WorldFrame = {
    state,
    prev: client.prev,
    alpha: client.alpha,
    cam: client.camera,
    view,
    palette: paletteFor(client),
    content,
    time: nowMs,
    reduceMotion: client.reduceMotion,
  };

  // Screen shake is a camera-space translate, never a change to sim state.
  const shake = client.fx.shake;
  const amplitude = shake * (client.reduceMotion ? 2 : 7);
  ctx.save();
  if (amplitude > 0.05) {
    ctx.translate(
      Math.sin(nowMs * 0.07) * amplitude,
      Math.cos(nowMs * 0.09) * amplitude,
    );
  }
  drawWorld(ctx, frame, 1 - hud.hpFrac);
  ctx.restore();

  drawDamageVignette(ctx, view, client.fx.damageFlash, hud.hpFrac);
  drawHud(ctx, view, hud, client);

  if (state.phase === 'offer' && state.offer !== null) {
    drawOffer(ctx, client, state, hud);
  } else if (getAdvice() !== null) {
    // A live advisor is most useful DURING play, not only on the upgrade screen:
    // that is where positioning advice can still be acted on. Absent entirely
    // when no advice is set, so an unattached game is pixel-identical (AC-21.1).
    drawAdvisorPanel(ctx, view, getAdvice()!);
  }

  if (client.screen === 'summary') {
    drawSummary(ctx, client);
  } else if (client.paused) {
    drawPause(ctx, view);
  }

  if (client.helpOpen) drawHelp(ctx, view);
}

// ---- feedback -------------------------------------------------------------

function drawDamageVignette(ctx: Ctx2D, view: Viewport, flash: number, hpFrac: number): void {
  // Two sources, one overlay: the hit flash, and a permanent low-HP warning so
  // "about to die" is readable without watching the numbers.
  const danger = hpFrac < 0.3 ? (0.3 - hpFrac) / 0.3 : 0;
  const strength = Math.min(0.75, flash * 0.5 + danger * 0.42);
  if (strength <= 0.01) return;
  const cx = view.width / 2;
  const cy = view.height / 2;
  const grad = ctx.createRadialGradient(cx, cy, Math.min(cx, cy) * 0.45, cx, cy, Math.hypot(cx, cy));
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, THEME.hp);
  ctx.globalAlpha = strength;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.globalAlpha = 1;
}

// ---- HUD (FR-18) ----------------------------------------------------------

function drawHud(ctx: Ctx2D, view: Viewport, hud: HudModel, client: GameClient): void {
  const pad = 14;
  const barW = Math.min(320, view.width * 0.34);

  // Top-left: survival. HP over XP, because HP is checked more often.
  panel(ctx, pad, pad, barW + 20, 62, { radius: 5 });
  label(ctx, hud.hpText, pad + 10, pad + 20, 14, THEME.text, 'left', 'bold');
  bar(ctx, pad + 10, pad + 26, barW, 10, hud.hpFrac,
    hud.hpFrac < 0.3 ? THEME.hpLow : THEME.hp, THEME.hpBack);
  bar(ctx, pad + 10, pad + 42, barW, 7, hud.xpFrac, THEME.xp, THEME.xpBack);
  label(ctx, `LV ${hud.level}`, pad + 10 + barW, pad + 20, 13, THEME.xp, 'right', 'bold');

  if (client.fx.levelFlash > 0.02) {
    ctx.globalAlpha = Math.min(1, client.fx.levelFlash);
    label(ctx, 'LEVEL UP', pad + 10 + barW, pad + 62, 13, THEME.crit, 'right', 'bold');
    ctx.globalAlpha = 1;
  }

  // Top-centre: the clock, the one number a player glances at mid-fight.
  const clockW = 118;
  panel(ctx, view.width / 2 - clockW / 2, pad, clockW, 38, { radius: 5 });
  label(ctx, hud.timeText, view.width / 2, pad + 27, 24, THEME.text, 'center', 'bold');

  // Top-right: economy.
  const statsW = 128;
  panel(ctx, view.width - statsW - pad, pad, statsW, 62, { radius: 5 });
  label(ctx, `${hud.goldText} gold`, view.width - pad - 10, pad + 22, 14, THEME.gold, 'right', 'bold');
  label(ctx, `${hud.killsText} kills`, view.width - pad - 10, pad + 42, 14, THEME.textDim, 'right');
  if (hud.rerolls > 0) {
    label(ctx, `${hud.rerolls} reroll`, view.width - pad - 10, pad + 58, 11, THEME.accent, 'right');
  }

  // Boss bar, centre, under the clock. Numeric, per FR-27.
  if (hud.boss !== null) {
    const w = Math.min(460, view.width * 0.5);
    const x = view.width / 2 - w / 2;
    const y = pad + 48;
    panel(ctx, x - 8, y - 4, w + 16, 34, { radius: 4, fill: THEME.panelAlt });
    label(ctx, hud.boss.name.toUpperCase(), x, y + 9, 11, THEME.boss, 'left', 'bold');
    label(ctx, hud.boss.text, x + w, y + 9, 11, THEME.text, 'right');
    bar(ctx, x, y + 14, w, 10, hud.boss.frac, THEME.boss, THEME.hpBack);
  }

  drawLoadout(ctx, view, hud);
  drawBuffs(ctx, view, hud);

  if (hud.pendingChests > 0) {
    label(ctx, `${hud.pendingChests} chest reward waiting`, view.width / 2, pad + 96, 12,
      THEME.gold, 'center', 'bold');
  }

  // Merchant prompt: keyboard only, per NFR-3.
  const merchant = client.state?.merchant;
  if (merchant != null && client.state !== null) {
    const d = Math.hypot(
      merchant.pos.x - client.state.player.pos.x,
      merchant.pos.y - client.state.player.pos.y,
    );
    if (d < 4) drawMerchantPrompt(ctx, view, merchant.stock, client.state.player.gold);
  }
}

function drawLoadout(ctx: Ctx2D, view: Viewport, hud: HudModel): void {
  const entries = [...hud.weapons, ...hud.tomes, ...hud.items];
  if (entries.length === 0) return;
  const size = 34;
  const gap = 6;
  const cols = Math.max(1, Math.min(entries.length, Math.floor((view.width - 28) / (size + gap))));
  const rows = Math.ceil(entries.length / cols);
  const totalW = cols * size + (cols - 1) * gap;
  const x0 = view.width / 2 - totalW / 2;
  const y0 = view.height - 16 - rows * (size + gap);

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = x0 + col * (size + gap);
    const y = y0 + row * (size + gap);
    const visual = e.rarity === null ? null : rarityVisual(e.rarity as never);
    panel(ctx, x, y, size, size, {
      radius: 4,
      fill: THEME.panelAlt,
      edge: e.kind === 'weapon' ? THEME.accent : visual?.color ?? THEME.panelEdge,
      alpha: 0.9,
    });
    // Initials, not icons: legible at 34px and honest about what it is.
    label(ctx, e.name.slice(0, 2).toUpperCase(), x + size / 2, y + size / 2 + 4, 13,
      THEME.text, 'center', 'bold');
    label(ctx, `${e.kind === 'weapon' ? 'L' : '×'}${e.stacks}`, x + size - 3, y + size - 3, 10,
      e.kind === 'weapon' ? THEME.accent : THEME.textDim, 'right', 'bold');
  }
}

function drawBuffs(ctx: Ctx2D, view: Viewport, hud: HudModel): void {
  if (hud.buffs.length === 0) return;
  const w = 150;
  const x = view.width - w - 14;
  let y = 90;
  for (const b of hud.buffs) {
    panel(ctx, x, y, w, 26, { radius: 4, fill: THEME.panelAlt, edge: THEME.advisor });
    label(ctx, b.name, x + 8, y + 17, 12, THEME.text, 'left');
    label(ctx, b.text, x + w - 8, y + 17, 12, THEME.advisor, 'right', 'bold');
    y += 30;
  }
}

function drawMerchantPrompt(
  ctx: Ctx2D, view: Viewport,
  stock: readonly { readonly option: OfferOption; readonly price: number; readonly sold: boolean }[],
  gold: number,
): void {
  const w = Math.min(420, view.width - 40);
  const h = 34 + stock.length * 24;
  const x = view.width / 2 - w / 2;
  const y = view.height - h - 90;
  panel(ctx, x, y, w, h, { radius: 6, fill: THEME.panelAlt, edge: THEME.merchant });
  kicker(ctx, 'MERCHANT', x + 12, y + 20, 11, THEME.merchant);
  for (let i = 0; i < stock.length; i++) {
    const entry = stock[i]!;
    const rowY = y + 42 + i * 24;
    const affordable = !entry.sold && gold >= entry.price;
    const colour = entry.sold ? THEME.textDim : affordable ? THEME.text : THEME.hp;
    label(ctx, `${i + 1}`, x + 12, rowY, 12, THEME.merchant, 'left', 'bold');
    label(ctx, entry.sold ? `${entry.option.name} — sold` : entry.option.name, x + 30, rowY, 12, colour);
    label(ctx, entry.sold ? '' : `${entry.price}g`, x + w - 12, rowY, 12, THEME.gold, 'right', 'bold');
  }
}

// ---- upgrade screen (FR-19) ----------------------------------------------

function drawOffer(ctx: Ctx2D, client: GameClient, state: GameState, hud: HudModel): void {
  const view = client.view;
  const offer = state.offer!;
  scrim(ctx, view.width, view.height, 0.78);

  const fromChest = offer.source === 'chest';
  const heading = fromChest ? 'CHEST REWARD' : 'LEVEL UP';
  // A backing plate: the scrim alone lets a world sprite (a chest, say) show
  // through the lettering.
  const plate = offerHeadingPlate(view);
  panel(ctx, plate.x, plate.y, plate.width, plate.height, {
    radius: 8, fill: THEME.panel, edge: fromChest ? THEME.gold : THEME.panelEdge, alpha: 0.94,
  });
  kicker(ctx, heading, view.width / 2, view.height * 0.14, 14,
    fromChest ? THEME.gold : THEME.xp, 'center');
  label(ctx,
    fromChest ? 'Rarer than a level-up. Choose your spoils.' : `Level ${hud.level} — choose an upgrade`,
    view.width / 2, view.height * 0.14 + 24, 14, THEME.textDim, 'center');

  const advice = getAdvice();
  const cards = layoutCards(offer.options.length, view);
  for (const card of cards) {
    const option = offer.options[card.index];
    if (option === undefined) continue;
    drawCard(ctx, card, option, cardMarkerFor(card.index, advice), fromChest);
  }

  const footY = Math.min(view.height - 18, (cards[0]?.y ?? 0) + (cards[0]?.height ?? 0) + 34);
  label(ctx, 'Press 1, 2 or 3 to choose', view.width / 2, footY, 13, THEME.textDim, 'center');
  if (shouldShowReroll(state.player.rerolls)) {
    label(ctx, `R — reroll (${state.player.rerolls} left)`, view.width / 2, footY + 20, 13,
      THEME.accent, 'center', 'bold');
  }

  if (advice !== null) drawAdvisorPanel(ctx, view, advice);
}

function drawCard(
  ctx: Ctx2D,
  card: { x: number; y: number; width: number; height: number; index: number },
  option: OfferOption,
  marked: boolean,
  fromChest: boolean,
): void {
  const v = rarityVisual(option.rarity);
  const { x, y, width: w, height: h } = card;

  panel(ctx, x, y, w, h, { radius: 8, fill: THEME.panel, edge: v.color, alpha: 0.97 });

  // Rarity band. Colour is ONE of four cues, never the only one.
  ctx.fillStyle = v.dim;
  roundedRect(ctx, x + 1.5, y + 1.5, w - 3, h * 0.36, 7);
  ctx.fill();

  // Cue 2: the sigil.
  const sigilR = Math.min(22, w * 0.11);
  ctx.fillStyle = v.color;
  pathRaritySigil(ctx, v.shape, x + w / 2, y + h * 0.15, sigilR);
  ctx.fill();
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cue 3: the word.
  kicker(ctx, v.label, x + w / 2, y + h * 0.3, Math.max(10, w * 0.052), v.color, 'center');

  // Cue 4: countable pips.
  const pipR = Math.max(2, w * 0.013);
  const pipGap = pipR * 3.2;
  const pipY = y + h * 0.345;
  const pipStart = x + w / 2 - ((v.pips - 1) * pipGap) / 2;
  ctx.fillStyle = v.color;
  ctx.beginPath();
  for (let i = 0; i < v.pips; i++) {
    ctx.moveTo(pipStart + i * pipGap + pipR, pipY);
    ctx.arc(pipStart + i * pipGap, pipY, pipR, 0, Math.PI * 2);
  }
  ctx.fill();

  label(ctx, option.name, x + w / 2, y + h * 0.48, Math.max(13, w * 0.066), THEME.text, 'center', 'bold');
  const kindText = option.kind === 'gold' ? `+${option.goldAmount ?? 0} GOLD` : option.kind.toUpperCase();
  kicker(ctx, kindText, x + w / 2, y + h * 0.56, Math.max(9, w * 0.042), THEME.textDim, 'center');
  paragraph(ctx, option.description, x + w / 2, y + h * 0.66, w - 26,
    Math.max(11, w * 0.05), THEME.textDim, 4, 'center');

  // The hotkey, bottom-centre: keyboard-first by construction.
  ctx.fillStyle = v.color;
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h - 22, 13, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, String(card.index + 1), x + w / 2, y + h - 17, 15, THEME.ink, 'center', 'bold');

  if (fromChest) {
    kicker(ctx, 'CHEST', x + 10, y + h - 10, 9, THEME.gold);
  }

  if (marked) {
    ctx.strokeStyle = THEME.advisor;
    ctx.lineWidth = 3;
    ctx.setLineDash([9, 6]);
    roundedRect(ctx, x - 5, y - 5, w + 10, h + 10, 11);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'ADVISED', x + w / 2, y - 12, 11, THEME.advisor, 'center', 'bold');
  }
}

/** FR-21. Absent entirely when no advice is set (AC-21.1). */
function drawAdvisorPanel(ctx: Ctx2D, view: Viewport, advice: Advice): void {
  const w = Math.min(340, view.width - 28);
  const h = 76;
  const x = view.width - w - 14;
  const y = view.height - h - 14;
  panel(ctx, x, y, w, h, { radius: 6, fill: THEME.panelAlt, edge: THEME.advisor });
  kicker(ctx, advice.status === 'pending' ? 'ADVISOR — THINKING' : 'ADVISOR', x + 12, y + 20, 10, THEME.advisor);
  label(ctx, advice.headline, x + 12, y + 40, 13, THEME.text, 'left', 'bold');
  if (advice.rationale.length > 0) {
    paragraph(ctx, advice.rationale, x + 12, y + 56, w - 24, 11, THEME.textDim, 2);
  }
  if (advice.pickIndex !== null) {
    label(ctx, `Suggests ${advice.pickIndex + 1}`, x + w - 12, y + 20, 11, THEME.advisor, 'right', 'bold');
  }
}

// ---- pause / help --------------------------------------------------------

function drawPause(ctx: Ctx2D, view: Viewport): void {
  scrim(ctx, view.width, view.height, 0.6);
  kicker(ctx, 'PAUSED', view.width / 2, view.height / 2 - 6, 22, THEME.text, 'center');
  label(ctx, 'Escape or Enter to resume · H for controls', view.width / 2, view.height / 2 + 22,
    14, THEME.textDim, 'center');
}

const HELP_LINES: readonly string[] = [
  'WASD or arrows — move',
  '1 / 2 / 3 — choose an upgrade, or buy from the merchant',
  'R — reroll an offer (when unlocked) · restart from the summary',
  'Escape — pause · Enter or Space — confirm',
  'H — close this panel',
];

function drawHelp(ctx: Ctx2D, view: Viewport): void {
  const w = Math.min(460, view.width - 40);
  const h = 44 + HELP_LINES.length * 22;
  const x = view.width / 2 - w / 2;
  const y = view.height / 2 - h / 2;
  scrim(ctx, view.width, view.height, 0.55);
  panel(ctx, x, y, w, h, { radius: 8 });
  kicker(ctx, 'CONTROLS', x + 16, y + 26, 13, THEME.accent);
  for (let i = 0; i < HELP_LINES.length; i++) {
    label(ctx, HELP_LINES[i]!, x + 16, y + 52 + i * 22, 13, THEME.text, 'left');
  }
}

// ---- meta hub ------------------------------------------------------------

function drawBackdrop(ctx: Ctx2D, view: Viewport): void {
  ctx.fillStyle = THEME.void;
  ctx.fillRect(0, 0, view.width, view.height);
  // Slow diagonal hatch, the title-screen echo of the in-world lattice.
  ctx.strokeStyle = '#0d1a14';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = -view.height; i < view.width; i += 26) {
    ctx.moveTo(i, 0);
    ctx.lineTo(i + view.height, view.height);
  }
  ctx.stroke();
}

function drawHub(ctx: Ctx2D, client: GameClient): void {
  const view = client.view;
  drawBackdrop(ctx, view);

  const w = Math.min(560, view.width - 40);
  const x = view.width / 2 - w / 2;
  const entries = client.hubEntries();
  const L = hubLayout(entries.length);
  const rowH = L.rowH;
  const h = L.panelH;
  const y = Math.max(10, view.height / 2 - h / 2);

  panel(ctx, x, y, w, h, { radius: 10 });
  kicker(ctx, 'MEGABONK', x + 24, y + L.titleY, 26, THEME.accent);
  label(ctx, 'Verdant Hollow · 15 minutes · one life', x + 24, y + L.subtitleY, 13, THEME.textDim);

  label(ctx, `${formatCount(client.profile.silver)} silver`, x + w - 24, y + L.silverY, 18,
    THEME.silver, 'right', 'bold');
  // Its own line, right-aligned under the silver. It used to share a baseline
  // with the subtitle, and the two ran into each other.
  label(ctx,
    `${formatRuns(client.profile.runsPlayed)} · best ${formatTime(client.profile.bestSeconds)}`,
    x + w - 24, y + L.statsY, 12, THEME.textDim, 'right');

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const rowY = y + L.rowsStart + i * rowH;
    const selected = i === client.hubIndex;
    const unlockDef = UNLOCKS.find((u) => u.id === entry.id);
    const edge = entry.kind === 'start'
      ? THEME.accent
      : entry.owned ? THEME.accent : entry.affordable ? THEME.silver : THEME.panelEdge;
    panel(ctx, x + 18, rowY, w - 36, rowH - 10, {
      radius: 6,
      fill: selected ? THEME.panelAlt : THEME.panel,
      edge: selected ? THEME.text : edge,
      alpha: selected ? 1 : 0.9,
    });
    // Selection is marked by a caret as well as by the border, so the focused row
    // is unambiguous without relying on a colour difference (NFR-3).
    if (selected) label(ctx, '>', x + 26, rowY + 30, 16, THEME.accent, 'left', 'bold');
    label(ctx, entry.label, x + 44, rowY + 22, 15, THEME.text, 'left', 'bold');
    label(ctx, entry.detail, x + 44, rowY + 40, 12, THEME.textDim, 'left');
    if (entry.kind === 'unlock') {
      const right = entry.owned ? 'OWNED' : `${unlockDef?.cost ?? entry.cost} silver`;
      label(ctx, right, x + w - 30, rowY + 30, 13,
        entry.owned ? THEME.accent : entry.affordable ? THEME.silver : THEME.textDim, 'right', 'bold');
    } else {
      label(ctx, 'ENTER', x + w - 30, rowY + 30, 13, THEME.accent, 'right', 'bold');
    }
  }

  const footY = y + L.footerY;
  label(ctx, 'Arrows or W/S to move · Enter to confirm · H for controls',
    view.width / 2, footY, 12, THEME.textDim, 'center');
  if (!client.storageAvailable) {
    label(ctx, 'Storage unavailable — progress will not be saved this session',
      view.width / 2, footY + 18, 12, THEME.hpLow, 'center');
  } else if (client.notice !== null) {
    label(ctx, client.notice, view.width / 2, footY + 18, 12, THEME.gold, 'center');
  }
}

// ---- run summary (FR-20) -------------------------------------------------

function drawSummary(ctx: Ctx2D, client: GameClient): void {
  const view = client.view;
  const summary = client.summary;
  scrim(ctx, view.width, view.height, 0.86);
  if (summary === null) return;

  const w = Math.min(600, view.width - 40);
  const L = summaryLayout(client.questDeltas.length, view.height);
  const deltas = client.questDeltas.slice(0, L.visibleRows);
  const h = L.panelH;
  const x = view.width / 2 - w / 2;
  const y = Math.max(10, view.height / 2 - h / 2);

  panel(ctx, x, y, w, h, { radius: 10 });
  const survived = summary.outcome === 'survived';
  kicker(ctx, survived ? 'SURVIVED' : 'YOU DIED', x + 24, y + 44, 24,
    survived ? THEME.accent : THEME.hp);
  label(ctx, `Seed ${summary.seed}`, x + w - 24, y + 42, 12, THEME.textDim, 'right');

  const rows: Array<[string, string]> = [
    ['Time', formatTime(summary.seconds)],
    ['Level', String(summary.level)],
    ['Kills', formatCount(summary.kills)],
    ['Bosses', String(summary.bossKills)],
    ['Gold earned', formatCount(summary.goldEarned)],
    ['Damage taken', formatCount(summary.damageTaken)],
  ];
  const colW = (w - 48) / 3;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const col = i % 3;
    const line = Math.floor(i / 3);
    const cx = x + 24 + col * colW;
    const cy = y + 84 + line * 48;
    kicker(ctx, row[0].toUpperCase(), cx, cy, 10, THEME.textDim);
    label(ctx, row[1], cx, cy + 22, 20, THEME.text, 'left', 'bold');
  }

  const silverY = y + L.silverY;
  panel(ctx, x + 24, silverY - 22, w - 48, 34, { radius: 5, fill: THEME.panelAlt, edge: THEME.silver });
  label(ctx, 'Silver earned', x + 36, silverY, 13, THEME.textDim, 'left');
  label(ctx, `+${formatCount(summary.silverEarned)} silver`, x + w - 36, silverY, 15,
    THEME.silver, 'right', 'bold');

  if (L.showQuestHeader) kicker(ctx, 'QUEST PROGRESS', x + 24, y + L.questHeaderY, 10, THEME.textDim);
  let questY = y + L.questRowsStart;
  for (const d of deltas) {
    label(ctx, d.completed ? `${d.name} — complete` : d.name, x + 24, questY, 12,
      d.completed ? THEME.accent : THEME.text, 'left');
    label(ctx, `${Math.round(d.from)} → ${Math.round(d.to)} / ${d.target}`, x + w - 24, questY, 12,
      THEME.textDim, 'right');
    questY += L.questRowH;
  }

  label(ctx, 'R — run again · Enter — back to the hub', view.width / 2, y + L.footerY, 13,
    THEME.text, 'center', 'bold');
}

export { font };
