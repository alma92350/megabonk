import { describe, expect, it } from 'vitest';
import {
  Y_SQUASH,
  Z_LIFT,
  projectX,
  projectY,
  screenToWorld,
  visibleWorldBounds,
  worldToScreen,
} from '../src/render/projection.js';

const cam = { x: 0, y: 0, zoom: 24 };
const view = { width: 800, height: 600 };

describe('world -> screen projection', () => {
  it('puts the camera target at the viewport centre', () => {
    const p = worldToScreen(0, 0, 0, cam, view);
    expect(p.x).toBeCloseTo(400, 9);
    expect(p.y).toBeCloseTo(300, 9);
  });

  it('squashes the y axis to sell the 2.5D tilt', () => {
    const a = worldToScreen(10, 0, 0, cam, view);
    const b = worldToScreen(0, 10, 0, cam, view);
    const dx = a.x - 400;
    const dy = b.y - 300;
    expect(dx).toBeCloseTo(240, 9);
    expect(dy).toBeCloseTo(240 * Y_SQUASH, 9);
    expect(dy).toBeLessThan(dx);
  });

  it('lifts height upward on screen', () => {
    const ground = worldToScreen(3, 3, 0, cam, view);
    const raised = worldToScreen(3, 3, 2, cam, view);
    expect(raised.y).toBeLessThan(ground.y);
    expect(ground.y - raised.y).toBeCloseTo(2 * cam.zoom * Z_LIFT, 9);
  });

  it('scalar projectX/projectY agree with worldToScreen', () => {
    const c = { x: 4.5, y: -2.25, zoom: 31 };
    const p = worldToScreen(7, 9, 1.5, c, view);
    expect(projectX(7, c, view)).toBeCloseTo(p.x, 9);
    expect(projectY(9, 1.5, c, view)).toBeCloseTo(p.y, 9);
  });

  it('round-trips screen -> world -> screen at ground level', () => {
    const c = { x: -12.5, y: 7.75, zoom: 18.5 };
    for (const [wx, wy] of [[0, 0], [11.25, -30.5], [-59, 59], [1.0001, 2.0002]] as const) {
      const s = worldToScreen(wx, wy, 0, c, view);
      const w = screenToWorld(s.x, s.y, c, view);
      expect(w.x).toBeCloseTo(wx, 9);
      expect(w.y).toBeCloseTo(wy, 9);
    }
  });

  it('round-trips world -> screen -> world for arbitrary screen points', () => {
    const c = { x: 3, y: 3, zoom: 22 };
    for (const [sx, sy] of [[0, 0], [400, 300], [799, 599]] as const) {
      const w = screenToWorld(sx, sy, c, view);
      const s = worldToScreen(w.x, w.y, 0, c, view);
      expect(s.x).toBeCloseTo(sx, 9);
      expect(s.y).toBeCloseTo(sy, 9);
    }
  });

  it('computes visible world bounds that contain the viewport corners', () => {
    const c = { x: 5, y: -5, zoom: 20 };
    const b = visibleWorldBounds(c, view, 0);
    const tl = screenToWorld(0, 0, c, view);
    const br = screenToWorld(view.width, view.height, c, view);
    expect(b.minX).toBeCloseTo(tl.x, 6);
    expect(b.maxX).toBeCloseTo(br.x, 6);
    expect(b.minY).toBeCloseTo(tl.y, 6);
    expect(b.maxY).toBeCloseTo(br.y, 6);
    expect(b.minX).toBeLessThan(b.maxX);
    expect(b.minY).toBeLessThan(b.maxY);
  });

  it('grows the bounds by the requested margin', () => {
    const tight = visibleWorldBounds(cam, view, 0);
    const loose = visibleWorldBounds(cam, view, 4);
    expect(loose.minX).toBeCloseTo(tight.minX - 4, 9);
    expect(loose.maxY).toBeCloseTo(tight.maxY + 4, 9);
  });
});
