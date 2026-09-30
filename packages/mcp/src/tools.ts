/**
 * FR-24: the tool surface.
 *
 * Read and write tools are separate lists so an advisor-only agent can be run with
 * the write tools ABSENT from `tools/list` rather than merely refused at call time
 * (AC-24.4) — a tool the model cannot see is a tool it cannot try to use.
 *
 * Every handler is a plain function of (session, args), so the whole surface is
 * unit-testable without a transport.
 */

import { z } from 'zod';
import { SessionError } from './session.js';
import type { McpSession, SessionMode } from './session.js';
import type { MovementIntent } from './actuation.js';

export interface ToolResult {
  readonly content: readonly [{ readonly type: 'text'; readonly text: string }];
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly write: boolean;
  /** A zod raw shape — declared, so malformed arguments are rejected (AC-24.1). */
  readonly inputSchema: z.ZodRawShape;
  readonly handler: (session: McpSession, args: Record<string, unknown>) => unknown;
}

const INTENT_KINDS = ['vector', 'kite_nearest', 'collect_nearest_orb', 'approach_merchant', 'hold'] as const;

function ok(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
}

function fail(code: string, message: string, data?: Record<string, unknown>): ToolResult {
  const payload = { error: data === undefined ? { code, message } : { code, message, data } };
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true,
  };
}

function intentFrom(args: Record<string, unknown>): MovementIntent {
  const kind = args['kind'] as (typeof INTENT_KINDS)[number];
  if (kind !== 'vector') return { kind };
  const x = args['x'];
  const y = args['y'];
  if (typeof x !== 'number' || typeof y !== 'number') {
    throw new SessionError('invalid_arguments', 'kind "vector" requires numeric x and y.');
  }
  return { kind: 'vector', x, y };
}

const SPECS: ToolSpec[] = [
  // ---- Read tools ----------------------------------------------------------
  {
    name: 'get_state',
    description:
      'Compact observation of the run: player, nearby enemies (capped, nearest-first), pickups, projectiles, interactables, timer and any pending offer. Filtered by the agent perception handicap (FR-27).',
    write: false,
    inputSchema: {},
    handler: (s) => s.getState(),
  },
  {
    name: 'get_offer',
    description: 'The pending upgrade offer with full effect text, or null when none is open.',
    write: false,
    inputSchema: {},
    handler: (s) => s.getOffer(),
  },
  {
    name: 'get_build',
    description: 'Current weapons, rites, items and active buffs with levels and resolved stats.',
    write: false,
    inputSchema: {},
    handler: (s) => s.getBuild(),
  },
  {
    name: 'get_events',
    description: 'Structured event log since a supplied cursor, with the next cursor to pass.',
    write: false,
    inputSchema: { cursor: z.number().int().min(0).optional() },
    handler: (s, a) => s.getEvents((a['cursor'] as number | undefined) ?? 0),
  },
  {
    name: 'get_run_summary',
    description:
      'Summary of the run, including the handicap profile and its fully-resolved parameters (FR-29).',
    write: false,
    inputSchema: {},
    handler: (s) => s.getRunSummary(),
  },
  // ---- Write tools ---------------------------------------------------------
  {
    name: 'start_run',
    description: 'Begin a run with an optional seed and character.',
    write: true,
    inputSchema: { seed: z.number().int().optional(), characterId: z.string().optional() },
    handler: (s, a) =>
      s.startRun({
        ...(typeof a['seed'] === 'number' ? { seed: a['seed'] } : {}),
        ...(typeof a['characterId'] === 'string' ? { characterId: a['characterId'] } : {}),
      }),
  },
  {
    name: 'set_intent',
    description:
      'Set the movement intent, which persists until replaced. Vectors are snapped to the 8 compass directions and applied after the action delay (FR-28).',
    write: true,
    inputSchema: {
      kind: z.enum(INTENT_KINDS),
      x: z.number().optional(),
      y: z.number().optional(),
    },
    handler: (s, a) => s.setIntent(intentFrom(a)),
  },
  {
    name: 'choose_upgrade',
    description: 'Resolve the pending offer by index, subject to the decision floor (AC-28.4).',
    write: true,
    inputSchema: { index: z.number().int() },
    handler: (s, a) => s.chooseUpgrade(a['index'] as number),
  },
  {
    name: 'reroll_offer',
    description: 'Consume a reroll on the pending offer, if one is available.',
    write: true,
    inputSchema: {},
    handler: (s) => s.rerollOffer(),
  },
  {
    name: 'buy',
    description: 'Purchase a merchant stock entry by index.',
    write: true,
    inputSchema: { index: z.number().int() },
    handler: (s, a) => s.buy(a['index'] as number),
  },
  {
    name: 'step',
    description: 'Headless only. Advance N sim ticks. Rejected against a live game (FR-23).',
    write: true,
    inputSchema: { ticks: z.number().int().positive().max(200_000) },
    handler: (s, a) => s.stepTicks(a['ticks'] as number),
  },
  // ---- Advisor tool --------------------------------------------------------
  {
    name: 'advise',
    description:
      'Post a recommendation and rationale for the human. Never mutates simulation state; available in both modes.',
    write: false,
    inputSchema: { recommendation: z.string().min(1), rationale: z.string().optional() },
    handler: (s, a) =>
      s.advise(a['recommendation'] as string, a['rationale'] as string | undefined),
  },
];

export const TOOL_SPECS: readonly ToolSpec[] = Object.freeze(SPECS);

export const READ_TOOLS: readonly string[] = Object.freeze(
  TOOL_SPECS.filter((t) => !t.write && t.name !== 'advise')
    .map((t) => t.name)
    .sort(),
);

export const WRITE_TOOLS: readonly string[] = Object.freeze(
  TOOL_SPECS.filter((t) => t.write)
    .map((t) => t.name)
    .sort(),
);

/** AC-24.4: advisor mode never even lists the write tools. */
export function toolsFor(mode: SessionMode): readonly ToolSpec[] {
  return mode === 'advisor' ? TOOL_SPECS.filter((t) => !t.write) : TOOL_SPECS;
}

/**
 * Invoke a tool by name. Never throws: every failure — unknown tool, tool hidden by
 * the mode, schema violation, domain rejection — comes back as a structured error
 * result (AC-24.1).
 */
export function callTool(
  session: McpSession,
  mode: SessionMode,
  name: string,
  args: unknown,
): ToolResult {
  const spec = TOOL_SPECS.find((t) => t.name === name);
  if (!spec) return fail('unknown_tool', `No such tool: ${name}.`);
  if (spec.write && mode === 'advisor') {
    return fail(
      'tool_not_available',
      `Tool "${name}" is a write tool and is not available in advisor mode.`,
    );
  }
  const parsed = z.object(spec.inputSchema).safeParse(args ?? {});
  if (!parsed.success) {
    return fail('invalid_arguments', `Invalid arguments for ${name}.`, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  try {
    return ok(spec.handler(session, parsed.data as Record<string, unknown>));
  } catch (err) {
    if (err instanceof SessionError) {
      return fail(err.code, err.message, err.data as Record<string, unknown> | undefined);
    }
    return fail('internal_error', err instanceof Error ? err.message : String(err));
  }
}
