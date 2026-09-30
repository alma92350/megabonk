/**
 * Icon keys: pure, no canvas. The HUD model (hud.ts) and tests import this
 * without pulling in any drawing code.
 *
 * Every weapon, rite (internal kind 'tome') and item in the content bundle has an
 * icon whose key IS its content id. Unknown ids resolve to the fallback, and the
 * icons test fails when a real content id does, so new content can never ship a
 * silent grey disc.
 */

export const WEAPON_ICONS = ['bonker', 'dart', 'halo'] as const;
export const RITE_ICONS = ['fury', 'wrath', 'edge', 'hide', 'fortune'] as const;
export const ITEM_ICONS = [
  'boots', 'spurs', 'plating', 'tonic', 'magnet', 'vacuum',
  'wallet', 'gauntlet', 'lens', 'bell', 'whetstone',
] as const;

export const GOLD_ICON = 'gold';
export const FALLBACK_ICON = 'fallback';

export const ICON_IDS: readonly string[] = Object.freeze([
  ...WEAPON_ICONS, ...RITE_ICONS, ...ITEM_ICONS,
]);

const KNOWN: ReadonlySet<string> = new Set(ICON_IDS);

/** True when `id` has its own bespoke icon (not the fallback). */
export function hasIcon(id: string): boolean {
  return KNOWN.has(id);
}

/** The icon key for an offer / loadout entry. Never throws, never empty. */
export function iconKey(kind: string, id: string): string {
  if (kind === 'gold') return GOLD_ICON;
  return KNOWN.has(id) ? id : FALLBACK_ICON;
}
