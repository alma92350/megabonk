/** Deterministic integer hash: effect variation never touches Math.random or the clock. */
export function hash32(a: number, b: number, c = 0): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul(c | 0, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Uniform in [0, 1). */
export function hash01(a: number, b: number, c = 0): number {
  return hash32(a, b, c) / 4294967296;
}
