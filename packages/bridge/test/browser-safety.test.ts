import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The browser entry must never reach a node builtin.
 *
 * This is a regression guard for a real failure: index.ts once re-exported the
 * node:http server alongside the client helpers, Vite externalised it, and the
 * game page died at load with "node:http has been externalized" — a total
 * failure, not a degradation. Unit tests all passed, because they run in Node.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

function importsOf(file: string): string[] {
  const text = readFileSync(resolve(SRC, file), 'utf8');
  return [...text.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);
}

/** Follow relative imports from an entry point. */
function reachableFrom(entry: string, seen = new Set<string>()): string[] {
  if (seen.has(entry)) return [];
  seen.add(entry);
  const out: string[] = [];
  for (const spec of importsOf(entry)) {
    out.push(spec);
    if (spec.startsWith('./')) out.push(...reachableFrom(spec.replace(/^\.\//, '').replace(/\.js$/, '.ts'), seen));
  }
  return out;
}

describe('browser safety of the bridge client entry', () => {
  it('index.ts reaches no node: builtin, directly or transitively', () => {
    const specs = reachableFrom('index.ts');
    const nodeBuiltins = specs.filter((s) => s.startsWith('node:'));
    expect(nodeBuiltins, `browser entry pulls ${nodeBuiltins.join(', ')}`).toEqual([]);
  });

  it('index.ts does not re-export the server module', () => {
    const specs = reachableFrom('index.ts');
    expect(specs.some((s) => s.includes('server'))).toBe(false);
  });

  it('the server module is still reachable on its own, for node consumers', () => {
    expect(importsOf('server.ts').some((s) => s.startsWith('node:'))).toBe(true);
  });
});
