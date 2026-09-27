// ARCH-1 / NFR-1 enforcement: packages/sim must be pure and deterministic.
// Fails CI if the simulation reaches for wall-clock time, global randomness, or the DOM.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BANNED = [
  [/\bMath\s*\.\s*random\b/, 'Math.random — use the seeded RNG carried in GameState (ARCH-2)'],
  [/\bDate\s*\.\s*now\b/, 'Date.now — the sim advances by fixed dtMs only'],
  [/\bnew\s+Date\b/, 'new Date — the sim advances by fixed dtMs only'],
  [/\bperformance\s*\.\s*now\b/, 'performance.now — the sim advances by fixed dtMs only'],
  [/\bcrypto\s*\.\s*(randomUUID|getRandomValues)\b/, 'crypto randomness — use the seeded RNG'],
  [/\b(document|window|localStorage|requestAnimationFrame)\b/, 'DOM access — the sim must run headless'],
  [/\bprocess\s*\.\s*(env|hrtime|argv)\b/, 'process access — the sim must be pure'],
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

let failures = 0;
for (const file of walk('packages/sim/src')) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
    for (const [re, why] of BANNED) {
      if (re.test(line)) {
        console.error(`${file}:${i + 1}  ${why}\n    ${line.trim()}`);
        failures++;
      }
    }
  });
}

if (failures > 0) {
  console.error(`\ncheck:purity FAILED with ${failures} violation(s) in packages/sim.`);
  process.exit(1);
}
console.log('check:purity OK — packages/sim is free of wall-clock, global RNG and DOM access.');
