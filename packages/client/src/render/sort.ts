/**
 * Y-sorted draw list.
 *
 * At 1500+ entities the naive approach — build an array of objects each frame
 * and sort it — allocates 1500 objects and a fresh array 60 times a second. This
 * buffer pools its sprite records and reuses one backing array, so after the
 * first few frames the draw loop allocates nothing and the GC stays quiet.
 */

export type SpriteKind =
  | 'pickup'
  | 'corpse'
  | 'obstacle'
  | 'interactable'
  | 'projectile'
  | 'enemy'
  | 'merchant'
  | 'player';

/**
 * Layers come before depth: a pickup lying on the ground must never paint over
 * an enemy standing in front of it, whatever their world y.
 */
export const LAYER: Readonly<Record<SpriteKind, number>> = Object.freeze({
  pickup: 0,
  corpse: 1,
  obstacle: 2,
  interactable: 2,
  projectile: 2,
  enemy: 2,
  merchant: 2,
  player: 2,
});

export interface Sprite {
  kind: SpriteKind;
  layer: number;
  /** Index into the source array (enemies, pickups, obstacles…). */
  index: number;
  wx: number;
  wy: number;
  wz: number;
  depth: number;
}

export function compareSprites(a: Sprite, b: Sprite): number {
  if (a.layer !== b.layer) return a.layer - b.layer;
  if (a.depth !== b.depth) return a.depth - b.depth;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  return a.index - b.index;
}

export class SpriteBuffer {
  private readonly pool: Sprite[] = [];
  private readonly active: Sprite[] = [];

  get length(): number {
    return this.active.length;
  }

  reset(): void {
    this.active.length = 0;
  }

  push(kind: SpriteKind, index: number, wx: number, wy: number, wz: number): void {
    const slot = this.active.length;
    let sprite = this.pool[slot];
    if (sprite === undefined) {
      sprite = { kind, layer: 0, index, wx, wy, wz, depth: wy };
      this.pool[slot] = sprite;
    }
    sprite.kind = kind;
    sprite.layer = LAYER[kind];
    sprite.index = index;
    sprite.wx = wx;
    sprite.wy = wy;
    sprite.wz = wz;
    sprite.depth = wy;
    this.active.push(sprite);
  }

  sort(): void {
    this.active.sort(compareSprites);
  }

  items(): readonly Sprite[] {
    return this.active;
  }
}
