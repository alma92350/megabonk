import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { replay, type Recording } from '@megabonk/sim';
import { makeRunConfig } from '@megabonk/content';

const url = new URL('../corpus/human-runs.json', import.meta.url);
const runs = (JSON.parse(readFileSync(url, 'utf8')) as { recording: Recording }[]).map((r) => r.recording);

describe('human run corpus (AC-30.1)', () => {
  it('holds at least 9 faithfully replayable human runs', () => {
    expect(runs.length).toBeGreaterThanOrEqual(9);
  });

  it.each(runs.map((r) => [r.seed, r] as const))('seed %i replays to its recorded end', (_seed, rec) => {
    const s = replay(makeRunConfig(rec.seed, { ...(rec.unlocks ? { unlocks: rec.unlocks } : {}) }), rec).state;
    if (s.phase === 'ended') expect(Math.abs(s.tick - rec.ticks)).toBeLessThanOrEqual(3);
    else expect(s.tick).toBeGreaterThanOrEqual(rec.ticks);
  });
});
