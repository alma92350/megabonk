/**
 * The CLIs behind `npm run agent:auto` (FR-26) and `npm run bench` (NFR-2).
 *
 * The point of this file is that a developer's typo must never produce a stack
 * trace: garbage, missing values and unknown flags all fall back to documented
 * defaults and print a warning. Argument parsing is therefore a pure function,
 * tested directly, with no process spawning.
 */
import { describe, it, expect } from 'vitest';
import { argWarnings, boolArg, intArg, parseArgs, stringArg } from '../src/args.js';
import { USAGE, parseAutoOptions, runAuto } from '../src/auto.js';
import { FULL_RUN_TICKS } from '../src/drive.js';
import { BENCH_USAGE, runBenchCli } from '../src/bench.js';
import { goldensCli } from '../src/goldens.js';

describe('parseArgs', () => {
  it('handles --key=value, --key value, bare flags and positionals', () => {
    const a = parseArgs(['--seed=5', '--ticks', '900', '--json', 'stray'], ['ticks']);
    expect(a.values.seed).toBe('5');
    expect(a.values.ticks).toBe('900');
    expect(a.flags.has('json')).toBe(true);
    expect(a.positionals).toEqual(['stray']);
  });

  it('never throws on an empty, garbage or hostile argv', () => {
    for (const argv of [
      [],
      ['--'],
      ['-x'],
      ['---weird'],
      ['--seed'],
      ['--seed='],
      ['--seed=abc'],
      ['--seed=NaN'],
      ['--seed=1e999'],
      ['--ticks=-5'],
      ['--policy='],
      ['=5'],
      ['--a=1', '--a=2'],
      ['\u0000'],
    ]) {
      expect(() => parseArgs(argv, ['seed', 'ticks', 'policy']), argv.join(' ')).not.toThrow();
    }
  });

  it('lets the last occurrence of a repeated key win', () => {
    expect(parseArgs(['--seed=1', '--seed=2']).values.seed).toBe('2');
  });

  it('intArg falls back for missing, blank and non-numeric values', () => {
    const a = parseArgs(['--blank=', '--bad=abc', '--good=42', '--float=3.9']);
    expect(intArg(a, 'missing', 7)).toBe(7);
    expect(intArg(a, 'blank', 7)).toBe(7);
    expect(intArg(a, 'bad', 7)).toBe(7);
    expect(intArg(a, 'good', 7)).toBe(42);
    expect(intArg(a, 'float', 7)).toBe(3);
  });

  it('stringArg and boolArg fall back sanely', () => {
    const a = parseArgs(['--name=  padded  ', '--empty=', '--on', '--off=false']);
    expect(stringArg(a, 'name', 'x')).toBe('padded');
    expect(stringArg(a, 'empty', 'x')).toBe('x');
    expect(boolArg(a, 'on')).toBe(true);
    expect(boolArg(a, 'off')).toBe(false);
    expect(boolArg(a, 'absent')).toBe(false);
  });

  it('warns about unknown options, unknown flags and stray words', () => {
    const a = parseArgs(['--nope=1', '--alsonope', 'stray', '-x']);
    const w = argWarnings(a, ['seed']);
    expect(w.join('\n')).toMatch(/unknown option: --nope/);
    expect(w.join('\n')).toMatch(/unknown flag: --alsonope/);
    expect(w.join('\n')).toMatch(/stray argument: stray/);
    expect(w.join('\n')).toMatch(/unparseable argument: -x/);
  });
});

describe('auto.ts argument handling (FR-26)', () => {
  it('defaults to a full 15-minute run on seed 0 with the baseline policy', () => {
    const o = parseAutoOptions([]);
    expect(o).toMatchObject({ seed: 0, ticks: FULL_RUN_TICKS, policy: 'baseline', json: false });
    expect(o.warnings).toEqual([]);
  });

  it('parses --seed, --ticks, --policy and --json', () => {
    const o = parseAutoOptions(['--seed=99', '--ticks=1200', '--policy=stationary', '--json']);
    expect(o).toMatchObject({ seed: 99, ticks: 1200, policy: 'stationary', json: true });
  });

  it('falls back to baseline and warns on an unknown policy instead of crashing', () => {
    const o = parseAutoOptions(['--policy=godmode']);
    expect(o.policy).toBe('baseline');
    expect(o.warnings.join('\n')).toMatch(/unknown policy "godmode"/);
  });

  it('falls back and warns on a non-numeric seed and a non-positive tick count', () => {
    const o = parseAutoOptions(['--seed=banana', '--ticks=0']);
    expect(o.seed).toBe(0);
    expect(o.ticks).toBe(FULL_RUN_TICKS);
    expect(o.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('never throws while parsing garbage', () => {
    for (const argv of [['--seed'], ['--seed=--ticks=3'], ['-'], ['--ticks=abc', '--policy'], ['--help', '--json']]) {
      expect(() => parseAutoOptions(argv), argv.join(' ')).not.toThrow();
    }
  });

  it('--help prints usage and exits 0 without running a simulation', () => {
    const r = runAuto(['--help']);
    expect(r.exitCode).toBe(0);
    expect(r.lines.join('\n')).toBe(USAGE);
  });

  it('runs a short seeded run and prints the headline summary fields', () => {
    const r = runAuto(['--seed=3', '--ticks=600']);
    expect(r.exitCode).toBe(0);
    const text = r.lines.join('\n');
    for (const field of ['seed', 'outcome', 'level', 'kills', 'silver', 'terminalHash', 'agentProfile']) {
      expect(text).toContain(field);
    }
  });

  it('--json emits parseable JSON carrying the terminal hash (AC-26.2 fixture)', () => {
    const r = runAuto(['--seed=3', '--ticks=600', '--json']);
    const payload = JSON.parse(r.lines[r.lines.length - 1]!) as Record<string, unknown>;
    expect(payload.seed).toBe(3);
    expect(payload.policy).toBe('baseline');
    expect(payload.terminalHash).toMatch(/^[0-9a-f]{16}$/);
    const again = JSON.parse(runAuto(['--seed=3', '--ticks=600', '--json']).lines.slice(-1)[0]!) as Record<string, unknown>;
    expect(again.terminalHash).toBe(payload.terminalHash);
    expect(again.kills).toBe(payload.kills);
  });

  it('reports a bad character or biome as an error line, not an exception', () => {
    const r = runAuto(['--seed=1', '--ticks=60', '--character=nobody']);
    expect(r.exitCode).toBe(1);
    expect(r.lines.join('\n')).toMatch(/^error: /m);
  });

  it('warns about unknown flags but still completes the run', () => {
    const r = runAuto(['--seed=1', '--ticks=120', '--turbo']);
    expect(r.exitCode).toBe(0);
    expect(r.lines.join('\n')).toMatch(/warning: ignoring unknown flag: --turbo/);
  });
});

describe('bench.ts and goldens.ts CLI surfaces', () => {
  it('bench --help prints usage and exits 0 without benchmarking', () => {
    const lines: string[] = [];
    expect(runBenchCli(['--help'], (l) => lines.push(l))).toBe(0);
    expect(lines.join('\n')).toBe(BENCH_USAGE);
  });

  it('goldens CLI reports corpus status and exits 0', () => {
    const lines: string[] = [];
    expect(goldensCli([], (l) => lines.push(l))).toBe(0);
    expect(lines.join('\n')).toMatch(/golden corpus: \d+ seeds/);
    expect(lines.join('\n')).toMatch(/status:\s+(CURRENT|STALE)/);
  });
});
