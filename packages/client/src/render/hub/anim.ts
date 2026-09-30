/**
 * Idle animation for the title scene. Pure and deterministic in (time, index):
 * the same inputs always give the same numbers, and under reduced motion every
 * helper returns its resting value, so nothing on the screen moves or pulses
 * and no information is lost (the scene carries none).
 */

export const MOTE_COUNT = 26;

/** Sine in [-1, 1] with the given period; 0 when motion is reduced. */
export function breath(timeMs: number, periodMs: number, reduceMotion: boolean, phase = 0): number {
  if (reduceMotion || periodMs <= 0) return 0;
  return Math.sin((timeMs / periodMs + phase) * Math.PI * 2);
}

/** Lantern flame scale around 1; exactly 1 when motion is reduced. */
export function flicker(timeMs: number, reduceMotion: boolean): number {
  if (reduceMotion) return 1;
  return 1 + 0.06 * Math.sin(timeMs * 0.011) + 0.04 * Math.sin(timeMs * 0.0273 + 1.3);
}

function hash(i: number, salt: number): number {
  let h = Math.imul((i + 1) * 2654435761 + salt * 40503, 2246822519) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2654435761) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export interface Mote {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly alpha: number;
}

/**
 * Firefly `i` of `MOTE_COUNT` inside a w x h field. Each drifts slowly upward
 * on its own tempo, wrapping, with a small sideways sway and a soft twinkle.
 * Reduced motion holds them still at a fixed, fully readable state.
 */
export function moteAt(i: number, timeMs: number, w: number, h: number, reduceMotion: boolean): Mote {
  const t = reduceMotion ? 0 : timeMs;
  const speed = 5 + hash(i, 1) * 9; // px per second
  const period = h + 40;
  const rise = ((t / 1000) * speed) % period;
  const y0 = hash(i, 2) * period;
  let y = y0 - rise;
  if (y < -20) y += period;
  const swayAmp = 8 + hash(i, 3) * 16;
  const x = hash(i, 4) * w + Math.sin(t / 1000 * (0.4 + hash(i, 5) * 0.5) + hash(i, 6) * 6.28) * swayAmp;
  const tw = reduceMotion ? 0.75 : 0.55 + 0.45 * Math.sin(t / 1000 * (1.2 + hash(i, 7) * 1.6) + hash(i, 8) * 6.28);
  return { x, y, r: 1.1 + hash(i, 9) * 1.5, alpha: Math.max(0.15, Math.min(1, tw)) };
}
