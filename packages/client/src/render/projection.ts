/**
 * The 2.5D projection.
 *
 * Rather than a rotated 45° isometric grid, this is an axis-aligned top-down
 * plane with the y axis vertically squashed and a separate upward lift for
 * height. That buys three things a rotated grid does not:
 *
 *  - the sim's x/y stay legible on screen, so a debug read of a position is
 *    still meaningful;
 *  - the projection is separable (x depends only on world x), so culling and
 *    camera clamping are per-axis interval maths rather than polygon work;
 *  - it is trivially invertible, which is what makes the round-trip test real.
 *
 * Depth is world y, so painting back-to-front is a sort on one scalar.
 */

export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Vertical foreshortening. 0.62 reads as a camera tilted ~50° off vertical. */
export const Y_SQUASH = 0.62;

/** Screen pixels of lift per world unit of height, before zoom. */
export const Z_LIFT = 0.55;

export function projectX(worldX: number, cam: Camera, view: Viewport): number {
  return (worldX - cam.x) * cam.zoom + view.width / 2;
}

export function projectY(worldY: number, worldZ: number, cam: Camera, view: Viewport): number {
  return (worldY - cam.y) * cam.zoom * Y_SQUASH - worldZ * cam.zoom * Z_LIFT + view.height / 2;
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  worldZ: number,
  cam: Camera,
  view: Viewport,
): Point {
  return { x: projectX(worldX, cam, view), y: projectY(worldY, worldZ, cam, view) };
}

/** Inverse at ground level (z = 0). */
export function screenToWorld(screenX: number, screenY: number, cam: Camera, view: Viewport): Point {
  return {
    x: (screenX - view.width / 2) / cam.zoom + cam.x,
    y: (screenY - view.height / 2) / (cam.zoom * Y_SQUASH) + cam.y,
  };
}

export interface WorldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/** World-space AABB of what the viewport covers, grown by `margin` world units. */
export function visibleWorldBounds(cam: Camera, view: Viewport, margin = 0): WorldBounds {
  const halfW = view.width / 2 / cam.zoom;
  const halfH = view.height / 2 / (cam.zoom * Y_SQUASH);
  return {
    minX: cam.x - halfW - margin,
    maxX: cam.x + halfW + margin,
    minY: cam.y - halfH - margin,
    maxY: cam.y + halfH + margin,
  };
}
