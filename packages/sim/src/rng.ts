/**
 * ARCH-2: seeded deterministic RNG.
 *
 * xoshiro128** — fast, small state, JSON-serialisable. Two rules matter more than
 * the algorithm choice:
 *
 *  1. State is DATA, carried inside GameState. There is no module-level RNG, so a
 *     state snapshot is self-contained and replay works (PRD ARCH-2).
 *  2. Streams are LABELLED and independent. Changing how many crit rolls happen
 *     must not shift which items drop, or every balance test becomes fragile.
 */

export interface RngState {
  /** Four uint32 words. Array (not tuple) so JSON round-trips cleanly. */
  readonly s: readonly number[];
}

/** FNV-1a over the label, mixed with the seed, so labels give disjoint sequences. */
function seedWords(seed: number, label: string): number[] {
  let h = 0x811c9dc5 ^ (seed | 0);
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // splitmix32 expansion: fills four words that are well-separated even for
  // adjacent seeds, which matters because tests sweep seeds 1..N.
  const words: number[] = [];
  let x = h >>> 0;
  for (let i = 0; i < 4; i++) {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    words.push((z ^ (z >>> 15)) >>> 0);
  }
  // All-zero state is a fixed point for xoshiro; nudge it.
  // Explicit boolean return type: TS 5.5+ would otherwise infer `w is 0` here and
  // narrow `words` to `0[]`, rejecting the assignment below.
  if (words.every((w): boolean => w === 0)) words[0] = 0x9e3779b9;
  return words;
}

export function createRng(seed: number, label: string): RngState {
  return { s: seedWords(seed, label) };
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

interface Draw<T> {
  readonly value: T;
  readonly state: RngState;
}

/** One xoshiro128** step. Never mutates the input state. */
function advance(state: RngState): { out: number; state: RngState } {
  const s0 = state.s[0]! >>> 0;
  let s1 = state.s[1]! >>> 0;
  let s2 = state.s[2]! >>> 0;
  const s3 = state.s[3]! >>> 0;

  const out = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0) >>> 0;

  const t = (s1 << 9) >>> 0;
  s2 = (s2 ^ s0) >>> 0;
  const n3 = (s3 ^ s1) >>> 0;
  s1 = (s1 ^ s2) >>> 0;
  const n0 = (s0 ^ n3) >>> 0;
  s2 = (s2 ^ t) >>> 0;
  const n2 = rotl(n3, 11);

  return { out, state: { s: [n0, s1, s2, n2] } };
}

/** Uniform in [0, 1). Uses 32 bits over 2^32 so the upper bound is exclusive. */
export function nextFloat(state: RngState): Draw<number> {
  const { out, state: next } = advance(state);
  return { value: out / 4294967296, state: next };
}

/** Uniform integer in [0, max). Rejection-free; bias is < 2^-21 for max < 2^11. */
export function nextInt(state: RngState, max: number): Draw<number> {
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error(`nextInt: max must be a positive integer, got ${max}`);
  }
  const { value, state: next } = nextFloat(state);
  return { value: Math.min(max - 1, Math.floor(value * max)), state: next };
}

/** Uniform in [min, max). */
export function nextRange(state: RngState, min: number, max: number): Draw<number> {
  const { value, state: next } = nextFloat(state);
  return { value: min + value * (max - min), state: next };
}

export type WeightTable<T> = ReadonlyArray<readonly [T, number]>;

/**
 * Weighted selection. Throws rather than returning undefined on an unusable
 * table — a silent undefined here would surface as a crash three systems away.
 */
export function weightedPick<T>(state: RngState, table: WeightTable<T>): Draw<T> {
  if (table.length === 0) throw new Error('weightedPick: empty weight table');
  let total = 0;
  for (const [, w] of table) {
    if (w < 0 || !Number.isFinite(w)) throw new Error(`weightedPick: bad weight ${w}`);
    total += w;
  }
  if (total <= 0) throw new Error('weightedPick: all weights are zero');

  const { value, state: next } = nextFloat(state);
  let acc = 0;
  const target = value * total;
  for (const [item, w] of table) {
    acc += w;
    if (target < acc) return { value: item, state: next };
  }
  // Floating-point tail: return the last entry with non-zero weight.
  for (let i = table.length - 1; i >= 0; i--) {
    if (table[i]![1] > 0) return { value: table[i]![0], state: next };
  }
  throw new Error('weightedPick: unreachable');
}

/** Shuffle a copy (Fisher-Yates). The input array is untouched. */
export function shuffled<T>(state: RngState, items: readonly T[]): Draw<T[]> {
  const out = items.slice();
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const draw = nextInt(s, i + 1);
    s = draw.state;
    const j = draw.value;
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return { value: out, state: s };
}

/**
 * Derive a child stream from a parent's CURRENT state without consuming it.
 * Used for per-wave / per-chest sub-streams so their draw counts stay isolated.
 */
export function forkStream(parent: RngState, label: string): RngState {
  let h = 0x811c9dc5;
  for (const w of parent.s) {
    h = Math.imul(h ^ (w >>> 0), 0x01000193);
  }
  return createRng(h >>> 0, label);
}
