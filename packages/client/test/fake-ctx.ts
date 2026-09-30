import type { Ctx2D, GradientLike } from '../src/render/ctx.js';

class FakeGradient implements GradientLike {
  stops: Array<[number, string]> = [];
  addColorStop(o: number, c: string): void { this.stops.push([o, c]); }
}

/** A counting stand-in for CanvasRenderingContext2D. There is no DOM in tests. */
export class FakeCtx {
  calls: Record<string, number> = {};
  texts: string[] = [];
  fillStyle: string | GradientLike = '#000';
  strokeStyle: string | GradientLike = '#000';
  lineWidth = 1;
  globalAlpha = 1;
  font = '10px sans-serif';
  textAlign = 'left';
  textBaseline = 'alphabetic';
  lineJoin = 'miter';
  lineCap = 'butt';
  globalCompositeOperation = 'source-over';
  shadowBlur = 0;
  shadowColor = 'transparent';
  imageSmoothingEnabled = true;
  private depth = 0;
  maxDepth = 0;

  private hit(name: string): void { this.calls[name] = (this.calls[name] ?? 0) + 1; }

  save(): void { this.hit('save'); this.depth++; this.maxDepth = Math.max(this.maxDepth, this.depth); }
  restore(): void { this.hit('restore'); this.depth--; }
  get balanced(): boolean { return this.depth === 0; }

  translate(): void { this.hit('translate'); }
  scale(): void { this.hit('scale'); }
  rotate(): void { this.hit('rotate'); }
  beginPath(): void { this.hit('beginPath'); }
  closePath(): void { this.hit('closePath'); }
  moveTo(): void { this.hit('moveTo'); }
  lineTo(): void { this.hit('lineTo'); }
  arc(): void { this.hit('arc'); }
  ellipse(): void { this.hit('ellipse'); }
  rect(): void { this.hit('rect'); }
  roundRect(): void { this.hit('roundRect'); }
  quadraticCurveTo(): void { this.hit('quadraticCurveTo'); }
  bezierCurveTo(): void { this.hit('bezierCurveTo'); }
  fill(): void { this.hit('fill'); }
  stroke(): void { this.hit('stroke'); }
  clip(): void { this.hit('clip'); }
  fillRect(): void { this.hit('fillRect'); }
  strokeRect(): void { this.hit('strokeRect'); }
  clearRect(): void { this.hit('clearRect'); }
  setLineDash(): void { this.hit('setLineDash'); }
  fillText(t: string): void { this.hit('fillText'); this.texts.push(String(t)); }
  strokeText(t: string): void { this.hit('strokeText'); this.texts.push(String(t)); }
  measureText(t: string): { width: number } { this.hit('measureText'); return { width: String(t).length * 6 }; }
  drawImage(): void { this.hit('drawImage'); }
  createLinearGradient(): GradientLike { this.hit('createLinearGradient'); return new FakeGradient(); }
  createRadialGradient(): GradientLike { this.hit('createRadialGradient'); return new FakeGradient(); }
}

export function fakeCtx(): { ctx: Ctx2D; fake: FakeCtx } {
  const fake = new FakeCtx();
  return { ctx: fake as unknown as Ctx2D, fake };
}
