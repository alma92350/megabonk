/**
 * Animation as pure functions of (time, phase). No state, no allocation, no
 * Math.random: the same inputs give the same picture, and reduced motion is one
 * boolean that shrinks every amplitude rather than a second code path.
 */

export const PULSE_LOW = 0.45;
export const PULSE_LOW_REDUCED = 0.85;

/** Glow intensity in [PULSE_LOW, 1] (or [PULSE_LOW_REDUCED, 1] when reduced). */
export function glowPulse(timeMs: number, phase: number, reduce: boolean): number {
  const lo = reduce ? PULSE_LOW_REDUCED : PULSE_LOW;
  const w = reduce ? 0.0016 : 0.0042;
  const s = 0.5 + 0.5 * Math.sin(timeMs * w + phase);
  return lo + (1 - lo) * s;
}

/** Vertical bob in world units, |bob| <= amplitude. */
export function bob(timeMs: number, phase: number, amplitude: number, reduce: boolean): number {
  return Math.sin(timeMs * 0.004 + phase) * amplitude * (reduce ? 0.15 : 1);
}

/** Sparkle strength in [0, 1]: mostly off, a short bright flash per cycle. */
export function twinkle(timeMs: number, phase: number, reduce: boolean): number {
  const period = reduce ? 3600 : 1700;
  const t = (((timeMs + phase * 313) % period) + period) % period / period;
  if (t > 0.3) return 0;
  const k = Math.sin((t / 0.3) * Math.PI);
  return reduce ? k * 0.5 : k;
}

/** Spawn pop: 0.4 -> ~1.12 -> 1 over the first ticks of a pickup's life. */
export const POP_TICKS = 12;
export function popScale(ageTicks: number): number {
  if (!(ageTicks < POP_TICKS)) return 1;
  const t = Math.max(0, ageTicks) / POP_TICKS;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const e = 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; // easeOutBack
  return 0.4 + 0.6 * e;
}
