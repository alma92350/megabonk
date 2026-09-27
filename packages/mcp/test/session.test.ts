import { describe, it, expect } from 'vitest';
import { makeRunConfig } from '@megabonk/content';
import { RunEngine, SessionError, createSession } from '../src/session.js';
import { resolveHandicap } from '../src/handicap.js';
import { baselinePolicy, driveRun } from '../src/policy.js';

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    if (err instanceof SessionError) return err.code;
    return `unexpected:${String(err)}`;
  }
  return 'no-error';
};

/** Advance until a predicate holds, so the tests do not hard-code spawn timings. */
function until(
  session: ReturnType<typeof createSession>,
  pred: () => boolean,
  maxFrames = 20000,
): number {
  let frames = 0;
  while (!pred() && frames < maxFrames) {
    session.stepTicks(1);
    frames++;
  }
  return frames;
}

describe('FR-25 session and latency model', () => {
  it('AC-25.2: an intent persists until replaced — a silent agent keeps moving', () => {
    const s = createSession({ seed: 5, mode: 'autonomous' });
    s.startRun();
    s.setIntent({ kind: 'vector', x: -1, y: 0 });
    s.stepTicks(300);
    const x300 = s.engine.state.player.pos.x;
    expect(x300).toBeLessThan(-5);
    s.stepTicks(120); // no further calls at all
    expect(s.engine.state.player.pos.x).toBeLessThan(x300);
  });

  it('AC-25.3: an unanswered offer auto-picks option 0 after the timeout and logs it', () => {
    const s = createSession({ seed: 5, mode: 'autonomous' });
    s.startRun();
    until(s, () => s.engine.state.phase === 'offer');
    expect(s.engine.state.phase).toBe('offer');
    const h = s.handicap;
    const options = s.engine.state.offer!.options.map((o) => o.id);
    s.stepTicks(h.offerTimeoutTicks + h.actionDelayTicks + 2);
    expect(s.engine.state.phase).not.toBe('offer');
    const log = s.getEvents(0).events;
    const timeout = log.find((e) => e.type === 'agent_offer_timeout');
    expect(timeout).toBeDefined();
    expect(timeout?.data?.['index']).toBe(0);
    const resolved = log.filter((e) => e.type === 'offer_resolved');
    expect(resolved.at(-1)?.data?.['id']).toBe(options[0]);
  });

  it('AC-25.3: advisor mode never auto-picks — the human decides', () => {
    const s = createSession({ seed: 5, mode: 'advisor' });
    s.startRun();
    until(s, () => s.engine.state.phase === 'offer');
    s.stepTicks(s.handicap.offerTimeoutTicks + 100);
    expect(s.engine.state.phase).toBe('offer');
  });

  it('AC-25.4: actions after run end are rejected with a clear error', () => {
    const s = createSession({ seed: 9, mode: 'autonomous', runOptions: { difficulty: 60 } });
    s.startRun();
    s.setIntent({ kind: 'hold' });
    until(s, () => s.engine.state.phase === 'ended', 8000);
    expect(s.engine.state.phase).toBe('ended');
    expect(codeOf(() => s.setIntent({ kind: 'vector', x: 1, y: 0 }))).toBe('run_ended');
    expect(codeOf(() => s.chooseUpgrade(0))).toBe('run_ended');
    expect(codeOf(() => s.buy(0))).toBe('run_ended');
    expect(codeOf(() => s.stepTicks(1))).toBe('run_ended');
  });

  it('AC-25.1: a slow agent costs the sim nothing — no wall-clock waiting anywhere', () => {
    const s = createSession({ seed: 5, mode: 'autonomous' });
    s.startRun();
    const t0 = Date.now();
    s.stepTicks(600); // 10 game-seconds with no agent calls at all
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(s.engine.state.tick).toBe(600);
    // Handicap latencies are tick counts, never timers.
    expect(Number.isInteger(s.handicap.observationDelayTicks)).toBe(true);
    expect(Number.isInteger(s.handicap.actionDelayTicks)).toBe(true);
  });

  it('FR-24: reads before a run starts error instead of throwing raw', () => {
    const s = createSession({ seed: 1, mode: 'autonomous' });
    expect(codeOf(() => s.getState())).toBe('no_run');
    expect(codeOf(() => s.stepTicks(1))).toBe('no_run');
  });
});

describe('FR-24/FR-28 write-tool guards', () => {
  it('AC-24.2: choose_upgrade with no offer pending errors and mutates nothing', () => {
    const s = createSession({ seed: 5, mode: 'autonomous' });
    s.startRun();
    s.stepTicks(30);
    const before = JSON.stringify(s.engine.state);
    expect(codeOf(() => s.chooseUpgrade(0))).toBe('no_offer');
    expect(JSON.stringify(s.engine.state)).toBe(before);
  });

  it('AC-24.3: an out-of-range index errors and mutates nothing', () => {
    const s = createSession({ seed: 5, mode: 'autonomous' });
    s.startRun();
    until(s, () => s.engine.state.phase === 'offer');
    s.stepTicks(40); // past the decision floor
    const before = JSON.stringify(s.engine.state);
    expect(codeOf(() => s.chooseUpgrade(9))).toBe('index_out_of_range');
    expect(codeOf(() => s.chooseUpgrade(-1))).toBe('index_out_of_range');
    expect(JSON.stringify(s.engine.state)).toBe(before);
    expect(s.engine.state.phase).toBe('offer');
  });

  it('AC-28.4: choose_upgrade at 20 offer-ticks is too early; at 30 it is accepted', () => {
    const s = createSession({ seed: 5, mode: 'autonomous' });
    s.startRun();
    until(s, () => s.engine.state.phase === 'offer');
    s.stepTicks(20);
    expect(s.offerTicks).toBe(20);
    expect(codeOf(() => s.chooseUpgrade(0))).toBe('too_early');
    expect(s.engine.state.phase).toBe('offer'); // still pending
    s.stepTicks(10);
    expect(s.offerTicks).toBe(30);
    const res = s.chooseUpgrade(0);
    expect(res.accepted).toBe(true);
    s.stepTicks(s.handicap.actionDelayTicks + 1);
    expect(s.engine.state.phase).not.toBe('offer');
  });

  it('FR-28: set_intent rate limiting surfaces as a structured session error', () => {
    const s = createSession({ seed: 5, mode: 'autonomous' });
    s.startRun();
    for (let i = 0; i < 8; i++) s.setIntent({ kind: 'vector', x: 1, y: i });
    expect(codeOf(() => s.setIntent({ kind: 'vector', x: -1, y: 0 }))).toBe('rate_limited');
  });

  it('FR-23: step is rejected against a live game, accepted headless', () => {
    const engine = new RunEngine(makeRunConfig(5));
    const live = createSession({ mode: 'autonomous', engine });
    expect(codeOf(() => live.stepTicks(1))).toBe('headless_only');
    engine.tickOnce(live.nextInput());
    expect(engine.state.tick).toBe(1);
  });
});

describe('FR-23 attachment model', () => {
  it('AC-23.1: the same tool-call sequence headless and attached reaches the same terminal state', () => {
    const seed = 31337;
    const handicap = resolveHandicap();

    const headless = createSession({ seed, mode: 'autonomous', handicap });
    headless.startRun();
    driveRun(headless, baselinePolicy, { maxFrames: 4000 });

    const engine = new RunEngine(makeRunConfig(seed));
    const live = createSession({ mode: 'autonomous', handicap, engine });
    driveRun(live, baselinePolicy, {
      maxFrames: 4000,
      advance: () => engine.tickOnce(live.nextInput()),
    });

    expect(engine.state.tick).toBe(headless.engine.state.tick);
    expect(JSON.stringify(engine.state)).toBe(JSON.stringify(headless.engine.state));
    expect(live.getRunSummary()).toEqual(headless.getRunSummary());
  });
});

describe('FR-29 disclosure', () => {
  it('AC-29.1: the summary carries agentProfile and the resolved handicap parameters', () => {
    const s = createSession({ seed: 5, mode: 'autonomous' });
    s.startRun();
    s.stepTicks(60);
    const summary = s.getRunSummary();
    expect(summary.agentProfile).toBe('human-parity');
    expect(summary.handicap.observationDelayTicks).toBe(12);
    expect(summary.handicap.declaredMs.observationDelayMs).toBe(200);
  });

  it('AC-29.1: a human-driven run records agentProfile null', () => {
    const s = createSession({ seed: 5, mode: 'advisor' });
    s.startRun();
    s.stepTicks(60);
    expect(s.getRunSummary().agentProfile).toBeNull();
  });

  it('AC-29.3: unrestricted emits run_start with handicap unrestricted and warns on stderr', () => {
    const warnings: string[] = [];
    const s = createSession({
      seed: 5,
      mode: 'autonomous',
      handicap: resolveHandicap({ profile: 'unrestricted' }),
      warn: (m) => warnings.push(m),
    });
    s.startRun();
    const runStart = s.getEvents(0).events.find((e) => e.type === 'run_start');
    expect(runStart?.data?.['handicap']).toBe('unrestricted');
    expect(warnings.join(' ')).toMatch(/unrestricted/i);
    expect(s.getRunSummary().agentProfile).toBe('unrestricted');
  });
});
