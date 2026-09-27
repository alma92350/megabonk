/**
 * FR-6 run summary.
 *
 * AC-6.2: derivable purely from the event log, with no access to live sim state.
 * That is what lets the browser client, the headless harness and the MCP server
 * all produce byte-identical summaries from the same run.
 */

import { silverFor } from './rules.js';
import type { SimEvent } from './types.js';

export interface RunSummary {
  readonly seed: number;
  readonly outcome: 'survived' | 'died';
  readonly seconds: number;
  readonly kills: number;
  readonly bossKills: number;
  readonly level: number;
  readonly goldEarned: number;
  readonly silverEarned: number;
  readonly damageTaken: number;
  readonly picks: readonly string[];
  /** FR-29: which handicap profile drove this run; null for a human. */
  readonly agentProfile: string | null;
}

export function summarise(events: readonly SimEvent[], agentProfile: string | null = null): RunSummary {
  let seed = 0;
  let outcome: 'survived' | 'died' = 'died';
  let seconds = 0;
  let kills = 0;
  let bossKills = 0;
  let level = 1;
  let goldEarned = 0;
  let damageTaken = 0;
  const picks: string[] = [];

  for (const e of events) {
    switch (e.type) {
      case 'run_start':
        seed = Number(e.data?.seed ?? 0);
        break;
      case 'enemy_killed':
        kills++;
        break;
      case 'boss_killed':
        bossKills++;
        break;
      case 'level_up':
        level = Math.max(level, Number(e.data?.level ?? level));
        break;
      case 'gold_gained':
        goldEarned += Number(e.data?.amount ?? 0);
        break;
      case 'damage_taken':
        damageTaken += Number(e.data?.amount ?? 0);
        break;
      case 'offer_resolved':
        picks.push(String(e.data?.id ?? '?'));
        break;
      case 'run_end':
        outcome = e.data?.outcome === 'survived' ? 'survived' : 'died';
        seconds = Number(e.data?.seconds ?? 0);
        break;
      default:
        break;
    }
  }

  return {
    seed,
    outcome,
    seconds,
    kills,
    bossKills,
    level,
    goldEarned,
    silverEarned: silverFor(kills, level, outcome === 'survived'),
    damageTaken,
    picks,
    agentProfile,
  };
}
