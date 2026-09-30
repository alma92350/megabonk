import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { content } from '../src/index.js';
import { UNLOCKS, QUESTS } from '@megabonk/meta';

/**
 * Originality guard.
 *
 * An independent audit found that the on-screen title was the name of an
 * existing commercial game in this genre, and that a few core terms echoed the
 * same product. Renaming them once is not enough: a stray literal in a new
 * feature would quietly bring one back. This test fails the build if a banned
 * term reaches any player-facing string.
 *
 * It is a NAME check, not a legal clearance. It does not, and cannot, replace a
 * trademark search on the chosen title before a commercial release.
 *
 * Generic words (gold, chest, shrine, goblin) are deliberately not banned:
 * only distinctive, product-specific names and the specific systemic terms that
 * were borrowed.
 */
const BANNED: ReadonlyArray<readonly [RegExp, string]> = [
  [/megabonk/i, 'the name of an existing commercial game'],
  [/\bbonk\w*/i, 'the "bonk" root of that game\'s title'],
  [/\btomes?\b/i, 'that game\'s name for its passive-stat item class (use "Rite")'],
  [/\bsilver\b/i, 'that game\'s meta-currency name (use "Mote")'],
  [/\bhulk\b/i, 'a trademarked character name'],
  [/\bwarden\b/i, 'a well-known mob in another game (use "Old Crown")'],
  [/\bbastion\b/i, 'the title of an existing game'],
  [/\bhalo\b/i, 'a major game franchise (use "Wisp Ring")'],
];

function violations(text: string): string[] {
  return BANNED.filter(([re]) => re.test(text)).map(([, why]) => why);
}

const HERE = dirname(new URL(import.meta.url).pathname);
const PKGS = resolve(HERE, '../..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('originality: content names and descriptions', () => {
  const groups: Array<[string, Record<string, { name: string; description?: string }>]> = [
    ['weapons', content.weapons],
    ['tomes', content.tomes],
    ['items', content.items],
    ['enemies', content.enemies],
    ['biomes', content.biomes],
    ['characters', content.characters],
    ['shrines', content.shrines ?? {}],
  ];

  for (const [group, table] of groups) {
    it(`no ${group} name or description uses a banned term`, () => {
      const bad: string[] = [];
      for (const [id, def] of Object.entries(table)) {
        for (const text of [def.name, def.description ?? '']) {
          for (const why of violations(text)) bad.push(`${group}.${id}: "${text}" — ${why}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }

  it('unlock and quest names and descriptions are clean', () => {
    const bad: string[] = [];
    for (const u of UNLOCKS) {
      for (const text of [u.name, u.description]) {
        for (const why of violations(text)) bad.push(`unlock ${u.id}: "${text}" — ${why}`);
      }
    }
    for (const q of QUESTS) {
      for (const text of [q.name, q.description]) {
        for (const why of violations(text)) bad.push(`quest ${q.id}: "${text}" — ${why}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the renamed terms are actually in place', () => {
    expect(content.weapons.bonker!.name).toBe('Rootclub');
    expect(content.weapons.halo!.name).toBe('Wisp Ring');
    expect(content.enemies.warden!.name).toBe('The Old Crown');
    expect(content.enemies.tank!.name).toBe('Cairnwight');
    expect(content.characters.bastion!.name).toBe('Barkguard');
    for (const t of Object.values(content.tomes)) expect(t.name).toMatch(/^Rite of /);
  });
});

/**
 * Literal-string scan of the shipped source. Only string literals are checked, so
 * identifiers (`profile.silver`, `LoadoutKind = 'tome'`, `window.__megabonk`) are
 * unaffected: those are internal names a player never sees. The allow-list below
 * is EXACT-MATCH and short on purpose.
 */
describe('originality: player-facing strings in shipped source', () => {
  /**
   * Internal ids and module paths that legitimately contain a banned word.
   *
   * The ID_LIKE rule skips lowercase tokens with no spaces (content ids such as
   * 'bonker' or 'warden', sprite-cache keys like "pj:halo", protocol strings).
   * Those are identifiers, not text a player reads, and renaming them would break
   * saved recordings, goldens and tests for no originality benefit. Anything with
   * a space or a capital letter IS treated as player-facing and is checked.
   */
  const ALLOWED_EXACT = new Set(['tome']);
  const ALLOWED_PREFIX = ['@megabonk/', './', '../'];
  const ID_LIKE = /^[a-z0-9_.:\-${}]+$/;

  function literals(source: string): string[] {
    // Strip line and block comments first so prose about the old names is fine.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    const found: string[] = [];
    const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
    for (let m = re.exec(code); m !== null; m = re.exec(code)) {
      found.push(m[1] ?? m[2] ?? m[3] ?? '');
    }
    return found;
  }

  const roots = ['client/src', 'meta/src', 'content/src', 'mcp/src', 'bridge/src'].map((r) => join(PKGS, r));
  const files = roots.flatMap((r) => walk(r));

  it('finds source files to scan (so this guard cannot pass vacuously)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('no string literal contains a banned term', () => {
    const bad: string[] = [];
    for (const file of files) {
      for (const lit of literals(readFileSync(file, 'utf8'))) {
        if (ALLOWED_EXACT.has(lit) || ID_LIKE.test(lit)) continue;
        if (ALLOWED_PREFIX.some((p) => lit.startsWith(p))) continue;
        // `${profile.silver}` is a code expression naming an internal field, not text
        // a player reads. Check the words AROUND the interpolations.
        const text = lit.replace(/\$\{[^}]*\}/g, '');
        for (const why of violations(text)) {
          bad.push(`${file.replace(PKGS + '/', '')}: "${lit.slice(0, 70)}" — ${why}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('the browser storage keys do not carry the old title', async () => {
    // Visible in devtools, so treated as branding even though they are id-like.
    const { PROFILE_KEY } = await import('../../client/src/storage.js');
    const { RECORDINGS_KEY } = await import('../../client/src/recordings.js');
    expect(PROFILE_KEY).toMatch(/^hollowlight\./);
    expect(RECORDINGS_KEY).toMatch(/^hollowlight\./);
  });

  it('the page title, label and fallback text are clean', () => {
    const html = readFileSync(join(PKGS, 'client/index.html'), 'utf8');
    expect(violations(html)).toEqual([]);
    expect(html).toMatch(/<title>Hollowlight<\/title>/);
  });
});
