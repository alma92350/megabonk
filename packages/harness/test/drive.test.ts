/**
 * The headless run driver (PRD §9 layer 3, FR-26) and the scripted policies.
 *
 * The one thing this file exists to prove is the tick-counting contract: an open
 * offer pauses the clock (AC-19.2), so a loop that counts ITERATIONS silently
 * stops short of the game time it appears to be asking for. `drive` counts sim
 * ticks, and these tests fail if that ever regresses to an iteration count.
 */
import { describe, it, expect } from 'vitest';
import { TICKS_PER_SECOND, MAX_ENTITIES } from '@megabonk/sim';
import { makeRunConfig } from '@megabonk/content';
import { drive } from '../src/drive.js';
import { POLICIES, baselinePolicy, randomPolicy, stationaryPolicy } from '../src/policy.js';
import { swarmConfig, survivableConfig } from '../src/scenarios.js';

describe('drive: the canonical headless driver', () => {
  it('advances exactly the requested number of sim ticks', () => {
    const r = drive(survivableConfig(makeRunConfig(11)), { ticks: 1500, policy: stationaryPolicy });
    expect(r.state.tick).toBe(1500);
    expect(r.state.phase).not.toBe('ended');
  });

  it('counts sim ticks, not iterations: offers cost iterations without ticks (AC-19.2)', () => {
    const r = drive(survivableConfig(makeRunConfig(11)), { ticks: 3000, policy: stationaryPolicy });
    expect(r.state.tick).toBe(3000);
    expect(r.offersResolved).toBeGreaterThan(0);
    // The proof: strictly more loop iterations were needed than ticks advanced.
    expect(r.iterations).toBeGreaterThan(r.state.tick);
    expect(r.iterations - r.state.tick).toBe(r.offersResolved);
  });

  it('reaches the boss that a naive iteration-counted loop would hide (AC-5.4)', () => {
    // The verdant boss lands at t=300s. An iteration-counted loop asking for
    // 300s of ticks would stop a couple of seconds early, once offers have eaten
    // enough iterations — and would report "no boss" as a content bug.
    const r = drive(survivableConfig(makeRunConfig(3)), {
      ticks: TICKS_PER_SECOND * 301,
      policy: baselinePolicy,
    });
    expect(r.state.tick).toBe(TICKS_PER_SECOND * 301);
    expect(r.events.some((e) => e.type === 'boss_spawned')).toBe(true);
  });

  it('stops early when the run ends, and reports why', () => {
    const r = drive(makeRunConfig(1), { ticks: 54000, policy: stationaryPolicy });
    expect(r.state.phase).toBe('ended');
    expect(r.stopReason).toBe('ended');
    expect(r.state.tick).toBeLessThan(54000);
  });

  it('never leaves an offer pending when it returns having ended', () => {
    const r = drive(makeRunConfig(2), { ticks: 54000, policy: stationaryPolicy });
    expect(r.state.phase).toBe('ended');
    expect(r.state.offer).toBeNull();
  });

  it('accumulates the whole event log, not just the last tick', () => {
    const r = drive(makeRunConfig(5), { ticks: 2000, policy: baselinePolicy });
    expect(r.events.length).toBeGreaterThan(r.state.events.length);
    expect(r.events[0]!.type).toBe('run_start');
    for (const e of r.events) {
      expect(typeof e.tick).toBe('number');
      expect(typeof e.type).toBe('string');
    }
  });

  it('produces a RunSummary derived from the event log (AC-6.2)', () => {
    const r = drive(makeRunConfig(5), { ticks: 54000, policy: stationaryPolicy });
    expect(r.summary.seed).toBe(5);
    expect(r.summary.kills).toBe(r.state.kills);
    expect(r.summary.level).toBe(r.state.player.level);
    expect(['survived', 'died']).toContain(r.summary.outcome);
  });

  it('summarises a truncated run without pretending it ended', () => {
    const r = drive(survivableConfig(makeRunConfig(5)), { ticks: 600, policy: stationaryPolicy });
    expect(r.stopReason).toBe('tick-budget');
    expect(r.truncated).toBe(true);
    expect(r.summary.seconds).toBeCloseTo(600 / TICKS_PER_SECOND, 6);
  });

  it('records the agent profile it was told to record (AC-29.1)', () => {
    const r = drive(makeRunConfig(5), { ticks: 300, policy: baselinePolicy, agentProfile: 'unrestricted' });
    expect(r.summary.agentProfile).toBe('unrestricted');
    expect(drive(makeRunConfig(5), { ticks: 300, policy: baselinePolicy }).summary.agentProfile).toBeNull();
  });

  it('is reproducible: same config + same policy + same budget → identical result (AC-26.2)', () => {
    const a = drive(makeRunConfig(77), { ticks: 6000, policy: baselinePolicy });
    const b = drive(makeRunConfig(77), { ticks: 6000, policy: baselinePolicy });
    expect(b.summary).toEqual(a.summary);
    expect(b.state.tick).toBe(a.state.tick);
    expect(b.events.length).toBe(a.events.length);
  });

  it('honours the iteration cap instead of hanging on a pathological policy', () => {
    // A policy that always rerolls would spin forever on the offer screen if the
    // driver had no cap. The cap turns a hang into a reported stop reason.
    const r = drive(makeRunConfig(9), {
      ticks: 54000,
      policy: () => ({ move: { x: 0, y: 0 }, reroll: true }),
      maxIterations: 500,
    });
    expect(r.iterations).toBeLessThanOrEqual(500);
    expect(['iteration-cap', 'ended', 'tick-budget']).toContain(r.stopReason);
  });

  it('clamps a policy\'s out-of-range chooseIndex rather than throwing (AC-24.3 at the driver)', () => {
    expect(() =>
      drive(makeRunConfig(12), {
        ticks: 4000,
        policy: () => ({ move: { x: 1, y: 0 }, chooseIndex: 99 }),
      }),
    ).not.toThrow();
  });

  it('invokes onTick once per advanced tick', () => {
    let seen = 0;
    const r = drive(survivableConfig(makeRunConfig(13)), {
      ticks: 400,
      policy: stationaryPolicy,
      onTick: () => { seen++; },
    });
    expect(seen).toBe(r.state.tick);
  });
});

describe('scenarios used by the perf and swarm tests', () => {
  it('swarmConfig reaches the MAX_ENTITIES cap and never exceeds it (AC-5.3)', () => {
    const r = drive(swarmConfig(makeRunConfig(4)), { ticks: 700, policy: stationaryPolicy });
    expect(r.state.enemies.length).toBe(MAX_ENTITIES);
    expect(r.state.enemies.length).toBeLessThanOrEqual(MAX_ENTITIES);
  });

  it('survivableConfig keeps a stationary player alive well past where a real run dies', () => {
    const r = drive(survivableConfig(makeRunConfig(4)), { ticks: 12_000, policy: stationaryPolicy });
    expect(r.state.tick).toBe(12_000);
    expect(r.state.phase).not.toBe('ended');
  });

  // The full 54,000-tick survival (and its wall clock) is measured in perf.test.ts.
});

describe('policies', () => {
  it('exposes baseline, dodge, stationary and random under stable CLI names', () => {
    expect(Object.keys(POLICIES).sort()).toEqual(['baseline', 'dodge', 'random', 'stationary']);
  });

  it('stationary never moves', () => {
    const r = drive(survivableConfig(makeRunConfig(6)), { ticks: 500, policy: stationaryPolicy });
    expect(r.state.player.pos).toEqual({ x: 0, y: 0 });
  });

  it('baseline kites: it moves away from the nearest enemy', () => {
    const r = drive(makeRunConfig(6), { ticks: 400, policy: baselinePolicy });
    expect(Math.hypot(r.state.player.pos.x, r.state.player.pos.y)).toBeGreaterThan(1);
  });

  it('baseline resolves every offer it is shown (AC-26.1 path)', () => {
    const r = drive(makeRunConfig(6), { ticks: 6000, policy: baselinePolicy });
    const presented = r.events.filter((e) => e.type === 'offer_presented').length;
    const resolved = r.events.filter((e) => e.type === 'offer_resolved').length;
    expect(presented).toBeGreaterThan(0);
    expect(resolved).toBe(presented);
  });

  it('random is a pure function of (state, seed), so runs stay deterministic', () => {
    const p = randomPolicy(31);
    const q = randomPolicy(31);
    const a = drive(makeRunConfig(8), { ticks: 1200, policy: p });
    const b = drive(makeRunConfig(8), { ticks: 1200, policy: q });
    expect(b.state.tick).toBe(a.state.tick);
    expect(b.summary).toEqual(a.summary);
  });

  it('random with a different policy seed actually behaves differently', () => {
    const a = drive(makeRunConfig(8), { ticks: 1200, policy: randomPolicy(1) });
    const b = drive(makeRunConfig(8), { ticks: 1200, policy: randomPolicy(2) });
    expect(b.state.player.pos).not.toEqual(a.state.player.pos);
  });

  it('every policy emits a finite, JSON-safe move vector', () => {
    for (const [name, policy] of Object.entries(POLICIES)) {
      const r = drive(makeRunConfig(8), { ticks: 900, policy: policy(1) });
      expect(Number.isFinite(r.state.player.pos.x), name).toBe(true);
      expect(Number.isFinite(r.state.player.pos.y), name).toBe(true);
    }
  });
});
