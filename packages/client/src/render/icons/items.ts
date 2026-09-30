/** Item icons plus the gold-padding and fallback icons. 64-box, centre-local. */

import type { Ctx2D } from '../ctx.js';
import {
  INK, TONES, cel, circle, ellipse, poly, rrect, sparkle, stick, tick, inkWeight, type PathFn,
} from './paint.js';

/** Stompers: a chunky boot with a thick sole and dust puffs. */
export function paintBoots(ctx: Ctx2D): void {
  ctx.fillStyle = '#e9dfc6';
  ctx.beginPath();
  ctx.arc(-24, 19, 3, 0, Math.PI * 2);
  ctx.arc(-27, 12, 2, 0, Math.PI * 2);
  ctx.fill();
  const boot: PathFn = (c) => {
    c.beginPath();
    c.moveTo(-11, -20);
    c.lineTo(4, -20);
    c.lineTo(5, 1);
    c.quadraticCurveTo(17, 3, 22, 10);
    c.quadraticCurveTo(25, 16, 21, 19);
    c.lineTo(-13, 19);
    c.quadraticCurveTo(-14, 6, -11, -20);
    c.closePath();
  };
  cel(ctx, boot, TONES.leather);
  cel(ctx, rrect(-15, 14, 40, 8, 3.5), TONES.dark);
  cel(ctx, rrect(-14, -25, 20, 8, 3.5), TONES.brass);
  ctx.strokeStyle = TONES.leather.light;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, -10); ctx.lineTo(2, -9);
  ctx.moveTo(-4, -4); ctx.lineTo(3, -3);
  ctx.stroke();
  tick(ctx, -8, -16, -8, 8, TONES.leather.light, 2.4);
}

/** Spurs: a brass heel band, a neck and a big star rowel. */
export function paintSpurs(ctx: Ctx2D): void {
  stick(ctx, (c) => { c.beginPath(); c.moveTo(-3, 8); c.lineTo(10, 19); }, 5.5, TONES.steel.base);
  stick(ctx, (c) => { c.beginPath(); c.arc(-4, -9, 17, 0.05, Math.PI - 0.05); }, 6, TONES.brass.base, 'butt');
  cel(ctx, circle(-21, -9, 4.6), TONES.steel);
  cel(ctx, circle(13, -9, 4.6), TONES.steel);
  const N = 6;
  const rowel: PathFn = (c) => {
    c.beginPath();
    for (let i = 0; i < N * 2; i++) {
      const r = i % 2 === 0 ? 14 : 8.5;
      const t = (i / (N * 2)) * Math.PI * 2 - Math.PI / 2;
      const x = 16 + Math.cos(t) * r;
      const y = 19 + Math.sin(t) * r;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
  };
  cel(ctx, rowel, TONES.steel);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(16, 19, 2.6, 0, Math.PI * 2);
  ctx.fill();
  tick(ctx, -17, 0, -10, 6, TONES.brass.light, 2.4);
}

/** Scrap Plating: a riveted, rust-spotted breastplate. */
export function paintPlating(ctx: Ctx2D): void {
  const plate: PathFn = (c) => {
    c.beginPath();
    c.moveTo(-23, -19);
    c.quadraticCurveTo(-11, -27, -6, -21);
    c.quadraticCurveTo(0, -17, 6, -21);
    c.quadraticCurveTo(11, -27, 23, -19);
    c.lineTo(20, 10);
    c.quadraticCurveTo(14, 21, 0, 26);
    c.quadraticCurveTo(-14, 21, -20, 10);
    c.closePath();
  };
  cel(ctx, plate, TONES.plate);
  ctx.strokeStyle = TONES.plate.shade;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(0, -14); ctx.lineTo(0, 20);
  ctx.moveTo(-14, -3); ctx.lineTo(14, -3);
  ctx.stroke();
  ctx.fillStyle = '#b8693a';
  ctx.beginPath();
  ctx.moveTo(4, 5); ctx.quadraticCurveTo(12, 1, 15, 8); ctx.quadraticCurveTo(10, 15, 4, 12); ctx.quadraticCurveTo(1, 9, 4, 5);
  ctx.fill();
  for (const [x, y] of [[-14, -12], [14, -12], [-11, 9], [11, 17]] as const) {
    cel(ctx, circle(x, y, 3), TONES.brass);
  }
  tick(ctx, -17, -13, -15, 4, TONES.plate.light, 2.6);
}

/** Field Tonic: a corked flask of green tonic with a heal cross. */
export function paintTonic(ctx: Ctx2D): void {
  const flask: PathFn = (c) => {
    c.beginPath();
    c.moveTo(-5.5, -16);
    c.lineTo(-5.5, -9);
    c.quadraticCurveTo(-21, -3, -18, 11);
    c.quadraticCurveTo(-15, 24, 0, 24);
    c.quadraticCurveTo(15, 24, 18, 11);
    c.quadraticCurveTo(21, -3, 5.5, -9);
    c.lineTo(5.5, -16);
    c.closePath();
  };
  cel(ctx, flask, TONES.glass);
  ctx.save();
  flask(ctx);
  ctx.clip();
  ctx.fillStyle = TONES.green.shade;
  ctx.fillRect(-25, -2, 50, 30);
  ctx.fillStyle = TONES.green.base;
  ctx.fillRect(-28, 0, 50, 30);
  ctx.fillStyle = TONES.green.light;
  ctx.fillRect(-25, -2, 50, 2.6);
  ctx.restore();
  flask(ctx);
  ctx.strokeStyle = INK;
  ctx.lineWidth = inkWeight();
  ctx.stroke();
  cel(ctx, rrect(-7, -24, 14, 9, 3), TONES.wood);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-2, 6, 4, 12);
  ctx.fillRect(-6, 10, 12, 4);
  tick(ctx, -13, 3, -13, 13, '#ffffff', 2.6);
}

/** Lodestone: a horseshoe magnet with pale tips and sparks. */
export function paintMagnet(ctx: Ctx2D): void {
  const shoe: PathFn = (c) => {
    c.beginPath();
    c.moveTo(-14, -14);
    c.lineTo(-14, -1);
    c.arc(0, -1, 14, Math.PI, 0, true);
    c.lineTo(14, -14);
  };
  stick(ctx, shoe, 10, TONES.blue.base, 'butt');
  ctx.strokeStyle = TONES.blue.light;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-16, -8); ctx.lineTo(-16, 0);
  ctx.arc(0, -1, 16, Math.PI, Math.PI * 0.7, true);
  ctx.stroke();
  cel(ctx, rrect(-19.5, -25, 11, 11, 2), TONES.bone);
  cel(ctx, rrect(8.5, -25, 11, 11, 2), TONES.bone);
  cel(ctx, sparkle(-1, -20, 6), TONES.gold);
  cel(ctx, circle(24, -6, 2.6), TONES.gold);
  cel(ctx, circle(-25, 8, 2.4), TONES.gold);
}

/** Vacuum Tube: a glass valve with a glowing filament and a brass base. */
export function paintVacuum(ctx: Ctx2D): void {
  for (const x of [-6, 0, 6]) {
    ctx.fillStyle = INK;
    ctx.fillRect(x - 1.8, 18, 3.6, 10);
    ctx.fillStyle = TONES.steel.base;
    ctx.fillRect(x - 0.8, 18, 1.6, 9);
  }
  cel(ctx, rrect(-11, -25, 22, 38, 11), TONES.cyan);
  ctx.fillStyle = '#eafcff';
  ctx.beginPath();
  ctx.ellipse(0, -6, 5.5, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ff9d2e';
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-4, 6); ctx.lineTo(-4, -8); ctx.lineTo(0, -1); ctx.lineTo(4, -12); ctx.lineTo(4, 6);
  ctx.stroke();
  ctx.fillStyle = '#ffe08a';
  ctx.beginPath();
  ctx.arc(0, -8, 2, 0, Math.PI * 2);
  ctx.fill();
  cel(ctx, rrect(-12, 10, 24, 10, 3), TONES.brass);
  tick(ctx, -7, -20, -7, -8, '#ffffff', 2.6);
}

/** Fat Wallet: a tied burlap coin purse with a gold coin. */
export function paintWallet(ctx: Ctx2D): void {
  const sack: PathFn = (c) => {
    c.beginPath();
    c.moveTo(-8, -13);
    c.quadraticCurveTo(-24, -1, -21, 12);
    c.quadraticCurveTo(-18, 24, 0, 24);
    c.quadraticCurveTo(18, 24, 21, 12);
    c.quadraticCurveTo(24, -1, 8, -13);
    c.closePath();
  };
  cel(ctx, poly(-8, -14, -14, -24, -4, -19, 0, -26, 4, -19, 14, -24, 8, -14), TONES.burlap);
  cel(ctx, sack, TONES.burlap);
  cel(ctx, rrect(-11, -17, 22, 7, 3.5), TONES.leather);
  cel(ctx, circle(0, 8, 9), TONES.gold);
  ctx.strokeStyle = TONES.gold.shade;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0, 8, 5, 0, Math.PI * 2);
  ctx.stroke();
  tick(ctx, -14, -1, -17, 8, TONES.burlap.light, 2.6);
}

/** Gauntlet: a steel mitten with a brass cuff. */
export function paintGauntlet(ctx: Ctx2D): void {
  const xs = [-9.5, -3.2, 3.1, 9.4];
  const tops = [-17, -21, -21, -17];
  for (let i = 0; i < 4; i++) {
    cel(ctx, rrect(xs[i]! - 3.5, tops[i]!, 7, 16, 3.2), TONES.steel);
  }
  cel(ctx, rrect(-14, -8, 28, 22, 6), TONES.steel);
  cel(ctx, rrect(-19, -3, 9, 15, 4), TONES.steel);
  cel(ctx, rrect(-15, 13, 30, 12, 4), TONES.brass);
  for (const x of [-9.5, -3.2, 3.1, 9.4]) {
    ctx.fillStyle = TONES.steel.shade;
    ctx.beginPath();
    ctx.arc(x, -6, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  tick(ctx, -11, -3, -11, 8, '#ffffff', 2.4);
  tick(ctx, -10, 17, 9, 17, TONES.brass.light, 2.4);
}

/** Cracked Lens: a brass-ringed magnifier with a crack and a glint. */
export function paintLens(ctx: Ctx2D): void {
  ctx.save();
  ctx.translate(7, 7);
  ctx.rotate(Math.PI / 4);
  cel(ctx, rrect(-4, 6, 8, 20, 3.5), TONES.wood, Math.PI / 4);
  ctx.restore();
  cel(ctx, circle(-5, -5, 18), TONES.brass);
  ctx.fillStyle = '#d9f4fb';
  ctx.beginPath();
  ctx.arc(-5, -5, 12.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-2, -14); ctx.lineTo(-6, -6); ctx.lineTo(1, -1); ctx.lineTo(-1, 6);
  ctx.moveTo(-6, -6); ctx.lineTo(-14, -3);
  ctx.stroke();
  tick(ctx, -13, -12, -8, -16, '#ffffff', 3);
}

/** Brass Bell: a bell with sound arcs. */
export function paintBell(ctx: Ctx2D): void {
  stick(ctx, (c) => { c.beginPath(); c.arc(0, -22, 4, Math.PI, Math.PI * 2); }, 2.4, TONES.brass.shade);
  const bell: PathFn = (c) => {
    c.beginPath();
    c.moveTo(-6, -17);
    c.quadraticCurveTo(-6, -22, 0, -22);
    c.quadraticCurveTo(6, -22, 6, -17);
    c.quadraticCurveTo(8, -5, 14, 7);
    c.quadraticCurveTo(16, 11, 19, 13);
    c.lineTo(-19, 13);
    c.quadraticCurveTo(-16, 11, -14, 7);
    c.quadraticCurveTo(-8, -5, -6, -17);
    c.closePath();
  };
  cel(ctx, circle(0, 19, 4.5), TONES.dark);
  cel(ctx, bell, TONES.brass);
  cel(ctx, rrect(-21, 10, 42, 6.5, 3), TONES.brass);
  tick(ctx, -6, -14, -9, 2, TONES.brass.light, 2.8);
  ctx.strokeStyle = TONES.brass.light;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, -2, 26, Math.PI * 0.86, Math.PI * 1.1);
  ctx.moveTo(26 * Math.cos(-Math.PI * 0.1), -2 + 26 * Math.sin(-Math.PI * 0.1));
  ctx.arc(0, -2, 26, -Math.PI * 0.1, Math.PI * 0.14);
  ctx.stroke();
}

/** Whetstone: a stone slab with a knife blade and sparks. */
export function paintWhetstone(ctx: Ctx2D): void {
  ctx.save();
  ctx.rotate(-0.12);
  cel(ctx, rrect(-26, 4, 52, 18, 5), TONES.stone, -0.12);
  ctx.strokeStyle = TONES.stone.shade;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-18, 13); ctx.lineTo(18, 13);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(-6, 6);
  ctx.rotate(-0.55);
  cel(ctx, poly(0, -6, 27, -6, 34, 0, 0, 3), TONES.steel, -0.55);
  tick(ctx, 4, -3, 26, -3, '#ffffff', 2);
  cel(ctx, rrect(-15, -6, 16, 9, 3), TONES.leather, -0.55);
  ctx.restore();
  ctx.strokeStyle = '#ffe58a';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, 1); ctx.lineTo(-14, -2);
  ctx.moveTo(-6, -2); ctx.lineTo(-9, -8);
  ctx.moveTo(-11, 4); ctx.lineTo(-18, 5);
  ctx.stroke();
}

/** Gold padding: a coin stack with a sparkle. */
export function paintGold(ctx: Ctx2D): void {
  const coin = (x: number, y: number): void => {
    cel(ctx, (c) => {
      c.beginPath();
      c.ellipse(x, y + 4, 12, 6, 0, 0, Math.PI);
      c.lineTo(x - 12, y);
      c.ellipse(x, y, 12, 6, 0, Math.PI, 0);
      c.closePath();
    }, TONES.gold);
    cel(ctx, ellipse(x, y, 12, 6), { base: '#ffd766', shade: '#e6a83a', light: '#fff1aa' });
  };
  coin(-9, 17); coin(-9, 11); coin(-9, 5);
  coin(10, 20); coin(10, 14);
  // A standing coin.
  cel(ctx, circle(12, -2, 10), TONES.gold);
  ctx.strokeStyle = TONES.gold.shade;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(12, -2, 5.6, 0, Math.PI * 2);
  ctx.stroke();
  tick(ctx, 5, -8, 8, -11, TONES.gold.light, 2.4);
  cel(ctx, sparkle(-16, -14, 9), { base: '#fff6bf', shade: '#ffd766', light: '#ffffff' });
}

/** Unknown id: a grey rune-stone with a question mark. */
export function paintFallback(ctx: Ctx2D): void {
  cel(ctx, poly(-12, -22, 12, -22, 22, -4, 14, 20, -14, 20, -22, -4), TONES.stone);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, -6, 7, Math.PI * 1.1, Math.PI * 2.45);
  ctx.lineTo(0, 6);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0, 13, 2.8, 0, Math.PI * 2);
  ctx.fill();
  tick(ctx, -14, -15, -8, -19, TONES.stone.light, 2.6);
}
