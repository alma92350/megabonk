import { describe, it, expect } from 'vitest';
import {
  hubLayout, summaryLayout, offerHeadingPlate, SUMMARY_FOOTER_GAP, summaryHeading, summaryHeadingSize,
  HEADING_EM_PER_CHAR, SUMMARY_SEED_SIZE, helpLayout, HELP_ITEMS, HELP_TEXT_PX_PER_CHAR, capWidth,
} from '../src/render/layout.js';
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
   * Regression: the subtitle and "N runs · best m:ss" were drawn on baselines 2px
   * apart, so they ran into each other. The hub layout now stacks every text line
   * in its own rect, so a collision is impossible whatever the font metrics are.
   * (Rewritten for the scene layout: the old panel-relative fields are gone.)
   */
  const sizes = [view(360, 640), view(800, 600), view(1280, 800), view(1920, 1080)];

  it('stacks tagline, motes and stats on separate, non-overlapping lines', () => {
    for (const v of sizes) {
      const l = hubLayout(4, v);
      expect(l.motes.y, `${v.width}x${v.height}`).toBeGreaterThanOrEqual(l.tagline.y + l.tagline.h);
      expect(l.stats.y, `${v.width}x${v.height}`).toBeGreaterThanOrEqual(l.motes.y + l.motes.h);
      expect(l.stats.h).toBeGreaterThanOrEqual(l.stats.size + 2);
    }
  });

  it('keeps the stats line above the menu rows', () => {
    for (const v of sizes) {
      const l = hubLayout(4, v);
      expect(l.rows[0]!.y).toBeGreaterThanOrEqual(l.stats.y + l.stats.h);
    }
  });

  it('leaves room for both footer lines under the last row', () => {
    for (const n of [1, 3, 4, 6]) {
      for (const v of sizes) {
        const l = hubLayout(n, v);
        const last = l.rows[n - 1]!;
        expect(l.hint.y).toBeGreaterThanOrEqual(last.y + last.h);
        expect(l.notice.y).toBeGreaterThanOrEqual(l.hint.y + l.hint.h);
        expect(l.notice.y + l.notice.h).toBeLessThanOrEqual(v.height);
      }
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

  it('leads the reward block with Motes, above the stats grid and clear of it', () => {
    const l = summaryLayout(3, 1000);
    const barBottom = l.motesBarTop + l.motesBarH;
    expect(l.motesBarTop).toBeGreaterThan(l.seedY);
    // The first stat label's cap-height top (10 px text) is below the bar.
    expect(l.statsStart - 10).toBeGreaterThan(barBottom);
    expect(l.statsGridBottom).toBeGreaterThan(l.statsStart + l.statsRowH);
  });

  it('keeps the quest header clear of the stats grid, and rows clear of the header', () => {
    const l = summaryLayout(3, 1000);
    expect(l.questHeaderY - 10).toBeGreaterThan(l.statsGridBottom);
    expect(l.questRowsStart - l.questHeaderY).toBeGreaterThanOrEqual(16);
  });
});

describe('summary heading: on-theme line, stacked above the seed', () => {
  const viewports: Array<[number, number]> = [[1280, 800], [1024, 640], [800, 600], [360, 640]];

  it('a death is "The Hollow claims you", never "YOU DIED"; a win keeps SURVIVED', () => {
    expect(summaryHeading('died')).toBe('The Hollow claims you');
    expect(summaryHeading('survived')).toBe('SURVIVED');
    expect(summaryHeading('died').toUpperCase()).not.toContain('YOU DIED');
  });

  it('the seed is on its own line: below the heading, never beside it', () => {
    for (const [w, h] of viewports) {
      const l = summaryLayout(5, h);
      for (const text of [summaryHeading('died'), summaryHeading('survived')]) {
        const size = summaryHeadingSize(text, Math.min(600, w - 40));
        // Heading descender vs seed cap-height: a real gap for any font.
        const headingBottom = l.headingY + size * 0.3;
        const seedTop = l.seedY - SUMMARY_SEED_SIZE * 0.8;
        expect(seedTop - headingBottom, `${w}x${h}`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('the heading fits its panel width at every viewport (estimated, generous)', () => {
    for (const [w] of viewports) {
      const panelW = Math.min(600, w - 40);
      for (const text of [summaryHeading('died'), summaryHeading('survived')]) {
        const size = summaryHeadingSize(text, panelW);
        expect(size).toBeGreaterThanOrEqual(16);
        expect(size).toBeLessThanOrEqual(28);
        expect(text.length * size * HEADING_EM_PER_CHAR, `${w}: ${text}`).toBeLessThanOrEqual(panelW - 48 + 1e-6);
      }
    }
  });

  it('the seed line and heading sit above the Motes bar', () => {
    for (const [, h] of viewports) {
      const l = summaryLayout(5, h);
      expect(l.headingY).toBeLessThan(l.seedY);
      expect(l.seedY + 4).toBeLessThan(l.motesBarTop);
    }
  });

  it('the whole panel fits every viewport with 5 quest rows or fewer', () => {
    for (const [, h] of viewports) {
      const l = summaryLayout(5, h);
      expect(l.panelH).toBeLessThanOrEqual(h - 20);
      expect(l.footerY).toBeLessThanOrEqual(l.panelH);
    }
  });
});

describe('controls overlay layout: key caps in two columns', () => {
  const viewports: Array<[number, number]> = [[1280, 800], [1024, 640], [800, 600], [360, 640]];

  it('uses two columns when wide and one when narrow', () => {
    expect(helpLayout(view(1280, 800)).columns).toBe(2);
    expect(helpLayout(view(800, 600)).columns).toBe(2);
    expect(helpLayout(view(360, 640)).columns).toBe(1);
  });

  it('holds every item, inside the panel, inside the viewport', () => {
    for (const [w, h] of viewports) {
      const l = helpLayout(view(w, h));
      expect(l.cells).toHaveLength(HELP_ITEMS.length);
      expect(l.panel.x, `${w}x${h}`).toBeGreaterThanOrEqual(0);
      expect(l.panel.y).toBeGreaterThanOrEqual(0);
      expect(l.panel.x + l.panel.width).toBeLessThanOrEqual(w);
      expect(l.panel.y + l.panel.height).toBeLessThanOrEqual(h);
      for (const c of l.cells) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x + c.w).toBeLessThanOrEqual(l.panel.width);
        expect(c.y + c.h).toBeLessThanOrEqual(l.panel.height);
      }
    }
  });

  it('no two cells overlap', () => {
    for (const [w, h] of viewports) {
      const cells = helpLayout(view(w, h)).cells;
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i]!, b = cells[j]!;
          const disjoint = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(disjoint, `${w}x${h} cells ${i},${j}`).toBe(true);
        }
      }
    }
  });

  it('within a cell the caps never overlap each other or the description', () => {
    for (const [w, h] of viewports) {
      for (const c of helpLayout(view(w, h)).cells) {
        let prevEnd = -1;
        for (const cap of c.caps) {
          expect(cap.x).toBeGreaterThan(prevEnd);
          expect(cap.w).toBe(capWidth(cap.label));
          prevEnd = cap.x + cap.w;
        }
        expect(prevEnd, `${w}x${h}`).toBeLessThan(c.textX);
        expect(c.textX + c.text.length * HELP_TEXT_PX_PER_CHAR, `${w}x${h}: ${c.text}`).toBeLessThanOrEqual(c.w);
      }
    }
  });

  it('descriptions in a column start at the same x', () => {
    const l = helpLayout(view(1280, 800));
    const byCol = new Map<number, Set<number>>();
    for (const c of l.cells) {
      const set = byCol.get(c.x) ?? new Set<number>();
      set.add(c.textX);
      byCol.set(c.x, set);
    }
    for (const set of byCol.values()) expect(set.size).toBe(1);
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
