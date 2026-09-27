/**
 * The fixed-timestep accumulator (ARCH-1).
 *
 * `step()` throws on any dt other than TICK_MS, so the client's only job is to
 * decide HOW MANY ticks a real frame is worth. Two failure modes are guarded:
 *
 *  - a single monstrous frame delta (tab restore, breakpoint) is clamped to
 *    MAX_FRAME_MS before it ever reaches the accumulator;
 *  - the resulting tick count is capped at MAX_CATCHUP_TICKS per frame and the
 *    surplus is DROPPED, not banked, so the sim can never stampede thousands of
 *    ticks and lock the main thread.
 *
 * Dropping time makes the game run slow-motion for a frame, which is strictly
 * better than a five-second freeze, and the sim stays deterministic either way
 * because every tick it does run is still exactly TICK_MS.
 */

import { TICK_MS } from '@megabonk/sim';

/** Ticks a single frame may run. 5 ticks = 83 ms of sim per frame of catch-up. */
export const MAX_CATCHUP_TICKS = 5;

/** Largest real frame delta we are willing to believe. */
export const MAX_FRAME_MS = 250;

export interface Accumulator {
  acc: number;
}

export function createAccumulator(): Accumulator {
  return { acc: 0 };
}

export interface TickPlan {
  /** Ticks to run this frame. */
  readonly ticks: number;
  /** Carry for the next frame; always in [0, TICK_MS). */
  readonly accumulator: number;
  /** Interpolation factor for display only; always in [0, 1). */
  readonly alpha: number;
  /** Ticks discarded by the catch-up clamp, for diagnostics. */
  readonly dropped: number;
}

function sanitiseFrame(frameMs: number): number {
  if (Number.isNaN(frameMs)) return 0;
  return Math.max(0, Math.min(frameMs, MAX_FRAME_MS));
}

export function planTicks(accMs: number, frameMs: number, maxTicks = MAX_CATCHUP_TICKS): TickPlan {
  let acc = (Number.isFinite(accMs) ? Math.max(0, accMs) : 0) + sanitiseFrame(frameMs);

  // Subtract a whole tick at a time rather than dividing: integer division on
  // floats leaves a remainder that can land a hair above TICK_MS, which would
  // silently let the carry grow frame after frame.
  let wanted = 0;
  while (acc >= TICK_MS) {
    acc -= TICK_MS;
    wanted++;
  }
  if (acc < 0) acc = 0;

  const cap = Math.max(0, Math.floor(maxTicks));
  const ticks = Math.min(wanted, cap);
  const alpha = Math.min(0.9999999999, Math.max(0, acc / TICK_MS));

  return { ticks, accumulator: acc, alpha, dropped: wanted - ticks };
}
