import { describe, expect, it } from 'vitest';
import { KeyTracker, actionForCode, moveVectorFrom } from '../src/input.js';

describe('input -> InputFrame.move', () => {
  it('is zero with nothing held', () => {
    expect(moveVectorFrom(new Set())).toEqual({ x: 0, y: 0 });
  });

  it('maps WASD', () => {
    expect(moveVectorFrom(new Set(['KeyD']))).toEqual({ x: 1, y: 0 });
    expect(moveVectorFrom(new Set(['KeyA']))).toEqual({ x: -1, y: 0 });
    expect(moveVectorFrom(new Set(['KeyW']))).toEqual({ x: 0, y: -1 });
    expect(moveVectorFrom(new Set(['KeyS']))).toEqual({ x: 0, y: 1 });
  });

  it('maps arrow keys identically', () => {
    expect(moveVectorFrom(new Set(['ArrowRight']))).toEqual(moveVectorFrom(new Set(['KeyD'])));
    expect(moveVectorFrom(new Set(['ArrowUp']))).toEqual(moveVectorFrom(new Set(['KeyW'])));
  });

  it('normalises diagonals so they are not faster (AC-7.1)', () => {
    const v = moveVectorFrom(new Set(['KeyW', 'KeyD']));
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 12);
    expect(v.x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(v.y).toBeCloseTo(-Math.SQRT1_2, 12);
  });

  it('cancels opposing keys', () => {
    expect(moveVectorFrom(new Set(['KeyA', 'KeyD']))).toEqual({ x: 0, y: 0 });
    expect(moveVectorFrom(new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD']))).toEqual({ x: 0, y: 0 });
  });

  it('mixes WASD with arrows without double counting', () => {
    const v = moveVectorFrom(new Set(['KeyD', 'ArrowRight']));
    expect(v).toEqual({ x: 1, y: 0 });
  });

  it('maps action keys', () => {
    expect(actionForCode('Digit1')).toEqual({ type: 'choose', index: 0 });
    expect(actionForCode('Digit2')).toEqual({ type: 'choose', index: 1 });
    expect(actionForCode('Digit3')).toEqual({ type: 'choose', index: 2 });
    expect(actionForCode('Numpad1')).toEqual({ type: 'choose', index: 0 });
    expect(actionForCode('KeyR')).toEqual({ type: 'reroll' });
    expect(actionForCode('Escape')).toEqual({ type: 'pause' });
    expect(actionForCode('Enter')).toEqual({ type: 'confirm' });
    expect(actionForCode('Space')).toEqual({ type: 'confirm' });
    expect(actionForCode('KeyH')).toEqual({ type: 'toggleHelp' });
    expect(actionForCode('KeyZ')).toBeNull();
  });

  it('never maps a movement key to an action', () => {
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      const a = actionForCode(code);
      expect(a === null || a.type === 'menu').toBe(true);
    }
  });

  it('exposes menu navigation for keyboard-only UI (NFR-3)', () => {
    expect(actionForCode('ArrowUp')).toEqual({ type: 'menu', dir: -1 });
    expect(actionForCode('ArrowDown')).toEqual({ type: 'menu', dir: 1 });
    expect(actionForCode('KeyW')).toEqual({ type: 'menu', dir: -1 });
    expect(actionForCode('KeyS')).toEqual({ type: 'menu', dir: 1 });
  });
});

describe('KeyTracker', () => {
  it('tracks held keys and produces a move vector', () => {
    const t = new KeyTracker();
    t.down('KeyD');
    expect(t.move()).toEqual({ x: 1, y: 0 });
    t.up('KeyD');
    expect(t.move()).toEqual({ x: 0, y: 0 });
  });

  it('queues one-shot actions on press only and drains them once', () => {
    const t = new KeyTracker();
    t.down('Digit2');
    t.down('Digit2'); // auto-repeat must not queue twice
    expect(t.drainActions()).toEqual([{ type: 'choose', index: 1 }]);
    expect(t.drainActions()).toEqual([]);
    t.up('Digit2');
    t.down('Digit2');
    expect(t.drainActions()).toEqual([{ type: 'choose', index: 1 }]);
  });

  it('clears everything on blur so a held key does not stick', () => {
    const t = new KeyTracker();
    t.down('KeyW');
    t.down('Digit1');
    t.clear();
    expect(t.move()).toEqual({ x: 0, y: 0 });
    expect(t.drainActions()).toEqual([]);
  });

  it('caps the action queue so a key-mashing burst cannot grow unbounded', () => {
    const t = new KeyTracker();
    for (let i = 0; i < 500; i++) {
      t.down('Digit1');
      t.up('Digit1');
    }
    expect(t.drainActions().length).toBeLessThanOrEqual(16);
  });
});
