/**
 * FR-9: stat composition.
 *
 * The genre's single most reliable source of "balance bugs nobody can reproduce"
 * is ambiguity about how modifiers combine. So the order is FIXED and tested:
 *
 *     final = clamp( (base + Σ flat) * Π mult )
 *
 * Consequences worth stating, because they are what the tests pin down:
 *  - Adding two +10 flats and two ×1.2 mults to a base of 100 gives 172.8. Not
 *    168 (mults first), not 176.4 (mults summed).
 *  - Result is independent of modifier order, so item pickup order never matters.
 *  - Modifiers are never folded into the base, so removing one restores exactly.
 */

export interface Stats {
  /** Global damage scalar. */
  might: number;
  maxHp: number;
  moveSpeed: number;
  attackSpeed: number;
  /** Flat damage reduction applied after mitigation percentage. */
  armour: number;
  critChance: number;
  critMultiplier: number;
  /** Drives upgrade rarity weights (FR-4). */
  luck: number;
  pickupRadius: number;
  /** Scales weapon range. */
  area: number;
  xpGain: number;
  goldGain: number;
}

export type StatKey = keyof Stats;

export const BASE_STATS: Readonly<Stats> = Object.freeze({
  might: 10,
  maxHp: 100,
  moveSpeed: 5,
  attackSpeed: 1,
  armour: 0,
  critChance: 0.05,
  critMultiplier: 2,
  luck: 0,
  pickupRadius: 2.5,
  area: 1,
  xpGain: 1,
  goldGain: 1,
});

export interface Clamp {
  readonly min: number;
  readonly max: number;
}

/**
 * Every stat must appear here — a stat without a clamp is a stat that can be
 * driven to Infinity by a synergy nobody modelled. Enforced by test.
 */
export const STAT_CLAMPS: Readonly<Record<StatKey, Clamp>> = Object.freeze({
  might: { min: 0, max: 100000 },
  maxHp: { min: 1, max: 1000000 },
  moveSpeed: { min: 0.5, max: 30 },
  attackSpeed: { min: 0.1, max: 20 },
  armour: { min: 0, max: 1000 },
  critChance: { min: 0, max: 1 },
  critMultiplier: { min: 1, max: 100 },
  luck: { min: 0, max: 100 },
  pickupRadius: { min: 0.5, max: 200 },
  area: { min: 0.1, max: 20 },
  xpGain: { min: 0.1, max: 100 },
  goldGain: { min: 0.1, max: 100 },
});

export type ModifierKind = 'flat' | 'mult';

export interface Modifier {
  /** Stable identity, so a source can add and later remove exactly its own. */
  readonly id: string;
  readonly stat: StatKey;
  readonly kind: ModifierKind;
  readonly value: number;
  /**
   * When set, the modifier only applies if the predicate id is in the active
   * condition set (FR-12 synergies). Absent means unconditional.
   */
  readonly requires?: string;
}

function clampStat(key: StatKey, value: number): number {
  const { min, max } = STAT_CLAMPS[key];
  return value < min ? min : value > max ? max : value;
}

/**
 * Total order over modifiers, used to canonicalise before summing.
 *
 * Why this exists: IEEE-754 addition is not associative. Summing
 * [1.608413850718345, 0.17546319273746136, 0.12265688583264835] left-to-right
 * and right-to-left differ in the final bit. So AC-9.2's "order-independent"
 * guarantee cannot be met by iterating the caller's array, no matter how the
 * arithmetic is written — the fix has to be a canonical order, not a smarter sum.
 *
 * `id` is the primary key because it is stable per source; the remaining fields
 * only break ties between same-id modifiers so the order is total rather than
 * merely weak (a weak order leaves sort() free to differ between engines).
 */
function compareModifiers(a: Modifier, b: Modifier): number {
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  if (a.stat !== b.stat) return a.stat < b.stat ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.value !== b.value) return a.value < b.value ? -1 : 1;
  const ra = a.requires ?? '';
  const rb = b.requires ?? '';
  return ra === rb ? 0 : ra < rb ? -1 : 1;
}

/**
 * Resolve final stats. Pure: neither argument is mutated.
 *
 * `activeConditions` gates conditional modifiers (FR-12). A conditional
 * modifier whose requirement is absent contributes nothing at all — it is not
 * applied with a zero value, which would still perturb a multiplicative chain.
 */
export function resolveStats(
  base: Readonly<Stats>,
  modifiers: readonly Modifier[],
  activeConditions: ReadonlySet<string> = new Set(),
): Stats {
  const flats = {} as Record<StatKey, number>;
  const mults = {} as Record<StatKey, number>;
  for (const key of Object.keys(base) as StatKey[]) {
    flats[key] = 0;
    mults[key] = 1;
  }

  // Canonical order first — see compareModifiers. slice() keeps the caller's
  // array untouched.
  for (const mod of modifiers.slice().sort(compareModifiers)) {
    if (!Number.isFinite(mod.value)) {
      throw new Error(
        `Modifier ${mod.id} on ${mod.stat} has non-finite value ${mod.value}; ` +
          'one bad value would silently NaN every dependent stat.',
      );
    }
    if (mod.requires !== undefined && !activeConditions.has(mod.requires)) continue;
    if (!(mod.stat in flats)) throw new Error(`Modifier ${mod.id} targets unknown stat ${mod.stat}`);

    if (mod.kind === 'flat') flats[mod.stat] += mod.value;
    else mults[mod.stat] *= mod.value;
  }

  const out = {} as Stats;
  for (const key of Object.keys(base) as StatKey[]) {
    out[key] = clampStat(key, (base[key] + flats[key]!) * mults[key]!);
  }
  return out;
}
