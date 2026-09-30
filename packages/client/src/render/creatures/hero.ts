/**
 * The hero: golden hair, cream tunic, a flying yellow scarf and the club.
 * Warm gold and cream is the one colour family no enemy uses, and the scarf
 * makes the facing readable even in a crowd.
 */

import { INK, LW, dot, ell, eye, flat, limb, poly, mix, type Pal, type Pose } from './paint.js';

export const HERO_VARIANTS = 3;
/** 0 = normal, 1 = white hit flash, 2 = hurt (red-tinted). */
const heroPals: Pal[] = [];

function tint(v: 0 | 1 | 2, c: string): string {
  if (v === 1) return mix(c, '#ffffff', 0.85);
  if (v === 2) return mix(c, '#ff5040', 0.42);
  return c;
}

export function heroPal(v: 0 | 1 | 2): Pal {
  let p = heroPals[v];
  if (p === undefined) {
    p = {
      body: tint(v, '#fff0d2'), shade: tint(v, '#d9b98a'), light: '#ffffff',
      rim: tint(v, '#fff6e0'), accent: tint(v, '#ffcf3a'), accentShade: tint(v, '#d98a10'),
      dark: tint(v, '#4a2f1e'), white: '#ffffff', pupil: '#2a1a12', glow: '#ffe14a', ink: INK,
    };
    heroPals[v] = p;
  }
  return p;
}

export function paintHero(P: Pose, v: 0 | 1 | 2): void {
  const { c, p, s, k, bounce } = P;
  const lift = -bounce * 0.09;
  const skin = tint(v, '#ffd6b0'), skinShade = tint(v, '#e0a37a');
  const hair = tint(v, '#ffc02e'), hairShade = tint(v, '#d98f10');
  const wood = tint(v, '#a4693a'), woodShade = tint(v, '#6d4222');

  // scarf tail, streaming behind and rippling with the step cycle
  poly(
    P,
    [-0.3, -1.95 + lift, -1.1, -2.0 + lift + s * 0.1, -1.9, -2.25 + lift + s * 0.3, -2.55, -1.75 + lift + s * 0.4,
      -2.0, -1.6 + lift + s * 0.3, -1.1, -1.65 + lift + s * 0.1, -0.3, -1.6 + lift],
    p.accent, p.accentShade, '#fff2a8',
  );
  // boots and legs
  limb(P, [-0.28, -0.85, -0.28 + s * 0.4, -0.16], 0.3, p.dark);
  limb(P, [0.32, -0.85, 0.32 - s * 0.4, -0.16], 0.3, p.dark);
  dot(P, -0.28 + s * 0.4 + 0.08, -0.12, 0.3, 0.17, tint(v, '#6a3f22'));
  dot(P, 0.32 - s * 0.4 + 0.08, -0.12, 0.3, 0.17, tint(v, '#6a3f22'));
  // back arm
  limb(P, [-0.6, -1.65 + lift, -0.9, -1.05 + lift + s * 0.15], 0.26, skinShade);
  // tunic
  ell(P, 0, -1.3 + lift, 0.8, 0.78);
  flat(P, [-0.78, -1.1 + lift, 0.78, -1.1 + lift, 0.72, -0.88 + lift, -0.72, -0.88 + lift], p.dark);
  dot(P, 0.05, -0.99 + lift, 0.16, 0.13, p.accent);
  // head
  ell(P, 0.1, -2.42 + lift, 0.84, 0.78, skin, skinShade, tint(v, '#fff0dc'));
  ell(P, 0.0, -2.98 + lift, 0.78, 0.36, hair, hairShade, tint(v, '#ffe58a'));
  poly(P, [-0.62, -2.9 + lift, -0.95, -2.55 + lift, -0.55, -2.4 + lift], hair, hairShade, tint(v, '#ffe58a'));
  poly(P, [0.35, -3.2 + lift, 0.6, -3.65 + lift, 0.8, -3.1 + lift], hair, hairShade, tint(v, '#ffe58a'));
  eye(P, -0.04, -2.4 + lift, 0.24, { lx: 0.7, ly: 0.05 });
  eye(P, 0.62, -2.4 + lift, 0.24, { lx: 0.7, ly: 0.05 });
  c.globalAlpha = 0.5;
  dot(P, -0.18, -2.05 + lift, 0.16, 0.1, tint(v, '#ff8a8a'), false);
  dot(P, 0.78, -2.05 + lift, 0.16, 0.1, tint(v, '#ff8a8a'), false);
  c.globalAlpha = 1;
  c.beginPath();
  c.moveTo(0.18, -2.02 + lift);
  c.quadraticCurveTo(0.34, -1.85 + lift, 0.5, -2.02 + lift);
  c.strokeStyle = INK;
  c.lineWidth = LW * 0.8;
  c.lineCap = 'round';
  c.stroke();
  // the club: swings with the stride
  const sw = s * 0.12;
  limb(P, [0.75, -1.6 + lift, 1.2, -1.2 + lift + sw], 0.26, skin);
  limb(P, [1.15, -1.15 + lift + sw, 1.75, -2.55 + lift + sw * 2], 0.34, wood);
  ell(P, 1.9, -2.9 + lift + sw * 2, 0.46, 0.54, wood, woodShade, tint(v, '#d99a62'), 0.3);
  dot(P, 1.8, -2.95 + lift + sw * 2, 0.07, 0.07, woodShade, false);
  dot(P, 2.0, -2.75 + lift + sw * 2, 0.07, 0.07, woodShade, false);
  dot(P, 1.15, -1.15 + lift + sw, 0.2, 0.2, skin);
  // let the linter know k is intentionally unused in the hero cycle
  void k;
}
