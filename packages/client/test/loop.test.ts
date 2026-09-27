import { describe, expect, it } from 'vitest';
import { TICK_MS } from '@megabonk/sim';
import { MAX_CATCHUP_TICKS, MAX_FRAME_MS, createAccumulator, planTicks } from '../src/loop.js';

describe('fixed-timestep accumulator', () => {
  it('starts empty', () => {
    expect(createAccumulator()).toEqual({ acc: 0 });
  });

  it('runs exactly one tick for one tick of real time', () => {
    const plan = planTicks(0, TICK_MS);
    expect(plan.ticks).toBe(1);
    expect(plan.accumulator).toBeCloseTo(0, 10);
    expect(plan.dropped).toBe(0);
  });

  it('runs zero ticks for a frame shorter than a tick and banks the remainder', () => {
    const plan = planTicks(0, 5);
    expect(plan.ticks).toBe(0);
    expect(plan.accumulator).toBeCloseTo(5, 10);
    expect(plan.alpha).toBeCloseTo(5 / TICK_MS, 10);
  });

  it('accumulates across frames so 60 frames of 16ms yield ~60 ticks', () => {
    let acc = 0;
    let ticks = 0;
    for (let i = 0; i < 60; i++) {
      const plan = planTicks(acc, 16);
      acc = plan.accumulator;
      ticks += plan.ticks;
    }
    expect(ticks).toBeGreaterThanOrEqual(57);
    expect(ticks).toBeLessThanOrEqual(60);
  });

  it('never leaves the accumulator at or above one tick', () => {
    for (const frame of [0, 1, 16, 17, 33, 100, 5000, 1e9]) {
      const plan = planTicks(0, frame);
      expect(plan.accumulator).toBeLessThan(TICK_MS);
      expect(plan.accumulator).toBeGreaterThanOrEqual(0);
    }
  });

  it('clamps catch-up so a backgrounded tab cannot stampede', () => {
    const plan = planTicks(0, 60_000);
    expect(plan.ticks).toBe(MAX_CATCHUP_TICKS);
    expect(plan.dropped).toBeGreaterThan(0);
    expect(plan.accumulator).toBeLessThan(TICK_MS);
  });

  it('clamps a single absurd frame delta before accumulating', () => {
    const plan = planTicks(0, 10 * MAX_FRAME_MS);
    expect(plan.ticks).toBeLessThanOrEqual(MAX_CATCHUP_TICKS);
    expect(plan.dropped * TICK_MS + plan.ticks * TICK_MS + plan.accumulator).toBeLessThanOrEqual(MAX_FRAME_MS + 1e-6);
  });

  it('ignores negative and non-finite frame times', () => {
    expect(planTicks(0, -100).ticks).toBe(0);
    expect(planTicks(0, Number.NaN).ticks).toBe(0);
    expect(planTicks(0, Number.POSITIVE_INFINITY).ticks).toBe(MAX_CATCHUP_TICKS);
  });

  it('respects a custom cap', () => {
    expect(planTicks(0, 1000, 2).ticks).toBe(2);
  });

  it('reports an interpolation alpha in [0,1)', () => {
    for (const frame of [0, 3, 16, 25, 40, 900]) {
      const { alpha } = planTicks(0, frame);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });
});
