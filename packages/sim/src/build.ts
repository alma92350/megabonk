/** Assembling the player's modifier set and resolving it (FR-9..FR-12). */

import { BASE_STATS, resolveStats, type Modifier, type Stats } from './stats.js';
import { RARITY_MULTIPLIER, type Rarity } from './progression.js';
import type { ContentBundle, ModSpec } from './content-types.js';
import type { ActiveBuff, HeldItem } from './types.js';

function modsFrom(source: string, specs: readonly ModSpec[], scale: number): Modifier[] {
  return specs.map((m, i) => ({
    id: `${source}#${i}`,
    stat: m.stat,
    kind: m.kind,
    // Multiplicative mods scale their DEVIATION from 1, not the whole value:
    // a ×1.2 at rarity 3.0 becomes ×1.6, not ×3.6, which would be absurd.
    value: m.kind === 'mult' ? 1 + (m.value - 1) * scale : m.value * scale,
    ...(m.requires !== undefined ? { requires: m.requires } : {}),
  }));
}

/**
 * Condition tags currently active, from items that grant them. Drives FR-12
 * conditional synergies: an item's bonus is present only when its partner is held.
 */
export function activeConditions(items: readonly HeldItem[], content: ContentBundle): Set<string> {
  const out = new Set<string>();
  for (const held of items) {
    const grant = content.items[held.id]?.grants;
    if (grant) out.add(grant);
  }
  return out;
}

export interface BuildInput {
  readonly characterId: string;
  readonly items: readonly HeldItem[];
  /** Tome id → stacks. */
  readonly tomes: Readonly<Record<string, number>>;
  readonly bonusLuck: number;
  /** Timed shrine buffs. Contribute like any other modifier, then simply vanish. */
  readonly buffs?: readonly ActiveBuff[];
}

/** Collect every modifier the build contributes, in a stable, id-tagged form. */
export function collectModifiers(input: BuildInput, content: ContentBundle): Modifier[] {
  const mods: Modifier[] = [];

  const character = content.characters[input.characterId];
  if (!character) throw new Error(`Unknown character: ${input.characterId}`);
  mods.push(...modsFrom(`char:${character.id}`, character.mods, 1));

  // Tomes: sorted so the modifier ids are stable regardless of pickup order.
  for (const tomeId of Object.keys(input.tomes).sort()) {
    const def = content.tomes[tomeId];
    if (!def) throw new Error(`Unknown tome: ${tomeId}`);
    const stacks = input.tomes[tomeId]!;
    for (let s = 0; s < stacks; s++) {
      mods.push(...modsFrom(`tome:${tomeId}:${s}`, def.mods, 1));
    }
  }

  for (const held of input.items) {
    const def = content.items[held.id];
    if (!def) throw new Error(`Unknown item: ${held.id}`);
    const scale = RARITY_MULTIPLIER[held.rarity];
    for (let s = 0; s < held.stacks; s++) {
      mods.push(...modsFrom(`item:${held.id}:${held.rarity}:${s}`, def.mods, scale));
    }
  }

  // Buffs are sorted by id so their modifier ids stay stable regardless of the
  // order the player happened to collect them in.
  for (const buff of (input.buffs ?? []).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    mods.push(...modsFrom(`buff:${buff.id}:${buff.expiresAtTick}`, buff.mods, 1));
  }

  if (input.bonusLuck > 0) {
    mods.push({ id: 'meta:luck', stat: 'luck', kind: 'flat', value: input.bonusLuck });
  }
  return mods;
}

export function resolveBuild(
  input: BuildInput,
  content: ContentBundle,
): { stats: Stats; modifiers: Modifier[] } {
  const modifiers = collectModifiers(input, content);
  const stats = resolveStats(BASE_STATS, modifiers, activeConditions(input.items, content));
  return { stats, modifiers };
}

export function rarityOf(r: Rarity): number {
  return RARITY_MULTIPLIER[r];
}
