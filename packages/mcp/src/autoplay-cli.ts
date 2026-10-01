/**
 * `npm run agent:play` — play the browser game unattended through the bridge.
 *
 * The loop is deliberately thin: read, project, `decide`, post. Everything worth
 * testing lives in autoplay.ts as pure functions.
 *
 * This path is UNHANDICAPPED (see autoplay.ts) — for a handicap-comparable
 * agent, use `npm run agent:live`, which routes through the FR-27/FR-28 filter.
 */

import { bridgeApi, bridgeUrl, DEFAULT_BRIDGE_PORT } from '@megabonk/bridge';
import type { BridgeApi } from '@megabonk/bridge';
import type { GameState } from '@megabonk/sim';
import { decide, type AutoRun, type AutoView } from './autoplay.js';

/** Enemies beyond this are irrelevant to a flee vector, and retaining every
 * snapshot in full was enough to exhaust the heap on a 1000-enemy run. */
const ENEMY_BUDGET = 40;

export function projectRun(s: GameState): AutoRun {
  const weapons = s.player.weapons;
  return {
    tick: s.tick,
    phase: s.phase,
    hp: s.player.hp,
    gold: s.player.gold,
    halfExtent: s.map.halfExtent,
    pos: { x: s.player.pos.x, y: s.player.pos.y },
    arc: weapons.find((w) => w.id === 'bonker')?.level ?? 0,
    orb: weapons.find((w) => w.id === 'halo')?.level ?? 0,
    rerolls: s.player.rerolls,
    enemies: s.enemies.slice(0, ENEMY_BUDGET).map((e) => ({ x: e.pos.x, y: e.pos.y })),
    offer: s.offer ? s.offer.options.map((o) => ({ name: o.name })) : null,
    chests: s.interactables
      .filter((it) => it.kind === 'chest' && !it.used)
      .map((it) => ({ x: it.pos.x, y: it.pos.y })),
    pickup: s.pickups[0] ? { x: s.pickups[0].pos.x, y: s.pickups[0].pos.y } : null,
    stock: s.merchant
      ? s.merchant.stock.map((e) => ({ name: e.option.name, price: e.price, sold: e.sold }))
      : null,
  };
}

interface Args {
  readonly port: number;
  readonly hz: number;
}

export function parseAutoplayArgs(argv: readonly string[]): Args {
  let port = DEFAULT_BRIDGE_PORT;
  let hz = 5;
  for (const arg of argv) {
    if (arg.startsWith('--port=')) {
      const v = Number(arg.slice('--port='.length));
      if (!Number.isInteger(v) || v < 1024 || v > 65535) throw new Error(`Bad --port "${arg}".`);
      port = v;
    } else if (arg.startsWith('--hz=')) {
      const v = Number(arg.slice('--hz='.length));
      if (!Number.isFinite(v) || v <= 0 || v > 30) throw new Error(`Bad --hz "${arg}".`);
      hz = v;
    }
  }
  return { port, hz };
}

async function readView(api: BridgeApi): Promise<AutoView> {
  const [doc, screen] = await Promise.all([api.readState<GameState>(), api.readScreen()]);
  return {
    screen: screen.value,
    run: doc.value === null ? null : projectRun(doc.value),
  };
}

export async function runOnce(api: BridgeApi, log: (line: string) => void): Promise<void> {
  const view = await readView(api);
  const action = decide(view);
  switch (action.kind) {
    case 'wait':
      return;
    case 'restart':
      // On the summary screen the client maps a reroll onto startRun(), which is
      // what lets this chain runs without a human.
      log('run over — starting the next one');
      await api.publishIntent({ control: true, reroll: true });
      return;
    case 'reroll':
      await api.publishIntent({ control: true, reroll: true });
      return;
    case 'choose':
    case 'buy':
      // Both are a number-key press to the client: a card pick during an offer,
      // a purchase otherwise.
      await api.publishIntent({ control: true, chooseIndex: action.index });
      return;
    case 'move':
      await api.publishIntent({ control: true, move: { x: action.x, y: action.y } });
      return;
  }
}

async function main(): Promise<void> {
  const args = parseAutoplayArgs(process.argv.slice(2));
  const api = bridgeApi(bridgeUrl(args.port));
  const log = (line: string): void => {
    process.stderr.write(`[hollowlight] ${line}\n`);
  };

  log(`autoplay attached to :${args.port} at ${args.hz} Hz (unhandicapped).`);
  log('open the game with ?bridge and start a run; Ctrl-C to hand the controls back.');

  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    // Leaving the browser stuck under agent control would be the worst possible
    // way to exit.
    try {
      await api.publishIntent({ control: false });
      await api.publishAdvice(null);
    } catch {
      /* bridge already gone */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  const interval = 1000 / args.hz;
  while (!stopping) {
    try {
      await runOnce(api, log);
    } catch (err) {
      // A bridge that is not up yet, or has gone away, is a normal condition:
      // keep polling so the loop survives a bridge restart.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/fetch failed|ECONNREFUSED|socket hang up|terminated/i.test(msg)) {
        log(`autoplay error: ${msg}`);
      }
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

if (process.argv[1]?.includes('autoplay-cli')) {
  main().catch((err: unknown) => {
    process.stderr.write(`[hollowlight] autoplay failed: ${String(err)}\n`);
    process.exit(1);
  });
}
