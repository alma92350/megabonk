import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, purchase, serialiseProfile } from '@megabonk/meta';
import { PROFILE_KEY, loadProfile, saveProfile } from '../src/storage.js';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
}

const throwing = {
  getItem(): string | null { throw new DOMException('denied'); },
  setItem(): void { throw new DOMException('denied'); },
};

describe('profile persistence through localStorage', () => {
  it('returns the empty profile when storage is empty', () => {
    const r = loadProfile(new MemoryStorage());
    expect(r.profile).toEqual(EMPTY_PROFILE);
    expect(r.available).toBe(true);
  });

  it('round-trips a purchased profile', () => {
    const s = new MemoryStorage();
    const bought = purchase({ ...EMPTY_PROFILE, silver: 500 }, 'reroll').profile;
    expect(saveProfile(s, bought).ok).toBe(true);
    expect(loadProfile(s).profile).toEqual(bought);
    expect(s.getItem(PROFILE_KEY)).toBe(serialiseProfile(bought));
  });

  it('survives a corrupt payload with a warning, not a crash (AC-15.3)', () => {
    const s = new MemoryStorage();
    s.setItem(PROFILE_KEY, '{not json');
    const r = loadProfile(s);
    expect(r.profile).toEqual(EMPTY_PROFILE);
    expect(r.warning).toBeTruthy();
  });

  it('reports a schema mismatch rather than misreading it (AC-15.4)', () => {
    const s = new MemoryStorage();
    s.setItem(PROFILE_KEY, JSON.stringify({ schemaVersion: 99, silver: 9999 }));
    const r = loadProfile(s);
    expect(r.profile.silver).toBe(0);
    expect(r.warning).toMatch(/schema/i);
  });

  it('handles a storage that throws on read (private window)', () => {
    const r = loadProfile(throwing);
    expect(r.profile).toEqual(EMPTY_PROFILE);
    expect(r.available).toBe(false);
    expect(r.warning).toBeTruthy();
  });

  it('handles a storage that throws on write', () => {
    const r = saveProfile(throwing, EMPTY_PROFILE);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('handles storage being absent entirely', () => {
    expect(loadProfile(null).available).toBe(false);
    expect(loadProfile(undefined).profile).toEqual(EMPTY_PROFILE);
    expect(saveProfile(null, EMPTY_PROFILE).ok).toBe(false);
  });

  it('never throws whatever the storage does', () => {
    const hostile = {
      getItem(): string { return '\u0000￿'; },
      setItem(): void { throw 'a string, not an Error'; },
    };
    expect(() => loadProfile(hostile)).not.toThrow();
    expect(() => saveProfile(hostile, EMPTY_PROFILE)).not.toThrow();
  });
});
