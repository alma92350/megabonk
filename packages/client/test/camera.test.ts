import { describe, expect, it } from 'vitest';
import { clampCamera, createCamera, followCamera, updateCamera, zoomFor } from '../src/camera.js';
import { visibleWorldBounds } from '../src/render/projection.js';

const view = { width: 800, height: 600 };

describe('camera', () => {
  it('starts on its target', () => {
    const cam = createCamera(3, -4, 24);
    expect(cam).toEqual({ x: 3, y: -4, zoom: 24 });
  });

  it('eases toward the target without overshooting', () => {
    let cam = createCamera(0, 0, 24);
    const before = cam.x;
    cam = followCamera(cam, 10, 0, 16.667);
    expect(cam.x).toBeGreaterThan(before);
    expect(cam.x).toBeLessThan(10);
  });

  it('converges on the target after a second of following', () => {
    let cam = createCamera(0, 0, 24);
    for (let i = 0; i < 60; i++) cam = followCamera(cam, 10, -6, 16.667);
    expect(cam.x).toBeCloseTo(10, 2);
    expect(cam.y).toBeCloseTo(-6, 2);
  });

  it('is time-step independent to within a small tolerance', () => {
    let a = createCamera(0, 0, 24);
    for (let i = 0; i < 20; i++) a = followCamera(a, 10, 0, 16.667);
    let b = createCamera(0, 0, 24);
    for (let i = 0; i < 10; i++) b = followCamera(b, 10, 0, 33.334);
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.2);
  });

  it('snaps instantly when dt is zero or negative', () => {
    const cam = followCamera(createCamera(0, 0, 24), 5, 5, 0);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
  });

  it('clamps so the view never shows outside the map', () => {
    const halfExtent = 60;
    const cam = clampCamera({ x: 1000, y: -1000, zoom: 24 }, halfExtent, view);
    const bounds = visibleWorldBounds(cam, view, 0);
    expect(bounds.maxX).toBeLessThanOrEqual(halfExtent + 1e-6);
    expect(bounds.minY).toBeGreaterThanOrEqual(-halfExtent - 1e-6);
  });

  it('clamps both axes independently', () => {
    const cam = clampCamera({ x: -1000, y: 1000, zoom: 24 }, 60, view);
    const b = visibleWorldBounds(cam, view, 0);
    expect(b.minX).toBeGreaterThanOrEqual(-60 - 1e-6);
    expect(b.maxY).toBeLessThanOrEqual(60 + 1e-6);
  });

  it('centres the axis when the map is narrower than the view', () => {
    const cam = clampCamera({ x: 30, y: 30, zoom: 200 }, 2, view);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
  });

  it('updateCamera follows then clamps', () => {
    let cam = createCamera(0, 0, 24);
    for (let i = 0; i < 300; i++) cam = updateCamera(cam, 500, 500, 16.667, 60, view);
    const b = visibleWorldBounds(cam, view, 0);
    expect(b.maxX).toBeLessThanOrEqual(60 + 1e-6);
    expect(b.maxY).toBeLessThanOrEqual(60 + 1e-6);
  });

  it('picks a zoom that scales with the viewport and stays in range', () => {
    expect(zoomFor({ width: 1920, height: 1080 })).toBeGreaterThan(zoomFor({ width: 640, height: 480 }));
    for (const v of [{ width: 320, height: 200 }, { width: 4000, height: 3000 }]) {
      const z = zoomFor(v);
      expect(z).toBeGreaterThanOrEqual(14);
      expect(z).toBeLessThanOrEqual(48);
    }
  });
});
