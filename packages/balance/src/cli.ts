/**
 * `npx tsx packages/balance/src/cli.ts [seeds] [maxSeconds]`
 *
 * Prints the full balance picture: per-policy distributions, the level pace, the
 * DPS curve, and the archetype domination table. This is the artifact quoted in
 * DESIGN.md, so it must be runnable in one command with no arguments.
 */

import { characters, content, DEFAULT_CHARACTER } from '@megabonk/content';
import { combatArchetypes, utilityArchetypes, pickCost, scaleArchetypes } from './builds.js';
import { dominationRatio, measureDps } from './dps.js';
import { formatReport, report, runMany, seedRange } from './harness.js';
import { chargePolicy, kitePolicy, stationaryPolicy } from './policies.js';

const seeds = seedRange(1, Number(process.argv[2] ?? 12));
const maxSeconds = Number(process.argv[3] ?? 900);

for (const policy of [kitePolicy(), chargePolicy(), stationaryPolicy()]) {
  const results = runMany(seeds, policy, { maxSeconds, sampleEvery: 60 });
  console.log(formatReport(report(results, maxSeconds)));
  console.log('');
}

console.log('--- per character (kite policy) ---');
for (const id of Object.keys(characters)) {
  const results = runMany(seeds.slice(0, 8), kitePolicy(), { characterId: id, maxSeconds, sampleEvery: 300 });
  const r = report(results, maxSeconds);
  console.log(
    `${id.padEnd(10)} survive=${(r.survivalRate * 100).toFixed(0)}% dur(med)=${r.duration.median.toFixed(0)}s ` +
      `lvl(med)=${r.level.median.toFixed(1)} kills(med)=${r.kills.median.toFixed(0)}`,
  );
}

console.log('\n--- archetype DPS at 10 picks (level 11), packed arena ---');
const start = characters[DEFAULT_CHARACTER]!.startingWeapon;
const combat = combatArchetypes(10).map((s) => ({ spec: s, dps: measureDps(s) }));
for (const { spec, dps } of combat) {
  console.log(`${dps.name.padEnd(12)} picks=${pickCost(spec, start)} dps=${dps.dps.toFixed(0)} hits/s=${dps.hitsPerSecond.toFixed(1)}`);
}
console.log(`domination ratio = ${dominationRatio(combat.map((c) => c.dps)).toFixed(2)}x`);
for (const spec of utilityArchetypes()) {
  const d = measureDps(spec);
  console.log(`(outlier) ${d.name.padEnd(10)} dps=${d.dps.toFixed(0)}`);
}

console.log('\n--- power curve: 4 vs 9 picks (level 5 vs level 10) ---');
for (const spec of combatArchetypes(10)) {
  const lo = measureDps(scaleArchetypes([spec], 4)[0]!);
  const hi = measureDps(scaleArchetypes([spec], 9)[0]!);
  console.log(`${spec.name.padEnd(12)} l5=${lo.dps.toFixed(0)} l10=${hi.dps.toFixed(0)} ratio=${(hi.dps / lo.dps).toFixed(2)}x`);
}

console.log(`\ncontent: ${Object.keys(content.weapons).length} weapons, ${Object.keys(content.tomes).length} tomes, ` +
  `${Object.keys(content.items).length} items, ${Object.keys(content.enemies).length} enemies, ` +
  `${Object.keys(content.characters).length} characters`);
