/**
 * Local storage for run recordings.
 *
 * Keeps the most recent runs so a player can export them, which is how the
 * human corpus for FR-30 parity validation gets built. Every localStorage call
 * is wrapped: it throws in private windows, and a failure to save a replay must
 * never interrupt a run.
 */

import type { Recording } from '@megabonk/sim';

export const RECORDINGS_KEY = 'hollowlight.recordings.v1';
export const MAX_STORED = 10;

export interface StoredRecording {
  readonly recording: Recording;
  /** Headline numbers, so the list is readable without replaying each one. */
  readonly seconds: number;
  readonly kills: number;
  readonly level: number;
  readonly outcome: string;
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

export function loadRecordings(storage: Storage | null | undefined): StoredRecording[] {
  if (!storage) return [];
  let raw: string | null;
  try {
    raw = storage.getItem(RECORDINGS_KEY);
  } catch {
    return [];
  }
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is StoredRecording =>
        typeof r === 'object' && r !== null && typeof (r as StoredRecording).recording === 'object',
    );
  } catch {
    return [];
  }
}

/** Newest first, capped. Returns the list it stored, for the caller to render. */
export function saveRecording(
  storage: Storage | null | undefined,
  entry: StoredRecording,
): StoredRecording[] {
  const next = [entry, ...loadRecordings(storage)].slice(0, MAX_STORED);
  if (storage) {
    try {
      storage.setItem(RECORDINGS_KEY, JSON.stringify(next));
    } catch {
      // Quota or a private window. The run still happened; the replay is just
      // not kept, which is not worth interrupting anyone over.
    }
  }
  return next;
}

/** A corpus file: what a player exports and the harness reads back. */
export function exportCorpus(entries: readonly StoredRecording[]): string {
  return JSON.stringify(
    { version: 1, exportedRuns: entries.length, runs: entries.map((e) => e.recording) },
    null,
    2,
  );
}
