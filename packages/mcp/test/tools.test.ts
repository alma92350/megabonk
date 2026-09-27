import { describe, it, expect } from 'vitest';
import { createSession } from '../src/session.js';
import { READ_TOOLS, WRITE_TOOLS, callTool, toolsFor } from '../src/tools.js';
import { readFileSync } from 'node:fs';

const names = (mode: 'advisor' | 'autonomous'): string[] =>
  toolsFor(mode).map((t) => t.name).sort();

describe('FR-24 tool surface', () => {
  it('AC-24.4: in advisor mode every write tool is absent from the listing', () => {
    const advisor = names('advisor');
    for (const w of WRITE_TOOLS) expect(advisor).not.toContain(w);
    for (const r of READ_TOOLS) expect(advisor).toContain(r);
    expect(advisor).toContain('advise');
    const auto = names('autonomous');
    for (const w of WRITE_TOOLS) expect(auto).toContain(w);
    expect(WRITE_TOOLS).toEqual([
      'buy',
      'choose_upgrade',
      'reroll_offer',
      'set_intent',
      'start_run',
      'step',
    ]);
    expect(READ_TOOLS).toEqual([
      'get_build',
      'get_events',
      'get_offer',
      'get_run_summary',
      'get_state',
    ]);
  });

  it('AC-24.1: every tool declares a schema and a description', () => {
    for (const t of toolsFor('autonomous')) {
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema).toBeDefined();
    }
  });

  it('AC-24.1: malformed arguments return a structured error, never an exception', () => {
    const s = createSession({ seed: 5, mode: 'autonomous' });
    callTool(s, 'autonomous', 'start_run', {});
    const bad = callTool(s, 'autonomous', 'set_intent', { kind: 'vector', x: 'north' });
    expect(bad.isError).toBe(true);
    expect(bad.structuredContent).toMatchObject({ error: { code: 'invalid_arguments' } });
    expect(() => callTool(s, 'autonomous', 'set_intent', null)).not.toThrow();
    expect(callTool(s, 'autonomous', 'set_intent', { kind: 'teleport' }).isError).toBe(true);
    expect(callTool(s, 'autonomous', 'step', { ticks: -5 }).isError).toBe(true);
    expect(callTool(s, 'autonomous', 'step', { ticks: 1.5 }).isError).toBe(true);
  });

  it('AC-24.1: an unknown tool is a structured error', () => {
    const s = createSession({ seed: 5, mode: 'autonomous' });
    const r = callTool(s, 'autonomous', 'delete_enemies', {});
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toMatchObject({ error: { code: 'unknown_tool' } });
  });

  it('AC-24.4: calling a write tool in advisor mode is refused as unavailable', () => {
    const s = createSession({ seed: 5, mode: 'advisor' });
    const r = callTool(s, 'advisor', 'set_intent', { kind: 'hold' });
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toMatchObject({ error: { code: 'tool_not_available' } });
  });

  it('AC-24.2/24.3: domain errors come back structured with the sim untouched', () => {
    const s = createSession({ seed: 5, mode: 'autonomous' });
    callTool(s, 'autonomous', 'start_run', { seed: 5 });
    callTool(s, 'autonomous', 'step', { ticks: 40 });
    const before = JSON.stringify(s.engine.state);
    const noOffer = callTool(s, 'autonomous', 'choose_upgrade', { index: 0 });
    expect(noOffer.isError).toBe(true);
    expect(noOffer.structuredContent).toMatchObject({ error: { code: 'no_offer' } });
    expect(JSON.stringify(s.engine.state)).toBe(before);
  });

  it('FR-24: the read tools return their documented payloads', () => {
    const s = createSession({ seed: 5, mode: 'autonomous' });
    callTool(s, 'autonomous', 'start_run', { seed: 5 });
    callTool(s, 'autonomous', 'step', { ticks: 300 });

    const state = callTool(s, 'autonomous', 'get_state', {});
    expect(state.isError).toBeUndefined();
    const obs = state.structuredContent as Record<string, unknown>;
    expect(obs['player']).toBeDefined();
    expect(obs['enemies']).toBeDefined();
    expect(JSON.parse(state.content[0].text)).toEqual(obs);

    const build = callTool(s, 'autonomous', 'get_build', {}).structuredContent as Record<string, unknown>;
    expect(Array.isArray(build['weapons'])).toBe(true);
    expect(build['stats']).toBeDefined();

    const first = callTool(s, 'autonomous', 'get_events', { cursor: 0 }).structuredContent as {
      events: unknown[];
      cursor: number;
    };
    expect(first.events.length).toBeGreaterThan(0);
    const second = callTool(s, 'autonomous', 'get_events', { cursor: first.cursor })
      .structuredContent as { events: unknown[] };
    expect(second.events).toEqual([]);

    expect(callTool(s, 'autonomous', 'get_offer', {}).structuredContent).toEqual({ offer: null });
    const summary = callTool(s, 'autonomous', 'get_run_summary', {}).structuredContent as Record<string, unknown>;
    expect(summary['agentProfile']).toBe('human-parity');
  });

  it('FR-24: advise never mutates the sim and is available in both modes', () => {
    const s = createSession({ seed: 5, mode: 'advisor' });
    callTool(s, 'advisor', 'start_run', {}); // write tool: unavailable
    s.startRun();
    s.stepTicks(20);
    const before = JSON.stringify(s.engine.state);
    const r = callTool(s, 'advisor', 'advise', { recommendation: 'kite east', rationale: 'brutes' });
    expect(r.isError).toBeUndefined();
    expect(JSON.stringify(s.engine.state)).toBe(before);
    expect(s.adviceLog).toHaveLength(1);
    expect(s.adviceLog[0]?.recommendation).toBe('kite east');
  });
});

describe('FR-22 transport', () => {
  it('AC-22.3: the server opens no network listener — stdio only', () => {
    const sources = ['server.ts', 'session.ts', 'tools.ts', 'observation.ts', 'actuation.ts', 'handicap.ts']
      .map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'))
      .join('\n');
    expect(sources).not.toMatch(/from 'node:(net|http|https|dgram|tls)'/);
    expect(sources).not.toMatch(/createServer|\.listen\(/);
    expect(sources).not.toMatch(/StreamableHTTPServerTransport|SSEServerTransport/);
    expect(sources).toMatch(/StdioServerTransport/);
  });
});
