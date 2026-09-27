/** Shared fixtures for the MCP suite. Real content, real sim — no mocks of the sim. */

import { createRun, TICK_MS, step } from '@megabonk/sim';
import type { Enemy, GameState, InputFrame, RunConfig, Vec2 } from '@megabonk/sim';
import { makeRunConfig } from '@megabonk/content';

export const cfg = (seed = 4242): RunConfig => makeRunConfig(seed);

export function enemyAt(id: number, pos: Vec2, over: Partial<Enemy> = {}): Enemy {
  return {
    id,
    kind: 'grunt',
    pos,
    hp: 100,
    maxHp: 100,
    speed: 3,
    damage: 5,
    radius: 0.4,
    xp: 1,
    gold: 1,
    isBoss: false,
    attackCooldown: 0,
    stagger: 0,
    ...over,
  };
}

/** A state at a chosen tick with a handmade enemy roster — used for the perception unit tests. */
export function stateWith(
  tick: number,
  enemies: readonly Enemy[],
  config = cfg(),
  extra: Partial<GameState> = {},
): GameState {
  const base = createRun(config);
  return { ...base, tick, enemies, ...extra };
}

const still: InputFrame = { move: { x: 0, y: 0 } };

/** Drive the raw sim, auto-resolving offers, and hand back the state at each tick. */
export function driveSim(
  config: RunConfig,
  ticks: number,
  input: (s: GameState) => InputFrame = () => still,
): GameState[] {
  let state = createRun(config);
  const frames: GameState[] = [state];
  for (let i = 0; i < ticks * 3 && state.tick < ticks && state.phase !== 'ended'; i++) {
    const frame = state.phase === 'offer' ? { move: { x: 0, y: 0 }, chooseIndex: 0 } : input(state);
    state = step(state, frame, TICK_MS, config);
    frames.push(state);
  }
  return frames;
}

/** Recursively collect every key name in a payload. */
export function allKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) allKeys(v, out);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

/** Recursively collect every {x, y} pair in a payload. */
export function allPositions(value: unknown, out: Vec2[] = []): Vec2[] {
  if (Array.isArray(value)) {
    for (const v of value) allPositions(v, out);
  } else if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o['x'] === 'number' && typeof o['y'] === 'number') {
      out.push({ x: o['x'], y: o['y'] });
    }
    for (const v of Object.values(o)) allPositions(v, out);
  }
  return out;
}
