/**
 * The shell. Canvas, requestAnimationFrame, DOM event listeners — and nothing
 * else. Every decision worth testing lives in GameClient and the render modules,
 * which is why this file has no branches beyond feature detection.
 */

import { assertValidContent, content } from '@megabonk/content';
import { GameClient } from './app.js';
import { installAdviceBridge } from './advice.js';
import { bridgeApi, DEFAULT_BRIDGE_PORT } from '@megabonk/bridge';
import { CoPlay } from './coplay.js';
import { CAPTURED_CODES } from './input.js';
import { drawFrame } from './render/renderer.js';
import type { Ctx2D } from './render/ctx.js';

function fail(message: string): void {
  const el = document.getElementById('boot');
  if (el !== null) {
    el.textContent = message;
    el.style.display = 'block';
  }
  // eslint-disable-next-line no-console
  console.error(message);
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function start(): void {
  // Fail loudly at startup rather than mid-run on a missing id.
  assertValidContent(content);

  const found = document.getElementById('stage') as HTMLCanvasElement | null;
  if (found === null) {
    fail('Canvas element #stage is missing.');
    return;
  }
  const canvas: HTMLCanvasElement = found;
  const raw = canvas.getContext('2d', { alpha: false });
  if (raw === null) {
    fail('This browser did not provide a 2D canvas context.');
    return;
  }
  const ctx = raw as unknown as Ctx2D;

  const client = new GameClient({ reduceMotion: prefersReducedMotion() });
  installAdviceBridge(window as unknown as Record<string, unknown>);

  // Co-play is opt-in: polling a port with nothing listening floods the browser
  // console with connection errors, so the page only talks to the bridge when
  // asked. `?bridge` uses the default port, `?bridge=<port>` picks one.
  const bridgeParam = new URLSearchParams(window.location.search).get('bridge');
  if (bridgeParam !== null && bridgeParam !== 'off') {
    const asPort = Number(bridgeParam);
    const port = asPort >= 1024 && asPort <= 65535 ? asPort : DEFAULT_BRIDGE_PORT;
    const api = bridgeApi(`http://127.0.0.1:${port}`);
    const coplay = new CoPlay(api, {
      getState: () => (client.screen === 'run' ? client.state : null),
      applyIntent: (intent) => client.applyCoPlayIntent(intent),
    });
    coplay.start();
    (window as unknown as Record<string, unknown>).__megabonkCoPlay = coplay;

    // The sim clock only advances via this file's rAF loop, which browsers
    // throttle hard once the tab is backgrounded. Report visibility so an
    // attached agent can tell "tabbed away, nothing to do" apart from "stuck."
    const reportVisibility = (): void => {
      void api.publishVisibility(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', reportVisibility);
    reportVisibility();
  }
  // Exposed for diagnostics and end-to-end tests: read-only access to the live
  // client. Not a control surface — agents go through the bridge.
  (window as unknown as Record<string, unknown>).__megabonkClient = client;
  {
  }

  // Render at device resolution, lay out in CSS pixels.
  let dpr = 1;
  function resize(): void {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = Math.max(320, window.innerWidth);
    const cssH = Math.max(240, window.innerHeight);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    client.setViewport(cssW, cssH);
  }
  resize();
  window.addEventListener('resize', resize);

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (CAPTURED_CODES.includes(event.code)) event.preventDefault();
    client.onKey(event.code, true);
  });
  window.addEventListener('keyup', (event) => {
    client.onKey(event.code, false);
  });
  window.addEventListener('blur', () => client.blur());

  const boot = document.getElementById('boot');
  if (boot !== null) boot.style.display = 'none';

  let last = performance.now();
  function frame(now: number): void {
    const dt = now - last;
    last = now;
    try {
      client.advance(dt);
      ctx.save();
      ctx.scale(dpr, dpr);
      drawFrame(ctx, client, now);
      ctx.restore();
    } catch (err) {
      // NFR-4: a renderer exception must not corrupt the run or the profile.
      // eslint-disable-next-line no-console
      console.error('frame failed', err);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

try {
  start();
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
