import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAdvice,
  getAdvice,
  installAdviceBridge,
  setAdvice,
  subscribeAdvice,
} from '../src/advice.js';

beforeEach(() => clearAdvice());

describe('advice store (FR-21)', () => {
  it('AC-21.1: starts empty so the overlay is absent by default', () => {
    expect(getAdvice()).toBeNull();
  });

  it('stores a recommendation', () => {
    const a = setAdvice({ pickIndex: 1, headline: 'Take the Tome of Fury', rationale: 'DPS is behind curve.' });
    expect(a).not.toBeNull();
    expect(getAdvice()).toEqual(a);
    expect(a!.pickIndex).toBe(1);
    expect(a!.status).toBe('ready');
  });

  it('AC-21.2: a pending advisor is representable and carries no pick', () => {
    const a = setAdvice({ status: 'pending' });
    expect(a!.status).toBe('pending');
    expect(a!.pickIndex).toBeNull();
    expect(a!.headline.length).toBeGreaterThan(0);
  });

  it('rejects an out-of-range or non-integer pick instead of throwing', () => {
    expect(setAdvice({ pickIndex: 9, headline: 'x' })!.pickIndex).toBeNull();
    expect(setAdvice({ pickIndex: -1, headline: 'x' })!.pickIndex).toBeNull();
    expect(setAdvice({ pickIndex: 1.5, headline: 'x' })!.pickIndex).toBeNull();
    expect(setAdvice({ pickIndex: Number.NaN, headline: 'x' })!.pickIndex).toBeNull();
  });

  it('coerces and truncates hostile strings', () => {
    const a = setAdvice({ headline: 'H'.repeat(500), rationale: 'R'.repeat(500) });
    expect(a!.headline.length).toBeLessThanOrEqual(80);
    expect(a!.rationale.length).toBeLessThanOrEqual(160);
  });

  it('strips newlines so the overlay cannot be made to overflow', () => {
    const a = setAdvice({ headline: 'a\nb\tc', rationale: 'd\r\ne' });
    expect(a!.headline).not.toMatch(/[\r\n\t]/);
    expect(a!.rationale).not.toMatch(/[\r\n]/);
  });

  it('accepts null to clear', () => {
    setAdvice({ headline: 'x' });
    expect(setAdvice(null)).toBeNull();
    expect(getAdvice()).toBeNull();
  });

  it('survives a malformed payload from an untrusted caller', () => {
    expect(() => setAdvice(undefined as never)).not.toThrow();
    expect(() => setAdvice(42 as never)).not.toThrow();
    expect(() => setAdvice('nope' as never)).not.toThrow();
    expect(getAdvice()).toBeNull();
  });

  it('notifies subscribers and can be unsubscribed', () => {
    const seen = vi.fn();
    const off = subscribeAdvice(seen);
    setAdvice({ headline: 'one' });
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    setAdvice({ headline: 'two' });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('a throwing subscriber cannot break setAdvice', () => {
    subscribeAdvice(() => { throw new Error('boom'); });
    expect(() => setAdvice({ headline: 'ok' })).not.toThrow();
    expect(getAdvice()!.headline).toBe('ok');
  });
});

describe('window.__megabonk bridge', () => {
  it('exposes setAdvice/clearAdvice/getAdvice for the MCP server', () => {
    const target: Record<string, unknown> = {};
    installAdviceBridge(target);
    const api = target.__megabonk as {
      setAdvice: (a: unknown) => unknown;
      clearAdvice: () => void;
      getAdvice: () => unknown;
      version: number;
    };
    expect(typeof api.setAdvice).toBe('function');
    expect(typeof api.clearAdvice).toBe('function');
    expect(typeof api.getAdvice).toBe('function');
    expect(api.version).toBeGreaterThanOrEqual(1);
    api.setAdvice({ pickIndex: 2, headline: 'Card 3', rationale: 'Because.' });
    expect(getAdvice()!.pickIndex).toBe(2);
    api.clearAdvice();
    expect(getAdvice()).toBeNull();
  });

  it('is idempotent and never throws on a frozen-ish target', () => {
    const target: Record<string, unknown> = {};
    installAdviceBridge(target);
    const first = target.__megabonk;
    installAdviceBridge(target);
    expect(target.__megabonk).toBe(first);
    expect(() => installAdviceBridge(null as never)).not.toThrow();
  });
});
