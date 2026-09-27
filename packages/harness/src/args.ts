/**
 * Tolerant CLI argument parsing for the harness CLIs.
 *
 * Both CLIs are run by developers in a hurry and by CI. Neither may throw a stack
 * trace at a typo: a garbage flag is reported and ignored, a missing value falls
 * back to the documented default. `parseArgs` is pure so it can be unit-tested
 * without spawning a process.
 */

export interface ParsedArgs {
  /** Recognised `--key=value` / `--key value` pairs, last occurrence winning. */
  readonly values: Readonly<Record<string, string>>;
  /** `--flag` with no value. */
  readonly flags: ReadonlySet<string>;
  /** Bare words, in order. */
  readonly positionals: readonly string[];
  /** Tokens that were not usable at all, for a warning line. */
  readonly unknown: readonly string[];
}

const BOOLEAN_FLAG = /^--([a-zA-Z][\w-]*)$/;
const KEY_VALUE = /^--([a-zA-Z][\w-]*)=(.*)$/s;

export function parseArgs(argv: readonly string[], valueKeys: readonly string[] = []): ParsedArgs {
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  const positionals: string[] = [];
  const unknown: string[] = [];
  const wantsValue = new Set(valueKeys);

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    const kv = KEY_VALUE.exec(token);
    if (kv) {
      values[kv[1]!] = kv[2]!;
      continue;
    }
    const bare = BOOLEAN_FLAG.exec(token);
    if (bare) {
      const key = bare[1]!;
      const next = argv[i + 1];
      if (wantsValue.has(key) && next !== undefined && !next.startsWith('--')) {
        values[key] = next;
        i++;
      } else {
        flags.add(key);
      }
      continue;
    }
    if (token.startsWith('-') && token !== '-') {
      unknown.push(token);
      continue;
    }
    positionals.push(token);
  }

  return { values, flags, positionals, unknown };
}

/** An integer, or the fallback when the value is missing, blank or not a number. */
export function intArg(args: ParsedArgs, key: string, fallback: number): number {
  const raw = args.values[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

export function stringArg(args: ParsedArgs, key: string, fallback: string): string {
  const raw = args.values[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw.trim();
}

export function boolArg(args: ParsedArgs, key: string): boolean {
  if (args.flags.has(key)) return true;
  const raw = args.values[key];
  if (raw === undefined) return false;
  return raw !== 'false' && raw !== '0' && raw !== '';
}

/** Warnings for anything the caller got wrong, so a typo is visible, not silent. */
export function argWarnings(args: ParsedArgs, known: readonly string[]): string[] {
  const out: string[] = [];
  for (const token of args.unknown) out.push(`ignoring unparseable argument: ${token}`);
  const knownSet = new Set(known);
  for (const key of Object.keys(args.values)) {
    if (!knownSet.has(key)) out.push(`ignoring unknown option: --${key}`);
  }
  for (const key of args.flags) {
    if (!knownSet.has(key)) out.push(`ignoring unknown flag: --${key}`);
  }
  for (const p of args.positionals) out.push(`ignoring stray argument: ${p}`);
  return out;
}
