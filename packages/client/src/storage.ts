/**
 * Profile persistence.
 *
 * localStorage is not a reliable API: the accessor itself throws in a Safari
 * private window, the quota can be exhausted, and an extension can replace it
 * with something hostile. Every read and every write is wrapped, and the hub is
 * expected to render correctly with `available: false`.
 *
 * The parse/serialise rules live in @megabonk/meta so the browser and the
 * file-backed harness cannot drift apart.
 */

import { EMPTY_PROFILE, parseProfile, serialiseProfile, type Profile } from '@megabonk/meta';

export const PROFILE_KEY = 'megabonk.profile.v1';

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface LoadResult {
  readonly profile: Profile;
  readonly warning?: string;
  readonly available: boolean;
}

export interface SaveResult {
  readonly ok: boolean;
  readonly error?: string;
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function loadProfile(storage: StoragePort | null | undefined): LoadResult {
  if (storage === null || storage === undefined) {
    return { profile: EMPTY_PROFILE, available: false, warning: 'local storage is unavailable; progress will not be saved' };
  }
  let raw: string | null = null;
  try {
    raw = storage.getItem(PROFILE_KEY);
  } catch (err) {
    return {
      profile: EMPTY_PROFILE,
      available: false,
      warning: `local storage could not be read (${reason(err)}); progress will not be saved`,
    };
  }
  const parsed = parseProfile(raw);
  return parsed.warning === undefined
    ? { profile: parsed.profile, available: true }
    : { profile: parsed.profile, available: true, warning: parsed.warning };
}

export function saveProfile(storage: StoragePort | null | undefined, profile: Profile): SaveResult {
  if (storage === null || storage === undefined) return { ok: false, error: 'local storage is unavailable' };
  try {
    storage.setItem(PROFILE_KEY, serialiseProfile(profile));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: reason(err) };
  }
}

/** Browser accessor. Touching `window.localStorage` can itself throw. */
export function detectStorage(): StoragePort | null {
  try {
    const candidate = (globalThis as { localStorage?: StoragePort }).localStorage;
    if (candidate === undefined || candidate === null) return null;
    // Probe it: a private window can expose the object and refuse every write.
    const probe = '__megabonk_probe__';
    candidate.setItem(probe, '1');
    candidate.getItem(probe);
    candidate.removeItem?.(probe);
    return candidate;
  } catch {
    return null;
  }
}
