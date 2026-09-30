/**
 * Layout for the screens that are text-heavy enough to collide.
 *
 * Three overlaps shipped because positions were literals scattered through the
 * draw code: each was individually reasonable and none knew about the others.
 * Putting the geometry in pure functions means the relationships that matter —
 * "the footer is at least N below the last row" — are asserted, not hoped for.
 *
 * The fixes are structural rather than measured. Text widths depend on the font
 * the browser ends up with, and a fix tuned on one machine's font quietly breaks
 * on another; separating things vertically holds for any font.
 *
 * All Y values are relative to the top of their panel.
 */

import type { Viewport } from './projection.js';

// ---- hub -------------------------------------------------------------------

// The hub is a scene with a menu column on it; its geometry lives in hub/geometry.ts.
// Everything is a stacked rect, so the runs/best line can never share a baseline with
// the subtitle (the original overlap bug).
export { hubGeometry as hubLayout } from './hub/geometry.js';
export type { HubGeometry as HubLayout } from './hub/geometry.js';

// ---- run summary -----------------------------------------------------------

/** Minimum distance from the last quest row's baseline to the footer's baseline. */
export const SUMMARY_FOOTER_GAP = 28;

const SUMMARY_MAX_QUEST_ROWS = 5;
const SUMMARY_BASE_H = 276;
const SUMMARY_QUEST_ROWS_START = 278;
const SUMMARY_QUEST_ROW_H = 22;
const SUMMARY_FOOTER_INSET = 18;
const SUMMARY_HEADING_MAX = 28;
const SUMMARY_HEADING_MIN = 16;
/** Bold display text is about this many em per character; deliberately generous. */
export const HEADING_EM_PER_CHAR = 0.6;
export const SUMMARY_SEED_SIZE = 12;

/**
 * The summary heading. A death is not "YOU DIED" (a trope from other games): the
 * game speaks in its own voice. A win keeps "SURVIVED".
 */
export function summaryHeading(outcome: string): string {
  return outcome === 'survived' ? 'SURVIVED' : 'The Hollow claims you';
}

/**
 * Largest heading size (<= 28) whose estimated width fits `panelWidth` minus the
 * side insets. Sizing by estimate rather than by measuring keeps this pure; the
 * estimate is generous, so a real font is always narrower.
 */
export function summaryHeadingSize(text: string, panelWidth: number): number {
  const inner = Math.max(0, panelWidth - 48);
  const fit = inner / (Math.max(1, text.length) * HEADING_EM_PER_CHAR);
  return Math.max(SUMMARY_HEADING_MIN, Math.min(SUMMARY_HEADING_MAX, Math.floor(fit)));
}

export interface SummaryLayout {
  readonly panelH: number;
  /** How many quest rows fit; may be fewer than requested on a short viewport. */
  readonly visibleRows: number;
  readonly showQuestHeader: boolean;
  /** Heading baseline; the seed sits on its OWN line beneath it. */
  readonly headingY: number;
  readonly seedY: number;
  /** The Motes-earned reward bar leads the block, directly under the heading. */
  readonly motesY: number;
  readonly motesBarTop: number;
  readonly motesBarH: number;
  /** Baseline of the first stat label; values sit statsValueDy below it. */
  readonly statsStart: number;
  readonly statsRowH: number;
  readonly statsValueDy: number;
  readonly statsGridBottom: number;
  readonly questHeaderY: number;
  readonly questRowsStart: number;
  readonly questRowH: number;
  readonly footerY: number;
}

export function summaryLayout(questRows: number, viewHeight: number): SummaryLayout {
  const maxH = Math.max(0, viewHeight - 20);
  // Height needed for n rows: last baseline + gap + the footer's own inset.
  const heightFor = (n: number): number =>
    SUMMARY_QUEST_ROWS_START + (n - 1) * SUMMARY_QUEST_ROW_H + SUMMARY_FOOTER_GAP + SUMMARY_FOOTER_INSET;

  let visible = Math.min(Math.max(0, Math.floor(questRows)), SUMMARY_MAX_QUEST_ROWS);
  // Drop rows until it fits, rather than letting the panel run off the screen or
  // the footer run over the rows.
  while (visible > 0 && heightFor(visible) > maxH) visible--;

  const panelH = visible > 0 ? heightFor(visible) : Math.min(SUMMARY_BASE_H, maxH);
  return {
    panelH,
    visibleRows: visible,
    showQuestHeader: visible > 0,
    headingY: 44,
    seedY: 68,
    motesY: 110,
    motesBarTop: 88,
    motesBarH: 34,
    statsStart: 152,
    statsRowH: 48,
    statsValueDy: 22,
    statsGridBottom: 226,
    questHeaderY: 256,
    questRowsStart: SUMMARY_QUEST_ROWS_START,
    questRowH: SUMMARY_QUEST_ROW_H,
    footerY: panelH - SUMMARY_FOOTER_INSET,
  };
}

// ---- controls overlay ------------------------------------------------------

export interface HelpItem {
  readonly keys: readonly string[];
  readonly text: string;
}

/** Two groups: what you do with your hands, then what you do with the game. */
export const HELP_ITEMS: readonly HelpItem[] = Object.freeze([
  { keys: ['W', 'A', 'S', 'D'], text: 'Move (or arrows)' },
  { keys: ['1', '2', '3'], text: 'Choose / buy' },
  { keys: ['R'], text: 'Reroll / run again' },
  { keys: ['Esc'], text: 'Pause' },
  { keys: ['Enter', 'Space'], text: 'Confirm' },
  { keys: ['H'], text: 'Close controls' },
]);

const CAP_H = 26;
const CAP_GAP = 4;
const CAP_MIN_W = 28;
const CAP_CHAR_W = 8.5;
const CAP_PAD = 14;
const HELP_ROW_H = 38;
const HELP_INSET = 16;
const HELP_COL_GAP = 24;
const HELP_HEAD_H = 56;
const HELP_FOOT_H = 14;
/** Body text estimate (13 px sans): generous, like the heading estimate. */
export const HELP_TEXT_PX_PER_CHAR = 7.2;

/** Width of a key cap for a label: a floor for single glyphs, growing with the word. */
export function capWidth(label: string): number {
  return Math.max(CAP_MIN_W, Math.ceil(label.length * CAP_CHAR_W + CAP_PAD));
}

export interface HelpCap {
  /** Relative to the cell. */
  readonly x: number;
  readonly w: number;
  readonly label: string;
}

export interface HelpCell {
  /** Relative to the panel. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly caps: readonly HelpCap[];
  readonly capH: number;
  /** Relative to the cell: where the description starts (after the widest caps in the column). */
  readonly textX: number;
  readonly text: string;
}

export interface HelpLayout {
  readonly panel: Plate;
  readonly columns: number;
  readonly cells: readonly HelpCell[];
  readonly titleY: number;
}

export function helpLayout(view: Viewport, items: readonly HelpItem[] = HELP_ITEMS): HelpLayout {
  const panelW = Math.max(0, Math.min(600, view.width - 40));
  const columns = panelW >= 520 && items.length > 1 ? 2 : 1;
  const rows = Math.ceil(items.length / columns);
  const cellW = (panelW - HELP_INSET * 2 - HELP_COL_GAP * (columns - 1)) / columns;
  const panelH = HELP_HEAD_H + rows * HELP_ROW_H + HELP_FOOT_H;

  const capsOf = (it: HelpItem): HelpCap[] => {
    const caps: HelpCap[] = [];
    let x = 0;
    for (const k of it.keys) {
      const w = capWidth(k);
      caps.push({ x, w, label: k });
      x += w + CAP_GAP;
    }
    return caps;
  };
  const capsWidth = (caps: readonly HelpCap[]): number => {
    const last = caps[caps.length - 1];
    return last === undefined ? 0 : last.x + last.w;
  };

  // Descriptions align per column, so each column reads as a clean table.
  const colTextX: number[] = [];
  for (let c = 0; c < columns; c++) {
    let widest = 0;
    for (let i = c * rows; i < Math.min(items.length, (c + 1) * rows); i++) {
      widest = Math.max(widest, capsWidth(capsOf(items[i]!)));
    }
    colTextX.push(widest + 14);
  }

  const cells: HelpCell[] = [];
  for (let i = 0; i < items.length; i++) {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const it = items[i]!;
    cells.push({
      x: HELP_INSET + col * (cellW + HELP_COL_GAP),
      y: HELP_HEAD_H + row * HELP_ROW_H,
      w: cellW,
      h: HELP_ROW_H - 6,
      caps: capsOf(it),
      capH: CAP_H,
      textX: colTextX[col]!,
      text: it.text,
    });
  }
  return {
    panel: {
      x: (view.width - panelW) / 2,
      y: Math.max(0, (view.height - panelH) / 2),
      width: panelW,
      height: panelH,
    },
    columns,
    cells,
    titleY: 34,
  };
}

// ---- upgrade / chest screen ------------------------------------------------

export interface Plate {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A backing plate for the offer heading.
 *
 * The heading is drawn over a scrimmed live world, and the scrim alone is not
 * opaque enough to hide a sprite behind the text: a chest in the world showed
 * through the letters of "CHEST REWARD". A plate makes the text's legibility
 * independent of whatever happens to be underneath it.
 */
export function offerHeadingPlate(view: Viewport): Plate {
  const headingY = view.height * 0.14;
  const width = Math.max(0, Math.min(520, view.width - 24));
  return {
    x: (view.width - width) / 2,
    y: headingY - 26,
    width,
    height: 66,
  };
}
