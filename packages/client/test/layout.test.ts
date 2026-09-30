import { describe, it, expect } from 'vitest';
import { hubLayout, summaryLayout, offerHeadingPlate, SUMMARY_FOOTER_GAP } from '../src/render/layout.js';
import { layoutCards } from '../src/render/upgrade.js';
import { formatRuns } from '../src/format.js';
import { cardKindLabel } from '../src/render/upgrade.js';

const view = (width: number, height: number) => ({ width, height });

describe('formatRuns: singular and plural', () => {
  it('says "1 run", not "1 runs"', () => {
    expect(formatRuns(1)).toBe('1 run');
    expect(formatRuns(0)).toBe('0 runs');
    expect(formatRuns(2)).toBe('2 runs');
    expect(formatRuns(1234)).toBe('1234 runs');
  });
  it('never prints NaN or a negative count', () => {
    expect(formatRuns(NaN)).toBe('0 runs');
    expect(formatRuns(-3)).toBe('0 runs');
  });
});

describe('hub header: the subtitle and the runs/best line must not share a line', () => {
  /**
   * Regression: "Verdant Hollow · 15 minutes · one life" (left) and "N runs ·
   * best m:ss" (right) were drawn on baselines 2px apart, so they ran into each
   * other. Stacking them vertically makes the collision impossible whatever the
   * font metrics are — unlike tuning a width, which only holds on the font the
   * author happened to have.
   */
  const FONT_PX = 13;

  it('puts the stats line on its own line, clear of the subtitle', () => {
    const l = hubLayout(4);
    expect(l.statsY - l.subtitleY).toBeGreaterThanOrEqual(FONT_PX + 2);
  });

  it('keeps the stats line clear of the first row', () => {
    const l = hubLayout(4);
    expect(l.rowsStart - l.statsY).toBeGreaterThanOrEqual(8);
  });

  it('keeps the title and the silver readout on their shared line, above the subtitle', () => {
    const l = hubLayout(4);
    expect(l.silverY).toBe(l.titleY);
    expect(l.subtitleY).toBeGreaterThan(l.titleY);
  });

  it('grows the panel with the row count and leaves room for the footer', () => {
    for (const n of [1, 3, 4, 6]) {
      const l = hubLayout(n);
      const lastRowBottom = l.rowsStart + n * l.rowH - 10;
      expect(l.panelH - l.footerY).toBeGreaterThanOrEqual(24); // room for the second footer line
      expect(l.footerY).toBeGreaterThanOrEqual(lastRowBottom + 12);
      expect(l.footerY).toBeLessThan(l.panelH);
    }
  });
});

describe('summary panel: the footer must never overlap the quest rows', () => {
  /**
   * Regression: the panel was 250 + 22*rows tall, but the last quest row's
   * baseline sits at 248 + 22*(rows-1) and the footer at height-18. At 5 rows
   * those were 6px apart, so "R — run again" was printed over "Ten Minutes".
   */
  it('leaves at least the footer gap under the last quest row, for every row count', () => {
    for (let rows = 0; rows <= 8; rows++) {
      const l = summaryLayout(rows, 1000);
      if (l.visibleRows === 0) continue;
      const lastRowBaseline = l.questRowsStart + (l.visibleRows - 1) * l.questRowH;
      expect(l.footerY - lastRowBaseline, `rows=${rows}`).toBeGreaterThanOrEqual(SUMMARY_FOOTER_GAP);
    }
  });

  it('the exact case from the screenshot: 5 quest rows', () => {
    const l = summaryLayout(5, 1000);
    expect(l.visibleRows).toBe(5);
    const lastRowBaseline = l.questRowsStart + 4 * l.questRowH;
    expect(l.footerY - lastRowBaseline).toBeGreaterThanOrEqual(SUMMARY_FOOTER_GAP);
  });

  it('with no quest rows there is no quest section and no wasted space', () => {
    const l = summaryLayout(0, 1000);
    expect(l.visibleRows).toBe(0);
    expect(l.showQuestHeader).toBe(false);
    expect(l.panelH).toBeLessThan(summaryLayout(3, 1000).panelH);
  });

  it('on a short viewport it drops rows rather than overflowing the screen', () => {
    for (const h of [360, 420, 480, 560, 700]) {
      const l = summaryLayout(5, h);
      expect(l.panelH, `viewport ${h}`).toBeLessThanOrEqual(h - 20);
      if (l.visibleRows > 0) {
        const lastRowBaseline = l.questRowsStart + (l.visibleRows - 1) * l.questRowH;
        expect(l.footerY - lastRowBaseline).toBeGreaterThanOrEqual(SUMMARY_FOOTER_GAP);
      }
    }
  });

  it('never reports more visible rows than exist', () => {
    expect(summaryLayout(2, 1000).visibleRows).toBe(2);
    expect(summaryLayout(9, 1000).visibleRows).toBeLessThanOrEqual(5);
  });

  it('keeps the silver bar clear of the stats grid above it', () => {
    const l = summaryLayout(3, 1000);
    expect(l.silverY - 22).toBeGreaterThan(l.statsGridBottom);
  });
});

describe('offer heading plate: text needs its own backing', () => {
  /**
   * Regression: the heading was drawn straight over the scrimmed world, so a
   * chest sprite behind it showed through the letters of "CHEST REWARD". A plate
   * behind the text makes legibility independent of whatever is underneath.
   */
  it('covers both heading lines', () => {
    for (const v of [view(1280, 800), view(1024, 640), view(1920, 1080)]) {
      const p = offerHeadingPlate(v);
      const headingY = v.height * 0.14;
      expect(p.y).toBeLessThanOrEqual(headingY - 14);
      expect(p.y + p.height).toBeGreaterThanOrEqual(headingY + 24 + 6);
    }
  });

  it('is centred and no wider than the viewport allows', () => {
    const v = view(1280, 800);
    const p = offerHeadingPlate(v);
    expect(p.x + p.width / 2).toBeCloseTo(v.width / 2, 6);
    const narrow = offerHeadingPlate(view(360, 640));
    expect(narrow.x).toBeGreaterThanOrEqual(0);
    expect(narrow.x + narrow.width).toBeLessThanOrEqual(360);
  });

  it('never runs into the cards below it', () => {
    for (const v of [view(1280, 800), view(1024, 640), view(1920, 1080), view(800, 600)]) {
      const p = offerHeadingPlate(v);
      const cards = layoutCards(3, v);
      expect(p.y + p.height, `viewport ${v.width}x${v.height}`).toBeLessThanOrEqual(cards[0]!.y);
    }
  });
});

describe('cardKindLabel: the player-facing name of an offer kind', () => {
  /**
   * The sim's internal kind for a passive is 'tome'. Cards used to print that
   * raw, which put a borrowed term on the most-viewed screen in the game. The
   * internal id is unchanged (renaming it would break recordings and goldens);
   * only the label a player reads changes.
   */
  it('calls a passive a RITE, not a tome', () => {
    expect(cardKindLabel('tome')).toBe('RITE');
  });
  it('leaves the other kinds alone', () => {
    expect(cardKindLabel('weapon')).toBe('WEAPON');
    expect(cardKindLabel('item')).toBe('ITEM');
    expect(cardKindLabel('gold')).toBe('GOLD');
  });
  it('never returns an empty label for an unknown kind', () => {
    expect(cardKindLabel('mystery').length).toBeGreaterThan(0);
  });
});
