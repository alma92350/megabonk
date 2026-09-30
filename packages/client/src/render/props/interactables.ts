/**
 * Chests and shrines: the exploration rewards.
 *
 * They have to be the loudest, warmest things in the world: a treasure chest
 * bound in iron and gold on a golden ground glow, and a pale stone altar inside
 * a glowing rune circle with a floating rune crystal. Armed ones pulse and cast
 * a light shaft; spent ones are dull, dark, cracked and unlit. The "armed vs
 * spent" difference is carried by shape (open lid / cracked stub), not just
 * colour and brightness.
 */

import type { Interactable } from '@megabonk/sim';
import type { Ctx2D } from '../ctx.js';
import { Y_SQUASH } from '../projection.js';
import type { SpriteCache } from '../atlas.js';
import { U } from './obstacleStyle.js';
import { bob, glowPulse, twinkle } from './motion.js';
import { FEET, Prop, inkStroke, paintGroundDisc, paintHalo, paintSpark, polygon, propCache } from './bake.js';
import { CHEST_GLOW, INK, rgba, shrineTint, type RuneGlyph, type ShrineTint } from './palette.js';

export interface InteractableState {
  /** True while the object is armed: it glows, pulses and casts a shaft. */
  readonly glow: boolean;
  /** Stable visual-state id; differs between armed and spent. */
  readonly key: string;
}

export function interactableState(it: Interactable): InteractableState {
  const armed = !it.used;
  const tint = it.kind === 'shrine' ? shrineTint(it.shrineId).id : 'chest';
  return { glow: armed, key: `${it.kind}:${armed ? 'armed' : 'spent'}:${tint}` };
}

// ---- chest -----------------------------------------------------------------

interface ChestColours {
  readonly wood: string; readonly woodDark: string; readonly woodLight: string;
  readonly iron: string; readonly ironLight: string; readonly gold: string; readonly goldDark: string;
}
const CHEST_NEW: ChestColours = {
  wood: '#93582a', woodDark: '#5a3316', woodLight: '#bd7d40',
  iron: '#4a5060', ironLight: '#8b95a8', gold: '#ffd24d', goldDark: '#b2700e',
};
const CHEST_SPENT: ChestColours = {
  wood: '#5f5348', woodDark: '#372e27', woodLight: '#7a6d60',
  iron: '#363a41', ironLight: '#59606a', gold: '#6d685c', goldDark: '#443f37',
};

const CHEST_W = 88;
const CHEST_H = 110;

function band(ctx: Ctx2D, c: ChestColours, x0: number, x1: number, top: number, bottom: number): void {
  polygon(ctx, [x0, bottom, x1, bottom, x1, top, x0, top]);
  ctx.fillStyle = c.iron;
  ctx.fill();
  ctx.fillStyle = c.ironLight;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(x0, top, 1.6, bottom - top);
  ctx.globalAlpha = 1;
}

function rivet(ctx: Ctx2D, c: ChestColours, x: number, y: number): void {
  ctx.fillStyle = c.gold;
  ctx.beginPath();
  ctx.arc(x, y, 1.7, 0, Math.PI * 2);
  ctx.fill();
}

function paintChest(ctx: Ctx2D, spent: boolean): void {
  const c = spent ? CHEST_SPENT : CHEST_NEW;
  if (spent) {
    // Open lid, propped back behind the body: its inner face is what we see.
    polygon(ctx, [-23, -28, 23, -28, 19, -60, -19, -60]);
    ctx.fillStyle = c.woodDark;
    ctx.fill();
    inkStroke(ctx, 1.8);
    band(ctx, c, -12, -6, -58, -29);
    band(ctx, c, 6, 12, -58, -29);
  }

  // Body.
  const body = [-26, 0, 26, 0, 24, -27, -24, -27];
  polygon(ctx, body);
  ctx.fillStyle = c.wood;
  ctx.fill();
  ctx.strokeStyle = c.woodDark;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(-25, -9); ctx.lineTo(25, -9);
  ctx.moveTo(-24.5, -18); ctx.lineTo(24.5, -18);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.woodLight;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(-24, -26, 3, 25);
  ctx.globalAlpha = 1;
  band(ctx, c, -17, -10, -27, 0);
  band(ctx, c, 10, 17, -27, 0);
  rivet(ctx, c, -13.5, -22); rivet(ctx, c, -13.5, -5);
  rivet(ctx, c, 13.5, -22); rivet(ctx, c, 13.5, -5);
  // Dark foot rim.
  ctx.fillStyle = c.woodDark;
  ctx.fillRect(-26, -3, 52, 3);
  polygon(ctx, body);
  inkStroke(ctx, 2);

  if (spent) {
    // Empty interior, visible over the front rim: a dark opening, no treasure.
    polygon(ctx, [-22, -27, 22, -27, 19, -33, -19, -33]);
    ctx.fillStyle = '#140e09';
    ctx.fill();
    inkStroke(ctx, 1.4);
    // A torn-off lock stub.
    ctx.fillStyle = c.goldDark;
    ctx.fillRect(-2.5, -25, 5, 4);
    return;
  }

  // Domed lid.
  ctx.beginPath();
  ctx.moveTo(-25, -27);
  ctx.quadraticCurveTo(-25, -48, 0, -48);
  ctx.quadraticCurveTo(25, -48, 25, -27);
  ctx.closePath();
  ctx.fillStyle = c.wood;
  ctx.fill();
  ctx.fillStyle = c.woodLight;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(-23, -30);
  ctx.quadraticCurveTo(-23, -44, -4, -46);
  ctx.quadraticCurveTo(-16, -40, -15, -30);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  // Bands over the lid follow the dome.
  for (const bx of [-13.5, 13.5]) {
    ctx.fillStyle = c.iron;
    ctx.beginPath();
    ctx.moveTo(bx - 3.5, -27);
    ctx.lineTo(bx - 3.5, -41);
    ctx.lineTo(bx + 3.5, -41);
    ctx.lineTo(bx + 3.5, -27);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(-25, -27);
  ctx.quadraticCurveTo(-25, -48, 0, -48);
  ctx.quadraticCurveTo(25, -48, 25, -27);
  ctx.closePath();
  inkStroke(ctx, 2);
  // Gold seam.
  ctx.fillStyle = c.gold;
  ctx.fillRect(-25, -30, 50, 4);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-25, -30, 50, 4);
  // Big gold lock plate: the "this is treasure" signifier.
  ctx.beginPath();
  ctx.moveTo(-7, -35); ctx.lineTo(7, -35); ctx.lineTo(7, -19); ctx.lineTo(0, -15); ctx.lineTo(-7, -19);
  ctx.closePath();
  ctx.fillStyle = c.gold;
  ctx.fill();
  inkStroke(ctx, 1.8);
  ctx.fillStyle = '#fff3ae';
  ctx.globalAlpha = 0.7;
  ctx.fillRect(-5.5, -33.5, 3, 12);
  ctx.globalAlpha = 1;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0, -27, 2.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-1, -27, 2, 6);
}

// ---- shrine ----------------------------------------------------------------

const ALTAR_W = 92;
const ALTAR_H = 132;

export function paintGlyph(ctx: Ctx2D, glyph: RuneGlyph, s: number): void {
  ctx.beginPath();
  switch (glyph) {
    case 'flame':
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.95, -s * 0.05, s * 0.55, s * 0.5);
      ctx.quadraticCurveTo(0, s * 1.1, -s * 0.55, s * 0.5);
      ctx.quadraticCurveTo(-s * 0.95, -s * 0.05, 0, -s);
      ctx.closePath();
      break;
    case 'wing':
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.95, s * 0.05); ctx.lineTo(s * 0.55, s * 0.05);
      ctx.lineTo(0, -s * 0.45); ctx.lineTo(-s * 0.55, s * 0.05); ctx.lineTo(-s * 0.95, s * 0.05);
      ctx.closePath();
      ctx.moveTo(0, -s * 0.15); ctx.lineTo(s * 0.95, s * 0.9); ctx.lineTo(s * 0.55, s * 0.9);
      ctx.lineTo(0, s * 0.35); ctx.lineTo(-s * 0.55, s * 0.9); ctx.lineTo(-s * 0.95, s * 0.9);
      ctx.closePath();
      break;
    case 'shield':
      ctx.moveTo(-s * 0.8, -s * 0.85); ctx.lineTo(s * 0.8, -s * 0.85); ctx.lineTo(s * 0.8, -s * 0.05);
      ctx.quadraticCurveTo(s * 0.7, s * 0.7, 0, s);
      ctx.quadraticCurveTo(-s * 0.7, s * 0.7, -s * 0.8, -s * 0.05);
      ctx.closePath();
      break;
    case 'coin':
      ctx.arc(0, 0, s * 0.95, 0, Math.PI * 2);
      ctx.moveTo(0, -s * 0.5); ctx.lineTo(-s * 0.36, 0); ctx.lineTo(0, s * 0.5); ctx.lineTo(s * 0.36, 0);
      ctx.closePath();
      break;
    default:
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.28, -s * 0.28); ctx.lineTo(s, 0); ctx.lineTo(s * 0.28, s * 0.28);
      ctx.lineTo(0, s); ctx.lineTo(-s * 0.28, s * 0.28); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.28, -s * 0.28);
      ctx.closePath();
  }
}

function paintAltar(ctx: Ctx2D, t: ShrineTint | null): void {
  const spent = t === null;
  const stone = spent ? '#3b4147' : '#8d97a4';
  const stoneDark = spent ? '#272c31' : '#5d6773';
  const stoneLight = spent ? '#50575e' : '#c1cad4';

  // Two-step plinth.
  polygon(ctx, [-34, 0, 34, 0, 30, -11, -30, -11]);
  ctx.fillStyle = stoneDark;
  ctx.fill();
  inkStroke(ctx, 1.8);
  polygon(ctx, [-27, -11, 27, -11, 24, -22, -24, -22]);
  ctx.fillStyle = stone;
  ctx.fill();
  inkStroke(ctx, 1.8);
  // Pillar, tapering up, with a capstone.
  const pillar = spent
    ? [-15, -22, 15, -22, 11, -52, 3, -58, -4, -49, -11, -54]
    : [-15, -22, 15, -22, 11, -76, -11, -76];
  polygon(ctx, pillar);
  ctx.fillStyle = stone;
  ctx.fill();
  ctx.fillStyle = stoneLight;
  ctx.globalAlpha = spent ? 0.35 : 0.6;
  polygon(ctx, spent ? [-15, -22, -8, -22, -7, -53, -11, -54] : [-15, -22, -8, -22, -7, -76, -11, -76]);
  ctx.fill();
  ctx.fillStyle = stoneDark;
  ctx.globalAlpha = 0.6;
  polygon(ctx, spent ? [15, -22, 9, -22, 8, -52, 11, -52] : [15, -22, 9, -22, 8, -76, 11, -76]);
  ctx.fill();
  ctx.globalAlpha = 1;
  polygon(ctx, pillar);
  inkStroke(ctx, 2);

  if (spent) {
    // Cracks and rubble: the shape says "broken", not just "dark".
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-3, -50); ctx.lineTo(2, -40); ctx.lineTo(-4, -31); ctx.lineTo(1, -23);
    ctx.moveTo(2, -40); ctx.lineTo(8, -36);
    ctx.stroke();
    ctx.fillStyle = stone;
    for (const [rx, ry, rr] of [[-30, 3, 3.2], [-22, 5, 2.2], [26, 4, 3], [34, 2, 2]] as const) {
      ctx.beginPath();
      ctx.ellipse(rx, ry, rr, rr * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      inkStroke(ctx, 1);
    }
    // Dead, dark engraving.
    ctx.fillStyle = '#1a1e22';
    paintGlyph(ctx, 'star', 5);
    ctx.fill();
    return;
  }

  ctx.fillStyle = stone;
  polygon(ctx, [-16, -76, 16, -76, 19, -84, -19, -84]);
  ctx.fill();
  inkStroke(ctx, 1.8);
  ctx.fillStyle = stoneLight;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(-18, -83, 36, 2);
  ctx.globalAlpha = 1;

  // Carved glyph, lit from within, with a soft plate behind it.
  ctx.save();
  ctx.translate(0, -49);
  ctx.fillStyle = rgba(t.color, 0.3);
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = t.color;
  paintGlyph(ctx, t.glyph, 8.5);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();

  // Rune notches down the pillar edges.
  ctx.fillStyle = t.color;
  ctx.globalAlpha = 0.85;
  for (const ny of [-33, -65]) {
    ctx.fillRect(-2.5, ny, 5, 3);
  }
  ctx.globalAlpha = 1;
}

function paintRuneCircle(ctx: Ctx2D, color: string | null): void {
  const c = color ?? '#59616a';
  const a = color === null ? 0.35 : 1;
  ctx.globalAlpha = a;
  ctx.fillStyle = rgba(c, color === null ? 0.05 : 0.14);
  ctx.beginPath();
  ctx.ellipse(0, 0, 62, 62 * Y_SQUASH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = c;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, 62, 62 * Y_SQUASH, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 50, 50 * Y_SQUASH, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Rune ticks between the rings.
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + 0.26;
    const co = Math.cos(ang), si = Math.sin(ang);
    if (color === null && i % 3 === 0) continue; // a broken ring
    ctx.moveTo(co * 52, si * 52 * Y_SQUASH);
    ctx.lineTo(co * 60, si * 60 * Y_SQUASH);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function paintFloater(ctx: Ctx2D, t: ShrineTint): void {
  // A floating crystal holding the shrine's glyph.
  polygon(ctx, [0, -22, 12, -8, 12, 8, 0, 22, -12, 8, -12, -8]);
  ctx.fillStyle = t.color;
  ctx.fill();
  polygon(ctx, [0, -22, 12, -8, 0, 0, -12, -8]);
  ctx.fillStyle = t.light;
  ctx.globalAlpha = 0.75;
  ctx.fill();
  ctx.globalAlpha = 1;
  polygon(ctx, [0, -22, 12, -8, 12, 8, 0, 22, -12, 8, -12, -8]);
  inkStroke(ctx, 1.8);
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.8;
  paintGlyph(ctx, t.glyph, 6.5);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function paintBeam(ctx: Ctx2D, color: string, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, -h);
  g.addColorStop(0, rgba(color, 0.42));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  polygon(ctx, [-16, 0, 16, 0, 11, -h, -11, -h]);
  ctx.fill();
  const g2 = ctx.createLinearGradient(0, 0, 0, -h);
  g2.addColorStop(0, rgba('#ffffff', 0.32));
  g2.addColorStop(1, rgba('#ffffff', 0));
  ctx.fillStyle = g2;
  polygon(ctx, [-6, 0, 6, 0, 4, -h * 0.85, -4, -h * 0.85]);
  ctx.fill();
}

// ---- entry -----------------------------------------------------------------

const CHEST_PROPS = {
  groundGlow: new Prop('ix:ground-glow:chest', 150, 150, (c) => paintHalo(c, CHEST_GLOW, 72, 0.9)),
  beam: new Prop('ix:beam:chest', 40, 130, (c) => paintBeam(c, CHEST_GLOW, 120), { ax: 0.5, ay: 0.92 }),
  halo: new Prop('ix:halo:chest', 130, 130, (c) => paintHalo(c, CHEST_GLOW, 62, 0.8)),
  armed: new Prop('ix:chest:armed', CHEST_W, CHEST_H, (c) => paintChest(c, false), FEET),
  spent: new Prop('ix:chest:spent', CHEST_W, CHEST_H, (c) => paintChest(c, true), FEET),
  dust: new Prop('ix:dust', 100, 60, (c) => paintGroundDisc(c, 34, 12, '#000000', 0.4)),
};
const SPARK = new Prop('pk:spark', 24, 24, (c) => paintSpark(c, 11));
const SPENT_SHRINE = {
  rune: new Prop('ix:rune:spent', 130, 90, (c) => paintRuneCircle(c, null)),
  altar: new Prop('ix:altar:spent', ALTAR_W, ALTAR_H, (c) => paintAltar(c, null), FEET, 1.18),
};

interface TintProps {
  readonly groundGlow: Prop; readonly rune: Prop; readonly beam: Prop;
  readonly altar: Prop; readonly halo: Prop; readonly floater: Prop;
}
const tintProps = new Map<string, TintProps>();

function propsFor(t: ShrineTint): TintProps {
  let p = tintProps.get(t.id);
  if (p === undefined) {
    p = {
      groundGlow: new Prop(`ix:ground-glow:${t.id}`, 190, 190, (c) => paintHalo(c, t.color, 92, 0.85)),
      rune: new Prop(`ix:rune:${t.id}`, 130, 90, (c) => paintRuneCircle(c, t.color)),
      beam: new Prop(`ix:beam:${t.id}`, 40, 200, (c) => paintBeam(c, t.color, 190), { ax: 0.5, ay: 0.95 }),
      altar: new Prop(`ix:altar:${t.id}`, ALTAR_W, ALTAR_H, (c) => paintAltar(c, t), FEET, 1.18),
      halo: new Prop(`ix:halo:${t.id}`, 120, 120, (c) => paintHalo(c, t.color, 56, 0.9), undefined, 1.18),
      floater: new Prop(`ix:floater:${t.id}`, 40, 52, (c) => paintFloater(c, t), undefined, 1.18),
    };
    tintProps.set(t.id, p);
  }
  return p;
}

export function drawInteractableProp(
  ctx: Ctx2D, it: Interactable, x: number, groundY: number, zoom: number,
  time: number, reduce: boolean, cache: SpriteCache = propCache,
): void {
  const k = zoom / U;
  const armed = !it.used;

  if (it.kind === 'chest') {
    const P = CHEST_PROPS;
    if (armed) {
      const pulse = glowPulse(time, it.id * 0.9, reduce);
      P.groundGlow.draw(ctx, cache, zoom, x, groundY, 0.35 + 0.5 * pulse, 1, Y_SQUASH);
      P.beam.draw(ctx, cache, zoom, x, groundY - 20 * k, 0.35 + 0.45 * pulse);
      P.halo.draw(ctx, cache, zoom, x, groundY - 22 * k, 0.25 + 0.4 * pulse);
    } else {
      P.dust.draw(ctx, cache, zoom, x, groundY, 0.5);
    }
    (armed ? P.armed : P.spent).draw(ctx, cache, zoom, x, groundY, armed ? 1 : 0.82);
    if (armed) {
      for (let i = 0; i < 2; i++) {
        const tw = twinkle(time, it.id + i * 3.7, reduce);
        if (tw > 0.04) {
          SPARK.draw(ctx, cache, zoom, x + (i === 0 ? -16 : 14) * k, groundY - (i === 0 ? 46 : 38) * k, 1, tw * 1.1, tw * 1.1);
        }
      }
    }
    return;
  }

  if (!armed) {
    SPENT_SHRINE.rune.draw(ctx, cache, zoom, x, groundY);
    SPENT_SHRINE.altar.draw(ctx, cache, zoom, x, groundY);
    return;
  }

  const t = shrineTint(it.shrineId);
  const P = propsFor(t);
  const ka = k * 1.18;
  const pulse = glowPulse(time, it.id * 1.3, reduce);
  P.groundGlow.draw(ctx, cache, zoom, x, groundY, 0.4 + 0.5 * pulse, 1, Y_SQUASH);
  P.rune.draw(ctx, cache, zoom, x, groundY, 0.55 + 0.45 * pulse);
  P.beam.draw(ctx, cache, zoom, x, groundY - 6 * k, 0.3 + 0.45 * pulse);
  P.altar.draw(ctx, cache, zoom, x, groundY);
  const fz = bob(time, it.id, 0.16, reduce);
  const fy = groundY - (100 + fz * U) * ka;
  P.halo.draw(ctx, cache, zoom, x, fy, 0.5 + 0.5 * pulse);
  P.floater.draw(ctx, cache, zoom, x, fy);
  for (let i = 0; i < 2; i++) {
    const tw = twinkle(time, it.id + i * 2.9, reduce);
    if (tw > 0.04) {
      SPARK.draw(ctx, cache, zoom, x + (i === 0 ? -20 : 19) * k, fy + (i === 0 ? -8 : 10) * k, 1, tw * 1.2, tw * 1.2);
    }
  }
}
