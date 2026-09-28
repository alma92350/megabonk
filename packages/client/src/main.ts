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

  // Co-play. The bridge is entirely optional: if nothing is listening on the
  // port, every poll fails quietly and the game is exactly the game it was.
  // `?bridge=<port>` overrides, `?bridge=off` disables it outright.
  const bridgeParam = new URLSearchParams(window.location.search).get('bridge');
  if (bridgeParam !== 'off') {
    const port = Number(bridgeParam ?? DEFAULT_BRIDGE_PORT) || DEFAULT_BRIDGE_PORT;
    const coplay = new CoPlay(bridgeApi(`http://127.0.0.1:${port}`), {
      getState: () => (client.screen === 'run' ? client.state : null),
      applyIntent: (intent) => {
        if (intent.control !== undefined) client.agentControl = intent.control;
        client.agentMove = intent.move ?? null;
        if (intent.reroll === true) client.onKey('KeyR', true);
        else if (intent.chooseIndex !== undefined) {
          client.onKey(`Digit${intent.chooseIndex + 1}`, true);
        }
      },
    });
    coplay.start();
    (window as unknown as Record<string, unknown>).__megabonkCoPlay = coplay;
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
