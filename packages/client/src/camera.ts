/**
 * Camera follow and clamping.
 *
 * Smoothing is exponential in real time (not per frame), so the camera lands in
 * the same place whether the tab is running at 30, 60 or 144 Hz — a per-frame
 * lerp would make the feel of the game depend on the monitor.
 */

import { Y_SQUASH, type Camera, type Viewport } from './render/projection.js';

export interface CameraState {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** Time constant of the follow. ~90 ms lags enough to read as weight, not drag. */
export const FOLLOW_TAU_MS = 90;

export function createCamera(x: number, y: number, zoom: number): CameraState {
  return { x, y, zoom };
}

/** World units per screen pixel, chosen so a big screen shows more, within reason. */
export function zoomFor(view: Viewport): number {
  const byWidth = view.width / 40;
  const byHeight = view.height / 24;
  const raw = Math.min(byWidth, byHeight);
  return Math.max(14, Math.min(48, Number.isFinite(raw) ? raw : 14));
}

export function followCamera(
  cam: CameraState,
  targetX: number,
  targetY: number,
  dtMs: number,
  tauMs = FOLLOW_TAU_MS,
): CameraState {
  if (!(dtMs > 0) || !Number.isFinite(dtMs)) return cam;
  const k = 1 - Math.exp(-dtMs / tauMs);
  return {
    x: cam.x + (targetX - cam.x) * k,
    y: cam.y + (targetY - cam.y) * k,
    zoom: cam.zoom,
  };
}

/** AC: the view never shows past the map edge; a map smaller than the view centres. */
export function clampCamera(cam: Camera, halfExtent: number, view: Viewport): CameraState {
  const halfW = view.width / 2 / cam.zoom;
  const halfH = view.height / 2 / (cam.zoom * Y_SQUASH);
  const limitX = halfExtent - halfW;
  const limitY = halfExtent - halfH;
  return {
    x: limitX <= 0 ? 0 : Math.max(-limitX, Math.min(limitX, cam.x)),
    y: limitY <= 0 ? 0 : Math.max(-limitY, Math.min(limitY, cam.y)),
    zoom: cam.zoom,
  };
}

export function updateCamera(
  cam: CameraState,
  targetX: number,
  targetY: number,
  dtMs: number,
  halfExtent: number,
  view: Viewport,
): CameraState {
  return clampCamera(followCamera(cam, targetX, targetY, dtMs), halfExtent, view);
}
