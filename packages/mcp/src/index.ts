/**
 * `@megabonk/mcp` — the agent boundary.
 *
 * The handicap of §6.8 lives entirely in this package: a perception filter on the
 * way out (FR-27) and a delayed, rate-limited action channel on the way in (FR-28).
 * `packages/sim` has no concept of an agent, which is what lets one simulation
 * serve a human, a handicapped agent and an unhandicapped debug agent identically.
 */

export * from './handicap.js';
export * from './observation.js';
export * from './actuation.js';
export * from './session.js';
export * from './policy.js';
export * from './tools.js';
export { buildServer, parseServerArgs, main } from './server.js';
export * from './live.js';
export * from './tactical.js';
export * from './autoplay.js';
