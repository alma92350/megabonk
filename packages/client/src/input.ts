/**
 * Keyboard input. NFR-3 requires full keyboard play with no mouse-only action,
 * so this module is the ONLY input source in the client.
 *
 * Movement is level-triggered (held keys sampled every frame). Actions are
 * edge-triggered and queued, because a number key pressed between two frames
 * must not be lost, and a key held down must not fire every frame.
 */

import type { Vec2 } from '@megabonk/sim';

export type Action =
  | { readonly type: 'choose'; readonly index: number }
  | { readonly type: 'reroll' }
  | { readonly type: 'pause' }
  | { readonly type: 'confirm' }
  | { readonly type: 'toggleHelp' }
  | { readonly type: 'menu'; readonly dir: -1 | 1 };

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);

/** Keys the client swallows so the page never scrolls under the canvas. */
export const CAPTURED_CODES: readonly string[] = Object.freeze([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3',
  'KeyR', 'KeyH', 'Escape', 'Enter', 'Space',
]);

/** Actions queued between two frames. Bounded so a key-mash cannot grow it. */
export const MAX_QUEUED_ACTIONS = 16;

/** AC-7.1: diagonals are normalised, so up+right is not √2 times faster. */
export function moveVectorFrom(held: ReadonlySet<string>): Vec2 {
  let x = 0;
  let y = 0;
  for (const code of RIGHT) if (held.has(code)) { x = 1; break; }
  for (const code of LEFT) if (held.has(code)) { x -= 1; break; }
  for (const code of DOWN) if (held.has(code)) { y = 1; break; }
  for (const code of UP) if (held.has(code)) { y -= 1; break; }
  if (x === 0 && y === 0) return { x: 0, y: 0 };
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len };
}

/**
 * Codes that mean both "move" and "navigate a menu". The screen decides which
 * reading applies; returning the menu action here keeps that decision in one
 * place instead of scattering key codes through the UI code.
 */
export function actionForCode(code: string): Action | null {
  switch (code) {
    case 'Digit1': case 'Numpad1': return { type: 'choose', index: 0 };
    case 'Digit2': case 'Numpad2': return { type: 'choose', index: 1 };
    case 'Digit3': case 'Numpad3': return { type: 'choose', index: 2 };
    case 'KeyR': return { type: 'reroll' };
    case 'Escape': return { type: 'pause' };
    case 'Enter': case 'NumpadEnter': case 'Space': return { type: 'confirm' };
    case 'KeyH': return { type: 'toggleHelp' };
    case 'KeyW': case 'ArrowUp': return { type: 'menu', dir: -1 };
    case 'KeyS': case 'ArrowDown': return { type: 'menu', dir: 1 };
    default: return null;
  }
}

export class KeyTracker {
  private readonly held = new Set<string>();
  private readonly queue: Action[] = [];

  down(code: string): void {
    if (this.held.has(code)) return; // OS auto-repeat: level state only, no new action
    this.held.add(code);
    const action = actionForCode(code);
    if (action !== null && this.queue.length < MAX_QUEUED_ACTIONS) this.queue.push(action);
  }

  up(code: string): void {
    this.held.delete(code);
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  move(): Vec2 {
    return moveVectorFrom(this.held);
  }

  drainActions(): Action[] {
    if (this.queue.length === 0) return [];
    return this.queue.splice(0, this.queue.length);
  }

  /** Window blur: a key released while unfocused never sends a keyup. */
  clear(): void {
    this.held.clear();
    this.queue.length = 0;
  }
}
