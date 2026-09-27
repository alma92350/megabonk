/** FR-3 upgrade offers: three distinct options, rarity-weighted by Luck. */

import { shuffled, type RngState } from './rng.js';
import { rollRarity } from './progression.js';
import type { ContentBundle } from './content-types.js';
import type { GameState, OfferOption } from './types.js';

const OPTIONS_PER_OFFER = 3;

interface Candidate {
  readonly kind: 'weapon' | 'tome' | 'item';
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

/**
 * Everything the player could legally be offered right now.
 *
 * Exclusions that matter: a weapon at max level (AC-3.2), a tome at max stacks,
 * and a new weapon when every slot is full — offering an unpickable card is a
 * wasted third of the choice.
 */
export function eligibleOptions(state: GameState, content: ContentBundle, weaponSlots: number): Candidate[] {
  const out: Candidate[] = [];

  for (const id of Object.keys(content.weapons).sort()) {
    const def = content.weapons[id]!;
    const owned = state.player.weapons.find((w) => w.id === id);
    if (owned) {
      if (owned.level < def.maxLevel) {
        out.push({ kind: 'weapon', id, name: `${def.name} +${owned.level + 1}`, description: def.description });
      }
      continue;
    }
    if (state.player.weapons.length < weaponSlots) {
      out.push({ kind: 'weapon', id, name: def.name, description: def.description });
    }
  }

  const tomeStacks = new Map<string, number>();
  for (const it of state.player.items) {
    if (content.tomes[it.id]) tomeStacks.set(it.id, it.stacks);
  }
  for (const id of Object.keys(content.tomes).sort()) {
    const def = content.tomes[id]!;
    if ((tomeStacks.get(id) ?? 0) < def.maxStacks) {
      out.push({ kind: 'tome', id, name: def.name, description: def.description });
    }
  }

  for (const id of Object.keys(content.items).sort()) {
    const def = content.items[id]!;
    // Items stack, but cap so the pool cannot be monopolised by one item.
    const held = state.player.items.find((i) => i.id === id);
    if ((held?.stacks ?? 0) < 5) {
      out.push({ kind: 'item', id, name: def.name, description: def.description });
    }
  }

  return out;
}

/**
 * Build an offer of exactly three options.
 *
 * AC-3.1 no duplicates; AC-3.3 pads with gold when the pool is short, so the
 * offer never has fewer than three entries and never throws late in a run when
 * everything is maxed.
 */
export function buildOffer(
  state: GameState,
  content: ContentBundle,
  weaponSlots: number,
  rngIn: RngState,
): { options: OfferOption[]; rng: RngState } {
  let rng = rngIn;
  const pool = eligibleOptions(state, content, weaponSlots);
  const picked = shuffled(rng, pool);
  rng = picked.state;

  const options: OfferOption[] = [];
  for (const cand of picked.value.slice(0, OPTIONS_PER_OFFER)) {
    const roll = rollRarity(rng, state.player.stats.luck);
    rng = roll.state;
    options.push({
      kind: cand.kind,
      id: cand.id,
      rarity: cand.kind === 'weapon' ? 'common' : roll.value,
      name: cand.name,
      description: cand.description,
    });
  }

  while (options.length < OPTIONS_PER_OFFER) {
    const amount = 25 + 5 * state.player.level;
    options.push({
      kind: 'gold',
      id: 'gold',
      rarity: 'common',
      name: `${amount} Gold`,
      description: 'Nothing left to learn. Take the money.',
      goldAmount: amount,
    });
  }

  return { options, rng };
}
