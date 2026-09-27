/**
 * FR-21 advisor overlay store.
 *
 * A module-level store, deliberately: the MCP server reaches it through
 * `window.__megabonk.setAdvice(...)` from outside the module graph, and it must
 * be reachable without the renderer handing out references.
 *
 * Two acceptance criteria shape the whole design:
 *  - AC-21.1 no advice means no overlay AND no behavioural difference. Nothing
 *    here is ever read by the input path or passed to `step`.
 *  - AC-21.2 advice can be `pending` forever. The upgrade screen does not await
 *    it, poll it, or gate on it; it just draws whatever happens to be here.
 *
 * Everything arriving through the bridge is untrusted input from another
 * process, so it is validated and truncated rather than believed.
 */

export type AdviceStatus = 'ready' | 'pending';

export interface Advice {
  /** Index of the recommended card, or null when there is no specific pick. */
  readonly pickIndex: number | null;
  readonly headline: string;
  readonly rationale: string;
  readonly status: AdviceStatus;
}

export interface AdviceInput {
  readonly pickIndex?: number | null;
  readonly headline?: string;
  readonly rationale?: string;
  readonly status?: AdviceStatus;
}

export const MAX_HEADLINE = 80;
export const MAX_RATIONALE = 160;
export const MAX_PICK_INDEX = 2;

const listeners = new Set<(advice: Advice | null) => void>();
let current: Advice | null = null;

function clean(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function normalisePick(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > MAX_PICK_INDEX) return null;
  return value;
}

export function getAdvice(): Advice | null {
  return current;
}

export function clearAdvice(): void {
  current = null;
  notify();
}

function notify(): void {
  for (const fn of listeners) {
    try {
      fn(current);
    } catch {
      // A broken subscriber must not take down the advisor channel.
    }
  }
}

export function setAdvice(input: AdviceInput | null | undefined): Advice | null {
  if (input === null || typeof input !== 'object') {
    current = null;
    notify();
    return null;
  }
  const status: AdviceStatus = input.status === 'pending' ? 'pending' : 'ready';
  const headline = clean(input.headline, MAX_HEADLINE);
  current = {
    pickIndex: status === 'pending' ? null : normalisePick(input.pickIndex),
    headline: headline.length > 0 ? headline : status === 'pending' ? 'Thinking…' : 'Advisor',
    rationale: clean(input.rationale, MAX_RATIONALE),
    status,
  };
  notify();
  return current;
}

export function subscribeAdvice(fn: (advice: Advice | null) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export interface AdviceBridge {
  readonly version: number;
  readonly setAdvice: (input: AdviceInput | null) => Advice | null;
  readonly clearAdvice: () => void;
  readonly getAdvice: () => Advice | null;
}

/**
 * Publish the bridge on a host object (in the browser, `window`). Idempotent so
 * a hot reload does not swap the object the MCP server already captured.
 */
export function installAdviceBridge(target: Record<string, unknown> | null | undefined): void {
  if (target === null || typeof target !== 'object') return;
  if (target.__megabonk !== undefined) return;
  const bridge: AdviceBridge = {
    version: 1,
    setAdvice: (input) => setAdvice(input),
    clearAdvice: () => clearAdvice(),
    getAdvice: () => getAdvice(),
  };
  try {
    target.__megabonk = bridge;
  } catch {
    // A locked-down host object is not a reason to fail startup.
  }
}
