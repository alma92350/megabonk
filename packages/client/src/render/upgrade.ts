/**
 * FR-19 upgrade screen geometry and the accessibility rules that go with it.
 *
 * AC-19.1 is the load-bearing requirement: rarity must be conveyed by colour AND
 * a distinct shape/icon AND a text label. The layout therefore reserves space for
 * all three on every card — the sigil in the header, the label under it, and a
 * pip row — so a card can never degrade to "just a coloured border".
 */

import type { Advice } from '../advice.js';
import type { Viewport } from './projection.js';

export interface CardLayout {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const GAP_RATIO = 0.028;
const MAX_CARD_WIDTH = 300;
const SIDE_MARGIN = 24;

/**
 * Cards are centred as a group, sized to the viewport, and never allowed to
 * overflow — UI text has to survive a 150% scale without clipping (NFR-3), so
 * the card grows with the screen rather than the text shrinking to fit.
 */
export function layoutCards(count: number, view: Viewport): CardLayout[] {
  if (count <= 0) return [];
  const available = Math.max(0, view.width - SIDE_MARGIN * 2);
  const gap = Math.max(8, view.width * GAP_RATIO);
  const totalGap = gap * (count - 1);
  const width = Math.max(1, Math.min(MAX_CARD_WIDTH, (available - totalGap) / count));
  const height = Math.max(1, Math.min(view.height * 0.6, width * 1.5));
  const groupWidth = width * count + totalGap;
  const startX = (view.width - groupWidth) / 2;
  const y = Math.max(0, (view.height - height) / 2 + view.height * 0.04);

  const cards: CardLayout[] = [];
  for (let i = 0; i < count; i++) {
    cards.push({ index: i, x: startX + i * (width + gap), y, width, height });
  }
  return cards;
}

/** FR-19: the reroll affordance appears only when a reroll is actually available. */
export function shouldShowReroll(rerolls: number): boolean {
  return Number.isFinite(rerolls) && rerolls > 0;
}

/**
 * AC-21.1: with no advice, no card is marked and nothing about the screen
 * changes. A pending advisor marks nothing either — it has no opinion yet, and
 * the human picks freely (AC-21.2).
 */
export function cardMarkerFor(index: number, advice: Advice | null): boolean {
  if (advice === null || advice.status !== 'ready') return false;
  return advice.pickIndex === index;
}
