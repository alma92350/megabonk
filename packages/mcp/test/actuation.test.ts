import { describe, it, expect } from 'vitest';
import { snapTo8, TICKS_PER_SECOND } from '@megabonk/sim';
import { resolveHandicap } from '../src/handicap.js';
import { Actuator, resolveIntentVector } from '../src/actuation.js';
import { observeState } from '../src/observation.js';
import { enemyAt, stateWith } from './helpers.js';

const H = resolveHandicap();
const FREE = resolveHandicap({ profile: 'unrestricted' });

describe('FR-28 actuation handicap', () => {
  it('AC-28.1: an intent set at tick 100 applies at tick 105, not before', () => {
    const a = new Actuator(H);
    const before = a.activeIntentFor(100);
    const res = a.submitIntent({ kind: 'vector', x: 1, y: 0 }, 100);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.appliesAtTick).toBe(105);
    for (let t = 101; t <= 104; t++) expect(a.activeIntentFor(t)).toEqual(before);
    expect(a.activeIntentFor(105)).toEqual({ kind: 'vector', x: 1, y: 0 });
  });

  it('AC-25.2: with no action delay an intent applies from T+1 and persists until replaced', () => {
    const a = new Actuator(FREE);
    a.submitIntent({ kind: 'vector', x: -1, y: 0 }, 100);
    expect(a.activeIntentFor(101)).toEqual({ kind: 'vector', x: -1, y: 0 });
    for (let t = 102; t < 400; t++) {
      expect(a.activeIntentFor(t)).toEqual({ kind: 'vector', x: -1, y: 0 });
    }
    a.submitIntent({ kind: 'kite_nearest' }, 400);
    expect(a.activeIntentFor(401)).toEqual({ kind: 'kite_nearest' });
  });

  it('AC-28.2: the 9th intent change inside one second is rejected, not queued', () => {
    const a = new Actuator(H);
    const accepted: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = a.submitIntent({ kind: 'vector', x: 1, y: i }, 100 + i);
      expect(r.ok).toBe(true);
      accepted.push(100 + i);
    }
    const ninth = a.submitIntent({ kind: 'vector', x: 1, y: 99 }, 108);
    expect(ninth.ok).toBe(false);
    if (!ninth.ok) expect(ninth.error.code).toBe('rate_limited');
    expect(a.acceptedTicks).toEqual(accepted); // the rejection mutated nothing
    // The 8 accepted ones all landed.
    expect(a.activeIntentFor(200)).toEqual({ kind: 'vector', x: 1, y: 7 });
    // A full second later the budget is free again.
    const later = a.submitIntent({ kind: 'vector', x: 0, y: 1 }, 100 + TICKS_PER_SECOND);
    expect(later.ok).toBe(true);
  });

  it('AC-28.2: unrestricted has no rate cap', () => {
    const a = new Actuator(FREE);
    for (let i = 0; i < 60; i++) {
      expect(a.submitIntent({ kind: 'vector', x: 1, y: i }, 100).ok).toBe(true);
    }
  });

  it('AC-28.3: an intent vector of (0.31, 0.95) is snapped to a compass direction', () => {
    const obs = observeState(stateWith(0, []), H, { frame: 0 });
    const moved = resolveIntentVector({ kind: 'vector', x: 0.31, y: 0.95 }, obs, H);
    expect(moved).toEqual(snapTo8({ x: 0.31, y: 0.95 }));
    expect(moved).toEqual({ x: 0, y: 1 });
    // 17 degrees is not expressible under the handicap...
    const seventeen = { x: Math.cos(0.2967), y: Math.sin(0.2967) };
    expect(resolveIntentVector({ kind: 'vector', ...seventeen }, obs, H)).toEqual({ x: 1, y: 0 });
    // ...but the debug profile keeps the raw heading.
    const free = resolveIntentVector({ kind: 'vector', ...seventeen }, obs, FREE);
    expect(free.x).toBeCloseTo(seventeen.x, 6);
    expect(free.y).toBeCloseTo(seventeen.y, 6);
  });

  it('FR-24: semantic intents resolve against the observation, not the raw state', () => {
    const s = stateWith(0, [enemyAt(1, { x: 4, y: 0 })]);
    const obs = observeState(s, H, { frame: 0 });
    const kite = resolveIntentVector({ kind: 'kite_nearest' }, obs, H);
    expect(kite).toEqual({ x: -1, y: 0 }); // away from the only threat
    expect(resolveIntentVector({ kind: 'hold' }, obs, H)).toEqual({ x: 0, y: 0 });
    // With nothing visible there is nothing to kite: hold rather than invent a heading.
    const empty = observeState(stateWith(0, []), H, { frame: 0 });
    expect(resolveIntentVector({ kind: 'kite_nearest' }, empty, H)).toEqual({ x: 0, y: 0 });
  });

  it('AC-28.4: the offer decision floor is 30 ticks measured from openedTick', () => {
    const a = new Actuator(H);
    expect(a.offerDecisionAllowed(0)).toBe(false);
    expect(a.offerDecisionAllowed(20)).toBe(false);
    expect(a.offerDecisionAllowed(29)).toBe(false);
    expect(a.offerDecisionAllowed(30)).toBe(true);
    expect(new Actuator(FREE).offerDecisionAllowed(0)).toBe(true);
  });
});
