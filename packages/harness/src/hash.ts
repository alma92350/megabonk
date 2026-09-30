/**
 * Structural hashing for the golden-run corpus.
 *
 * WHAT IS HASHED
 * --------------
 * `hashState` hashes the WHOLE `GameState`, generically: it walks the object and
 * includes every own enumerable key it finds. Nothing is enumerated by name, so a
 * field added to `GameState` tomorrow (chests, shrines, a new counter) is covered
 * the moment it appears, rather than silently escaping the corpus. The cost of a
 * name-list is exactly the failure mode goldens exist to prevent, so there is no
 * name-list.
 *
 * That includes, today: tick, seed, phase, outcome, all five RNG stream states,
 * the full player record (pos, hp, xp, level, gold, weapons, items, rerolls,
 * invulnerable, facing, resolved stats, modifier list), all enemies, all pickups,
 * the map (halfExtent + obstacles), the pending offer, queuedOffers, nextId, the
 * kill/damage/gold counters, the merchant, and the current tick's event list.
 *
 * ORDER SENSITIVITY
 * -----------------
 * Object keys are sorted recursively, so serialisation order can never move a
 * hash. Arrays keep their order by default, because for most of them order is
 * part of the contract (the event log is append-ordered; `weapons` is slot-ordered).
 * Arrays the sim does NOT promise an order for are sorted first, by a stable key:
 *
 *   - arrays of objects carrying a numeric/string `id`  -> sorted by id
 *   - `map.obstacles` (no id)                           -> sorted by (x, y, radius, height)
 *
 * `events` is explicitly exempt from sorting: reordering events is a real change.
 *
 * FLOATS
 * ------
 * Numbers are quantised to HASH_PRECISION decimal places before hashing, and -0
 * is folded to 0. Same-platform determinism is bit-exact (the determinism suite
 * asserts that separately, on raw state equality), so the quantisation exists only
 * so a committed golden hash survives a different machine's libm. The trade-off is
 * explicit: a divergence smaller than 1e-6 in a single field would not be caught
 * by a golden. The determinism suite, which compares full states, would.
 */

export const HASH_PRECISION = 6;

/** Arrays under these keys keep their order even if their elements have ids. */
const ORDER_SIGNIFICANT_KEYS: ReadonlySet<string> = new Set(['events', 'weapons', 'picks', 's']);

/** Keys dropped from a content fingerprint: display-only, cannot affect the sim. */
const COSMETIC_CONTENT_KEYS: ReadonlySet<string> = new Set([
  'palette',
  'name',
  'description',
]);

const QUANT = Math.pow(10, HASH_PRECISION);

function normaliseNumber(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return 'Infinity';
  if (n === -Infinity) return '-Infinity';
  if (Number.isInteger(n)) return String(n === 0 ? 0 : n);
  const q = Math.round(n * QUANT) / QUANT;
  return String(q === 0 ? 0 : q);
}

function sortKeyOf(value: unknown): string {
  if (value !== null && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if (typeof rec.id === 'number') return `n:${String(rec.id).padStart(12, '0')}`;
    if (typeof rec.id === 'string') return `s:${rec.id}`;
    if (rec.pos !== null && typeof rec.pos === 'object') {
      const p = rec.pos as Record<string, unknown>;
      return `p:${normaliseNumber(Number(p.x))},${normaliseNumber(Number(p.y))},${normaliseNumber(
        Number(rec.radius ?? 0),
      )},${normaliseNumber(Number(rec.height ?? 0))}`;
    }
  }
  return `v:${typeof value}`;
}

/** True when every element of the array carries a usable stable sort key. */
function isUnorderedCollection(arr: readonly unknown[]): boolean {
  if (arr.length < 2) return false;
  return arr.every((v) => {
    if (v === null || typeof v !== 'object') return false;
    const rec = v as Record<string, unknown>;
    return typeof rec.id === 'number' || typeof rec.id === 'string' || typeof rec.pos === 'object';
  });
}

export interface CanonicaliseOptions {
  /** Keys to drop entirely, at any depth. */
  readonly omitKeys?: ReadonlySet<string>;
}

/**
 * Deterministic string form of any JSON-compatible value: keys sorted
 * recursively, unordered collections sorted, floats quantised.
 */
export function canonicalise(value: unknown, opts: CanonicaliseOptions = {}): string {
  const omit = opts.omitKeys;
  const out: string[] = [];

  const walk = (v: unknown, key: string | null): void => {
    if (v === null) {
      out.push('null');
      return;
    }
    switch (typeof v) {
      case 'number':
        out.push('#', normaliseNumber(v));
        return;
      case 'string':
        out.push('"', v.replace(/[\\"]/g, (c) => `\\${c}`), '"');
        return;
      case 'boolean':
        out.push(v ? 'T' : 'F');
        return;
      case 'undefined':
        // Matches JSON.stringify: an undefined value is indistinguishable from
        // an absent key. Callers relying on the difference would not survive the
        // JSON round-trip that ARCH-1 requires anyway.
        out.push('undef');
        return;
      case 'object':
        break;
      default:
        out.push('?');
        return;
    }

    if (Array.isArray(v)) {
      const items: unknown[] =
        key !== null && ORDER_SIGNIFICANT_KEYS.has(key)
          ? v
          : isUnorderedCollection(v)
            ? v.slice().sort((a, b) => (sortKeyOf(a) < sortKeyOf(b) ? -1 : sortKeyOf(a) > sortKeyOf(b) ? 1 : 0))
            : v;
      out.push('[');
      for (const item of items) {
        walk(item, null);
        out.push(',');
      }
      out.push(']');
      return;
    }

    const rec = v as Record<string, unknown>;
    const keys = Object.keys(rec)
      .filter((k) => rec[k] !== undefined)
      .filter((k) => omit === undefined || !omit.has(k))
      .sort();
    out.push('{');
    for (const k of keys) {
      out.push(k, ':');
      walk(rec[k], k);
      out.push(',');
    }
    out.push('}');
  };

  walk(value, null);
  return out.join('');
}

/**
 * 64-bit hash as 16 hex chars: two independent 32-bit mixes (FNV-1a and a
 * xorshift-multiply variant) concatenated. Pure 32-bit integer maths, so it is
 * fast enough to hash a 2000-entity state thousands of times in a sweep, and
 * needs no dependency.
 */
export function hashString(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = (h2 + c) >>> 0;
    h2 = Math.imul(h2 ^ (h2 >>> 15), 0x85ebca6b) >>> 0;
    h2 = (h2 ^ (h2 >>> 13)) >>> 0;
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 0x2545f491) >>> 0;
  h1 = (h1 ^ (h1 >>> 15)) >>> 0;
  h2 = Math.imul(h2 ^ input.length, 0xc2b2ae35) >>> 0;
  h2 = (h2 ^ (h2 >>> 16)) >>> 0;
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** Stable structural hash of a whole `GameState` (or any state-shaped value). */
/**
 * Display text carried inside the game state (offer and merchant option cards).
 * Purely cosmetic: the sim never reads it. It MUST be excluded here because the
 * content fingerprint already strips the same keys on the promise that renaming
 * does not change a run; if the state hash covered them the promise was false,
 * and a pure rename turned every golden red with no behavioural change.
 */
const COSMETIC_STATE_KEYS: ReadonlySet<string> = new Set(['name', 'description']);

export function hashState(state: unknown): string {
  return hashString(canonicalise(state, { omitKeys: COSMETIC_STATE_KEYS }));
}

/**
 * Fingerprint of a content bundle: every balance-relevant number, with the
 * cosmetic keys (`name`, `description`, `palette`) dropped so renaming an item or
 * repainting a biome does not stale the golden corpus. Changing any number, id,
 * wave table, or mod list does.
 */
export function contentFingerprint(content: unknown): string {
  return hashString(canonicalise(content, { omitKeys: COSMETIC_CONTENT_KEYS }));
}
