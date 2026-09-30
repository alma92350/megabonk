/**
 * Typed helpers for talking to the bridge.
 *
 * Shared by the browser page and the MCP server so the wire shape is defined in
 * exactly one place. Uses global fetch, which both Node 20+ and the browser have.
 */

export const DEFAULT_BRIDGE_PORT = 7391;

export interface AdvicePayload {
  readonly pickIndex?: number;
  /** Short imperative the player can act on at a glance. */
  readonly headline?: string;
  readonly rationale?: string;
  readonly move?: { readonly x: number; readonly y: number };
  readonly status?: 'pending' | 'ready';
}

export interface IntentPayload {
  readonly move?: { readonly x: number; readonly y: number };
  readonly chooseIndex?: number;
  readonly reroll?: boolean;
  /** When true the client hands movement control to the agent. */
  readonly control?: boolean;
}

export interface BridgeDoc<T> {
  readonly value: T | null;
  readonly version: number;
}

export function bridgeUrl(port: number = DEFAULT_BRIDGE_PORT): string {
  return `http://127.0.0.1:${port}`;
}

async function getDoc<T>(url: string, key: string): Promise<BridgeDoc<T>> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`bridge GET ${url} -> ${res.status}`);
  const body = (await res.json()) as Record<string, unknown>;
  return { value: (body[key] ?? null) as T | null, version: Number(body.version ?? 0) };
}

async function postDoc(url: string, key: string, value: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ [key]: value }),
  });
  if (!res.ok) throw new Error(`bridge POST ${url} -> ${res.status}`);
}

export interface BridgeApi {
  readonly base: string;
  health(): Promise<{
    ok: boolean;
    clientConnected: boolean;
    stateVersion: number;
    pageVisible?: boolean | null;
  }>;
  publishState(snapshot: unknown): Promise<void>;
  readState<T = unknown>(): Promise<BridgeDoc<T>>;
  publishAdvice(advice: AdvicePayload | null): Promise<void>;
  readAdvice(): Promise<BridgeDoc<AdvicePayload>>;
  publishIntent(intent: IntentPayload | null): Promise<void>;
  readIntent(): Promise<BridgeDoc<IntentPayload>>;
  /** document.visibilityState === 'visible', so an attached agent can tell a
   * frozen `/state` (tab backgrounded, rAF throttled) from a genuinely stuck
   * page. */
  publishVisibility(visible: boolean): Promise<void>;
  readVisibility(): Promise<BridgeDoc<boolean>>;
}

export function bridgeApi(base: string = bridgeUrl()): BridgeApi {
  return {
    base,
    async health() {
      const res = await fetch(`${base}/health`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`bridge health -> ${res.status}`);
      return (await res.json()) as {
        ok: boolean;
        clientConnected: boolean;
        stateVersion: number;
        pageVisible?: boolean | null;
      };
    },
    publishState: (snapshot) => postDoc(`${base}/state`, 'snapshot', snapshot),
    readState: <T,>() => getDoc<T>(`${base}/state`, 'snapshot'),
    publishAdvice: (advice) => postDoc(`${base}/advice`, 'advice', advice),
    readAdvice: () => getDoc<AdvicePayload>(`${base}/advice`, 'advice'),
    publishIntent: (intent) => postDoc(`${base}/intent`, 'intent', intent),
    readIntent: () => getDoc<IntentPayload>(`${base}/intent`, 'intent'),
    publishVisibility: (visible) => postDoc(`${base}/visibility`, 'visible', visible),
    readVisibility: () => getDoc<boolean>(`${base}/visibility`, 'visible'),
  };
}
