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

export interface HubLayout {
  readonly titleY: number;
  readonly subtitleY: number;
  /** The silver readout shares the title's line, right-aligned. */
  readonly silverY: number;
  /** "N runs · best m:ss" — on its OWN line, not beside the subtitle. */
  readonly statsY: number;
  readonly rowsStart: number;
  readonly rowH: number;
  readonly panelH: number;
  readonly footerY: number;
}

export function hubLayout(entryCount: number): HubLayout {
  const rowH = 58;
  const rowsStart = 108;
  const panelH = rowsStart + entryCount * rowH + 60;
  return {
    titleY: 44,
    subtitleY: 66,
    silverY: 44,
    statsY: 88,
    rowsStart,
    rowH,
    panelH,
    footerY: panelH - 34,
  };
}

// ---- run summary -----------------------------------------------------------

/** Minimum distance from the last quest row's baseline to the footer's baseline. */
export const SUMMARY_FOOTER_GAP = 28;

const SUMMARY_MAX_QUEST_ROWS = 5;
const SUMMARY_BASE_H = 250;
const SUMMARY_QUEST_ROWS_START = 248;
const SUMMARY_QUEST_ROW_H = 22;
const SUMMARY_FOOTER_INSET = 18;

export interface SummaryLayout {
  readonly panelH: number;
  /** How many quest rows fit; may be fewer than requested on a short viewport. */
  readonly visibleRows: number;
  readonly showQuestHeader: boolean;
  readonly statsGridBottom: number;
  readonly silverY: number;
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
    statsGridBottom: 158,
    silverY: 190,
    questHeaderY: 230,
    questRowsStart: SUMMARY_QUEST_ROWS_START,
    questRowH: SUMMARY_QUEST_ROW_H,
    footerY: panelH - SUMMARY_FOOTER_INSET,
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
