/** Player-facing formatting. Pure, and the only place number→string rules live. */

/** FR-18 run timer as m:ss. Never negative, never NaN on screen. */
export function formatTime(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${rest < 10 ? '0' : ''}${rest}`;
}

/**
 * Compact counters. A 15-minute run can reach five-figure gold and four-figure
 * kills, and the HUD has a fixed width, so large values abbreviate rather than
 * push the layout around.
 */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatSigned(n: number): string {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return v > 0 ? `+${v}` : String(v);
}

export function formatInt(n: number): string {
  return String(Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
}
