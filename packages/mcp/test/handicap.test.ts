import { describe, it, expect } from 'vitest';
import { TICKS_PER_SECOND } from '@megabonk/sim';
import {
  HUMAN_PARITY,
  UNRESTRICTED,
  aggregateProfile,
  parseHandicapArgs,
  resolveHandicap,
} from '../src/handicap.js';

describe('FR-29 handicap profiles', () => {
  it('AC-29.2: resolves to human-parity when nothing is specified', () => {
    expect(resolveHandicap().profile).toBe('human-parity');
    expect(parseHandicapArgs([]).profile).toBe('human-parity');
    expect(parseHandicapArgs(['--headless', '--seed=7']).profile).toBe('human-parity');
  });

  it('AC-29.2: unrestricted is reachable only by naming it', () => {
    expect(parseHandicapArgs(['--profile=unrestricted']).profile).toBe('unrestricted');
    expect(parseHandicapArgs(['--unrestricted']).profile).toBe('unrestricted');
    // No flag, a bogus flag, or a mistyped value must never fall through to unrestricted.
    expect(parseHandicapArgs(['--profile=']).profile).toBe('human-parity');
    expect(() => parseHandicapArgs(['--profile=godmode'])).toThrow(/unknown handicap profile/i);
  });

  it('FR-28/29: ms are converted to ticks once, at resolve time', () => {
    const h = resolveHandicap();
    expect(h.observationDelayTicks).toBe(12);
    expect(h.observationIntervalTicks).toBe(2);
    expect(h.actionDelayTicks).toBe(5);
    expect(h.offerDecisionFloorTicks).toBe(30);
    expect(h.offerTimeoutTicks).toBe(30 * TICKS_PER_SECOND);
    expect(h.intentChangesPerSecond).toBe(8);
    expect(h.declaredMs.observationDelayMs).toBe(200);
  });

  it('FR-29: unrestricted turns every filter off', () => {
    const h = resolveHandicap({ profile: 'unrestricted' });
    expect(h.observationDelayTicks).toBe(0);
    expect(h.observationIntervalTicks).toBe(1);
    expect(h.actionDelayTicks).toBe(0);
    expect(h.offerDecisionFloorTicks).toBe(0);
    expect(h.onScreenOnly).toBe(false);
    expect(h.bucketEnemyHp).toBe(false);
    expect(h.positionQuantum).toBe(0);
    expect(h.snapMovementTo8).toBe(false);
    expect(h.intentChangesPerSecond).toBe(0); // 0 = uncapped
  });

  it('FR-29: custom overrides name themselves custom and keep the rest of human-parity', () => {
    const h = resolveHandicap({ overrides: { observationDelayMs: 0 } });
    expect(h.profile).toBe('custom');
    expect(h.observationDelayTicks).toBe(0);
    expect(h.actionDelayTicks).toBe(5);
  });

  it('FR-29: resolved parameters are exported for the run summary and are frozen', () => {
    const h = resolveHandicap();
    expect(Object.isFrozen(h)).toBe(true);
    expect(HUMAN_PARITY.observationDelayMs).toBe(200);
    expect(UNRESTRICTED.observationDelayMs).toBe(0);
  });

  it('AC-29.4: aggregating summaries across differing profiles errors and names the mismatch', () => {
    const a = { agentProfile: 'human-parity' } as const;
    const b = { agentProfile: 'unrestricted' } as const;
    expect(aggregateProfile([a, a])).toBe('human-parity');
    expect(() => aggregateProfile([a, b])).toThrow(/human-parity/);
    expect(() => aggregateProfile([a, b])).toThrow(/unrestricted/);
    expect(() => aggregateProfile([])).toThrow(/no runs/i);
  });
});
