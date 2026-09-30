/**
 * The bestiary. One painter per character concept, each drawn facing RIGHT with
 * its feet on the anchor. `Pose.t` is the walk-cycle position, so frame N of a
 * kind is simply the same painter at cycle position N / FRAMES.
 *
 * Reading order of a glance at 30 px: SILHOUETTE (ears / tail / tusks / hood) ->
 * COLOUR (one hue per role) -> EYES. Every painter therefore spends its effort on
 * one unmistakable silhouette feature and one pair of big, high-contrast eyes.
 */

import {
  LW, dot, eye, ell, fangMouth, flat, glint, limb, line, orb, poly, type Pose,
} from './paint.js';
import type { EnemyShape } from './visuals.js';

export type Painter = (P: Pose) => void;

// ---- grunt: rose goblin with a club ---------------------------------------
const grunt: Painter = (P) => {
  const { p, s, bounce } = P;
  const lift = -bounce * 0.09;
  dot(P, -0.42 + s * 0.2, -0.14 - Math.max(0, s) * 0.12, 0.34, 0.2, p.dark);
  dot(P, 0.46 - s * 0.2, -0.14 - Math.max(0, -s) * 0.12, 0.34, 0.2, p.dark);
  limb(P, [-0.7, -0.95 + lift, -1.05, -0.6 + lift + s * 0.15], 0.24, p.shade);
  ell(P, 0, -0.85 + lift, 0.82, 0.7);
  flat(P, [-0.62, -0.62 + lift, 0.62, -0.62 + lift, 0.5, -0.3 + lift, 0, -0.16 + lift, -0.5, -0.3 + lift], p.accent);
  // the club
  limb(P, [1.02, -0.7 + lift - s * 0.12, 1.5, -1.45 + lift], 0.2, p.accent);
  dot(P, 1.55, -1.62 + lift, 0.3, 0.34, p.accent);
  limb(P, [0.7, -0.98 + lift, 1.02, -0.68 + lift - s * 0.12], 0.26, p.body);
  // ears
  poly(P, [-0.62, -1.95 + lift, -1.95, -2.3 + lift, -0.78, -1.4 + lift]);
  poly(P, [0.75, -1.95 + lift, 2.0, -2.25 + lift, 0.92, -1.4 + lift]);
  flat(P, [-0.75, -1.86 + lift, -1.5, -2.1 + lift, -0.82, -1.6 + lift], p.dark, false);
  flat(P, [0.86, -1.86 + lift, 1.6, -2.06 + lift, 0.95, -1.6 + lift], p.dark, false);
  ell(P, 0.05, -1.72 + lift, 0.92, 0.74);
  eye(P, -0.34, -1.8 + lift, 0.3, { lx: 0.6, brow: 1, angry: 0.8 });
  eye(P, 0.46, -1.8 + lift, 0.3, { lx: 0.6, brow: -1, angry: 0.8 });
  dot(P, 0.08, -1.52 + lift, 0.12, 0.09, p.shade, false);
  fangMouth(P, 0.1, -1.3 + lift, 0.36, 0.17);
};

// ---- runner: amber fox, all speed -----------------------------------------
const fox: Painter = (P) => {
  const { p, s, bounce } = P;
  const lift = -bounce * 0.12;
  // speed streaks
  P.c.globalAlpha = 0.55;
  line(P, [-1.75, -0.35, -2.5, -0.35], 0.12, p.rim);
  line(P, [-1.9, -0.7, -2.7, -0.7], 0.12, p.rim);
  P.c.globalAlpha = 1;
  // tail
  ell(P, -1.4, -1.25 + lift, 0.85, 0.42, p.body, p.shade, p.light, -0.6);
  ell(P, -1.95, -1.78 + lift, 0.4, 0.28, p.accent, p.rim, '#ffffff', -0.6);
  // legs: far pair, near pair
  const leg = (hx: number, sw: number): void => {
    limb(P, [hx, -0.75 + lift, hx + sw * 0.5, -0.12], 0.24, p.shade);
    dot(P, hx + sw * 0.5, -0.1, 0.22, 0.14, p.dark);
  };
  leg(-0.8, -s);
  leg(0.45, s);
  ell(P, -0.05, -0.9 + lift, 1.08, 0.56, p.body, p.shade, p.light, -0.08);
  leg(-0.35, s);
  leg(0.85, -s);
  dot(P, 0.6, -0.72 + lift, 0.36, 0.28, p.accent, false);
  // head
  poly(P, [0.55, -1.6 + lift, 0.5, -2.4 + lift, 1.0, -1.7 + lift]);
  poly(P, [0.9, -1.65 + lift, 1.12, -2.35 + lift, 1.35, -1.5 + lift]);
  flat(P, [0.6, -1.7 + lift, 0.58, -2.15 + lift, 0.85, -1.72 + lift], p.dark, false);
  ell(P, 0.9, -1.2 + lift, 0.6, 0.52);
  poly(P, [1.2, -1.36 + lift, 2.0, -1.05 + lift, 1.2, -0.88 + lift], p.accent, p.rim, '#ffffff');
  dot(P, 2.0, -1.05 + lift, 0.13, 0.11, P.p.ink, false);
  eye(P, 0.7, -1.28 + lift, 0.21, { lx: 0.7, brow: 1, angry: 0.7 });
  eye(P, 1.08, -1.28 + lift, 0.19, { lx: 0.7, brow: -1, angry: 0.7 });
};

// ---- swarmling: buzzing cyan beetle ---------------------------------------
const bug: Painter = (P) => {
  const { p, s, bounce } = P;
  const lift = -0.2 - bounce * 0.12;
  // wings (translucent, flapping)
  P.c.globalAlpha = 0.6;
  ell(P, -0.25, -1.4 + lift, 0.8, 0.28, p.accent, p.rim, '#ffffff', -0.55 + s * 0.45);
  ell(P, 0.35, -1.42 + lift, 0.7, 0.26, p.accent, p.rim, '#ffffff', -0.2 - s * 0.45);
  P.c.globalAlpha = 1;
  // legs
  for (let i = 0; i < 3; i++) {
    const x = -0.45 + i * 0.45;
    line(P, [x, -0.5 + lift, x + (i - 1) * 0.15 + s * 0.12, 0.0], 0.13);
  }
  dot(P, -0.85, -0.7 + lift, 0.42, 0.34, p.accent);
  ell(P, -0.1, -0.85 + lift, 0.9, 0.68);
  dot(P, -0.35, -0.85 + lift, 0.1, 0.55, p.dark, false);
  dot(P, 0.05, -0.85 + lift, 0.1, 0.55, p.dark, false);
  // head with huge eyes
  ell(P, 0.75, -0.95 + lift, 0.42, 0.4, p.body, p.shade, p.light);
  line(P, [0.6, -1.3 + lift, 0.35, -2.0 + lift], 0.11);
  line(P, [0.95, -1.3 + lift, 1.25, -1.95 + lift], 0.11);
  dot(P, 0.35, -2.05 + lift, 0.13, 0.13, p.accent);
  dot(P, 1.25, -2.0 + lift, 0.13, 0.13, p.accent);
  eye(P, 0.62, -1.08 + lift, 0.3, { lx: 0.7, brow: 1, angry: 0.7 });
  eye(P, 1.04, -1.02 + lift, 0.27, { lx: 0.7, brow: -1, angry: 0.7 });
};

// ---- brute: red tusked ogre with a spiked club ----------------------------
const ogre: Painter = (P) => {
  const { p, s, bounce } = P;
  const lift = -bounce * 0.07;
  dot(P, -0.58 + s * 0.16, -0.2, 0.46, 0.26, p.dark);
  dot(P, 0.6 - s * 0.16, -0.2, 0.46, 0.26, p.dark);
  limb(P, [-0.9, -1.6 + lift, -1.3, -0.75 + s * 0.2], 0.5, p.shade);
  ell(P, -1.32, -0.6 + s * 0.2, 0.4, 0.36);
  ell(P, 0, -1.2 + lift, 1.12, 1.0);
  flat(P, [-1.0, -0.66 + lift, 1.0, -0.66 + lift, 0.9, -0.34 + lift, -0.9, -0.34 + lift], p.dark);
  for (let i = -1; i <= 1; i++) dot(P, i * 0.45, -0.5 + lift, 0.09, 0.09, p.accent, false);
  flat(P, [-1.15, -2.0 + lift, -1.45, -2.75 + lift, -0.6, -2.2 + lift], p.accent);
  flat(P, [0.75, -2.15 + lift, 1.15, -2.8 + lift, 1.2, -2.0 + lift], p.accent);
  // head
  ell(P, 0.3, -2.15 + lift, 0.66, 0.52);
  dot(P, 0.3, -1.9 + lift, 0.42, 0.15, p.dark);
  flat(P, [0.02, -1.85 + lift, 0.2, -1.87 + lift, 0.05, -2.4 + lift], p.accent);
  flat(P, [0.4, -1.87 + lift, 0.58, -1.85 + lift, 0.58, -2.4 + lift], p.accent);
  eye(P, 0.1, -2.25 + lift, 0.17, { lx: 0.6, brow: 1, angry: 1, lid: 0.25 });
  eye(P, 0.55, -2.25 + lift, 0.17, { lx: 0.6, brow: -1, angry: 1, lid: 0.25 });
  // front arm and the spiked club
  limb(P, [1.4, -0.75 - s * 0.2, 1.85, -2.0], 0.3, p.accent);
  dot(P, 1.9, -2.2, 0.48, 0.5, p.accent);
  flat(P, [1.75, -2.6, 1.9, -2.95, 2.05, -2.6], p.dark);
  flat(P, [2.3, -2.3, 2.6, -2.2, 2.3, -2.05], p.dark);
  limb(P, [0.92, -1.6 + lift, 1.4, -0.75 - s * 0.2], 0.5, p.body);
  ell(P, 1.4, -0.65 - s * 0.2, 0.42, 0.38);
};

// ---- stalker: indigo wolf, low and toothy ---------------------------------
const wolf: Painter = (P) => {
  const { p, s, bounce } = P;
  const lift = -bounce * 0.1;
  ell(P, -1.6, -1.3 + lift, 0.65, 0.26, p.shade, p.dark, p.body, -0.5);
  const leg = (hx: number, sw: number): void => {
    limb(P, [hx, -0.8 + lift, hx + sw * 0.5, -0.12], 0.3, p.shade);
    dot(P, hx + sw * 0.5, -0.1, 0.26, 0.15, p.dark);
  };
  leg(-0.85, -s);
  leg(0.5, s);
  for (let i = 0; i < 5; i++) {
    const x = -0.95 + i * 0.36;
    flat(P, [x - 0.17, -1.5 + lift, x + 0.02, -2.05 + lift - (i % 2) * 0.12, x + 0.22, -1.5 + lift], p.light);
  }
  ell(P, -0.1, -1.05 + lift, 1.25, 0.66, p.body, p.shade, p.light, -0.06);
  leg(-0.4, s);
  leg(0.95, -s);
  // ears, head, open jaw
  poly(P, [0.7, -1.8 + lift, 0.5, -2.45 + lift, 1.0, -1.9 + lift]);
  poly(P, [1.0, -1.85 + lift, 0.98, -2.5 + lift, 1.3, -1.8 + lift]);
  poly(P, [1.3, -0.98 + lift, 2.1, -0.82 + lift, 1.3, -0.62 + lift], p.shade, p.dark, p.body);
  ell(P, 1.02, -1.35 + lift, 0.65, 0.58);
  poly(P, [1.45, -1.52 + lift, 2.25, -1.25 + lift, 2.2, -1.0 + lift, 1.4, -1.0 + lift]);
  flat(P, [1.85, -1.06 + lift, 2.02, -1.06 + lift, 1.95, -0.7 + lift], p.white);
  flat(P, [1.6, -1.06 + lift, 1.75, -1.06 + lift, 1.68, -0.78 + lift], p.white);
  dot(P, 2.25, -1.28 + lift, 0.13, 0.1, p.ink, false);
  eye(P, 0.92, -1.5 + lift, 0.2, { glow: p.glow, brow: 1, angry: 1 });
  eye(P, 1.34, -1.48 + lift, 0.18, { glow: p.glow, brow: -1, angry: 1 });
};

// ---- lobber: orchid hooded imp with a raised orb --------------------------
const imp: Painter = (P) => {
  const { p, s, bounce } = P;
  const lift = -bounce * 0.07;
  dot(P, -0.36 + s * 0.12, -0.1, 0.3, 0.17, p.dark);
  dot(P, 0.4 - s * 0.12, -0.1, 0.3, 0.17, p.dark);
  limb(P, [-0.6, -1.2 + lift, -0.95, -0.65], 0.26, p.shade);
  poly(P, [-0.9, -0.15, -0.65, -1.4 + lift, 0.65, -1.4 + lift, 0.95, -0.15, 0, -0.32]);
  flat(P, [-0.75, -0.45, 0.8, -0.45, 0.85, -0.25, -0.8, -0.25], p.accent);
  // raised arm and orb
  limb(P, [0.55, -1.25 + lift, 1.05, -2.1 + lift], 0.28, p.body);
  dot(P, 1.05, -2.15 + lift, 0.2, 0.2, p.body);
  orb(P, 1.15, -2.85 + lift - bounce * 0.1, 0.36);
  // hood with a floppy tip
  poly(P, [-0.85, -1.3 + lift, -0.9, -2.05 + lift, -0.5, -2.55 + lift, -1.3, -3.05 + lift + s * 0.05, 0.2, -2.7 + lift, 0.78, -2.05 + lift, 0.85, -1.3 + lift]);
  dot(P, 0.12, -1.9 + lift, 0.55, 0.5, p.dark);
  eye(P, -0.06, -1.9 + lift, 0.17, { glow: p.glow });
  eye(P, 0.34, -1.9 + lift, 0.17, { glow: p.glow });
  fangMouth(P, 0.14, -1.6 + lift, 0.2, 0.09);
};

// ---- seer: tall robed one-eyed sniper -------------------------------------
const seer: Painter = (P) => {
  const { p, s, k, bounce } = P;
  const lift = -0.45 - bounce * 0.1;
  // hem is a floating, waving skirt
  poly(P, [-1.0, -0.2 + lift + s * 0.08, -0.7, -1.9 + lift, 0.7, -1.9 + lift, 1.0, -0.2 + lift - s * 0.08, 0.5, -0.02 + lift + s * 0.1, 0, -0.32 + lift, -0.5, -0.02 + lift - s * 0.1]);
  flat(P, [-0.85, -0.55 + lift, 0.88, -0.55 + lift, 0.92, -0.32 + lift, -0.9, -0.32 + lift], p.accent);
  flat(P, [-0.5, -1.55 + lift, 0.5, -1.55 + lift, 0.4, -1.32 + lift, -0.4, -1.32 + lift], p.accent);
  // sleeves
  ell(P, -1.05, -1.35 + lift, 0.34, 0.55, p.body, p.shade, p.light, 0.25);
  ell(P, 1.05, -1.35 + lift, 0.34, 0.55, p.body, p.shade, p.light, -0.25);
  // orbiting orbs
  orb(P, 1.55 * k, -2.0 + lift + s * 0.35, 0.2);
  orb(P, -1.55 * k, -2.0 + lift - s * 0.35, 0.2);
  // tall hood
  poly(P, [-0.72, -2.35 + lift, 0, -3.75 + lift, 0.72, -2.35 + lift]);
  ell(P, 0, -2.2 + lift, 0.82, 0.86);
  dot(P, 0, -2.2 + lift, 0.58, 0.6, p.dark);
  eye(P, 0, -2.2 + lift, 0.42, { glow: p.glow });
  flat(P, [-0.5, -1.95 + lift, 0.5, -1.95 + lift, 0, -1.45 + lift], p.body, false);
};

// ---- tank: grey stone golem with lava runes -------------------------------
const golem: Painter = (P) => {
  const { p, s, bounce } = P;
  const lift = -bounce * 0.05;
  poly(P, [-0.98, -0.85, -0.12, -0.85, -0.1, -0.02 - Math.max(0, s) * 0.12, -0.92, -0.02 - Math.max(0, s) * 0.12]);
  poly(P, [0.12, -0.85, 0.98, -0.85, 0.94, -0.02 - Math.max(0, -s) * 0.12, 0.1, -0.02 - Math.max(0, -s) * 0.12]);
  limb(P, [-1.3, -2.1 + lift, -1.6, -1.0 + s * 0.1], 0.6, p.shade);
  ell(P, -1.62, -0.8 + s * 0.1, 0.52, 0.5);
  poly(P, [-1.25, -0.9 + lift, -1.42, -1.95 + lift, -0.95, -2.55 + lift, 0.95, -2.55 + lift, 1.42, -1.95 + lift, 1.25, -0.9 + lift]);
  // cracks and the chest rune
  line(P, [-0.75, -2.3 + lift, -0.5, -1.95 + lift, -0.78, -1.65 + lift, -0.55, -1.2 + lift], 0.08, p.accent);
  line(P, [0.8, -2.2 + lift, 0.55, -1.85 + lift, 0.85, -1.5 + lift], 0.08, p.accent);
  P.c.globalAlpha = 0.4;
  dot(P, 0, -1.72 + lift, 0.5, 0.56, p.accent, false);
  P.c.globalAlpha = 1;
  flat(P, [0, -2.05 + lift, 0.28, -1.7 + lift, 0, -1.35 + lift, -0.28, -1.7 + lift], p.accent);
  ell(P, -1.35, -2.25 + lift, 0.52, 0.44);
  ell(P, 1.35, -2.25 + lift, 0.52, 0.44);
  limb(P, [1.3, -2.0 + lift, 1.7, -1.0 - s * 0.1], 0.6, p.body);
  ell(P, 1.7, -0.78 - s * 0.1, 0.56, 0.54);
  // head: a chiselled slab with burning eyes
  poly(P, [-0.62, -2.4 + lift, -0.55, -3.15 + lift, 0.75, -3.15 + lift, 0.82, -2.4 + lift]);
  eye(P, -0.12, -2.8 + lift, 0.2, { glow: p.accent, brow: 1, angry: 1 });
  eye(P, 0.52, -2.8 + lift, 0.2, { glow: p.accent, brow: -1, angry: 1 });
  line(P, [-0.3, -2.55 + lift, 0.55, -2.55 + lift], LW * 1.2);
};

// ---- warden: the boss ------------------------------------------------------
const warden: Painter = (P) => {
  const { p, s, bounce, k } = P;
  const lift = -bounce * 0.05;
  const gold = p.accent;
  const gshade = p.accentShade;
  const glow = p.body === '#ffffff' ? '#ffffff' : '#ff3a5c';
  const c = P.c;
  c.save();
  c.scale(0.85, 0.85);
  // tattered cape behind everything
  poly(P, [-1.5, -0.1 + s * 0.1, -1.2, -3.2, 1.2, -3.2, 1.6, -0.05 - s * 0.1, 0.9, 0.12, 0.3, -0.25, -0.4, 0.12], p.shade, p.dark, p.body);
  // legs
  poly(P, [-0.9, -1.2, -0.2, -1.2, -0.15, 0 - Math.max(0, s) * 0.12, -1.0, 0 - Math.max(0, s) * 0.12], p.body, p.shade, p.light);
  poly(P, [0.2, -1.2, 0.95, -1.2, 1.0, 0 - Math.max(0, -s) * 0.12, 0.15, 0 - Math.max(0, -s) * 0.12], p.body, p.shade, p.light);
  flat(P, [-1.0, -0.3, -0.15, -0.3, -0.15, 0, -1.0, 0], gshade);
  flat(P, [0.15, -0.3, 1.0, -0.3, 1.0, 0, 0.15, 0], gshade);
  // back arm
  limb(P, [-1.4, -2.6 + lift, -1.85, -1.4 + s * 0.1], 0.65, p.shade);
  ell(P, -1.9, -1.2 + s * 0.1, 0.55, 0.55, p.body, p.shade, p.light);
  // torso plate
  poly(P, [-1.2, -1.05 + lift, -1.4, -2.55 + lift, -0.75, -3.2 + lift, 0.75, -3.2 + lift, 1.4, -2.55 + lift, 1.2, -1.05 + lift]);
  flat(P, [-1.15, -1.4 + lift, 1.15, -1.4 + lift, 1.1, -1.1 + lift, -1.1, -1.1 + lift], gold);
  flat(P, [-0.5, -1.4 + lift, -0.3, -2.7 + lift, 0.3, -2.7 + lift, 0.5, -1.4 + lift], p.shade, false);
  c.globalAlpha = 0.45;
  dot(P, 0, -2.15 + lift, 0.55, 0.6, glow, false);
  c.globalAlpha = 1;
  dot(P, 0, -2.15 + lift, 0.3, 0.36, glow);
  dot(P, 0, -2.15 + lift, 0.13, 0.16, '#ffffff', false);
  // pauldrons, with spikes
  for (const sg of [-1, 1]) {
    flat(P, [sg * 1.15, -3.0 + lift, sg * 1.3, -3.9 + lift, sg * 1.75, -3.0 + lift], gold);
    ell(P, sg * 1.45, -2.75 + lift, 0.62, 0.52, gold, gshade, '#fff2b0');
  }
  // front arm with a fist and a great mace
  limb(P, [1.4, -2.6 + lift, 1.95, -1.4 - s * 0.1], 0.65, p.body);
  limb(P, [2.05, -1.3 - s * 0.1, 2.3, -3.7], 0.24, p.dark);
  ell(P, 2.35, -3.95, 0.55, 0.55, gshade, p.dark, gold);
  flat(P, [2.25, -4.45, 2.35, -4.85, 2.5, -4.45], gold);
  flat(P, [2.8, -4.05, 3.2, -3.95, 2.8, -3.75], gold);
  ell(P, 2.0, -1.2 - s * 0.1, 0.55, 0.55, p.body, p.shade, p.light);
  // antlers (behind the head)
  for (const sg of [-1, 1]) {
    limb(P, [sg * 0.4, -4.1 + lift, sg * 0.75, -4.75 + lift, sg * 1.35, -5.15 + lift], 0.2, gold);
    limb(P, [sg * 0.75, -4.75 + lift, sg * 0.6, -5.45 + lift], 0.14, gold);
    limb(P, [sg * 1.05, -4.98 + lift, sg * 1.5, -5.6 + lift], 0.14, gold);
    limb(P, [sg * 1.35, -5.15 + lift, sg * 1.95, -5.05 + lift], 0.14, gold);
  }
  // head: horned helm, dark visor, burning eyes, jagged teeth
  ell(P, 0.05, -3.7 + lift, 0.8, 0.72);
  dot(P, 0.12, -3.62 + lift, 0.6, 0.44, p.dark);
  eye(P, -0.15 + k * 0.02, -3.68 + lift, 0.2, { glow, brow: 1, angry: 1 });
  eye(P, 0.42, -3.68 + lift, 0.2, { glow, brow: -1, angry: 1 });
  for (let i = 0; i < 4; i++) {
    const x = -0.25 + i * 0.22;
    flat(P, [x, -3.42 + lift, x + 0.18, -3.42 + lift, x + 0.09, -3.2 + lift], p.white, false);
  }
  flat(P, [-0.75, -4.05 + lift, 0.85, -4.05 + lift, 0.75, -3.88 + lift, -0.65, -3.88 + lift], gold);
  for (let i = -1; i <= 1; i++) flat(P, [i * 0.38 - 0.13, -4.05 + lift, i * 0.38, -4.4 + lift, i * 0.38 + 0.13, -4.05 + lift], gold);
  glint(P, -0.35, -3.98 + lift, 0.12);
  c.restore();
};

// ---- fallback monsters ------------------------------------------------------
const generic: Painter = (P) => {
  const { p, s, bounce } = P;
  const lift = -bounce * 0.08;
  dot(P, -0.4 + s * 0.15, -0.12, 0.32, 0.18, p.dark);
  dot(P, 0.42 - s * 0.15, -0.12, 0.32, 0.18, p.dark);
  flat(P, [-0.6, -1.7 + lift, -0.95, -2.45 + lift, -0.2, -1.95 + lift], p.accent);
  flat(P, [0.6, -1.7 + lift, 0.95, -2.45 + lift, 0.2, -1.95 + lift], p.accent);
  ell(P, 0, -1.0 + lift, 0.95, 0.9);
  eye(P, -0.32, -1.2 + lift, 0.3, { lx: 0.6, brow: 1, angry: 0.7 });
  eye(P, 0.36, -1.2 + lift, 0.3, { lx: 0.6, brow: -1, angry: 0.7 });
  fangMouth(P, 0.02, -0.65 + lift, 0.4, 0.2);
};

const genericRanged: Painter = (P) => {
  const { p, s, bounce } = P;
  const lift = -bounce * 0.08;
  dot(P, -0.4 + s * 0.15, -0.12, 0.32, 0.18, p.dark);
  dot(P, 0.42 - s * 0.15, -0.12, 0.32, 0.18, p.dark);
  poly(P, [-0.95, -0.2, -0.8, -1.7 + lift, 0, -2.25 + lift, 0.8, -1.7 + lift, 0.95, -0.2]);
  dot(P, 0.02, -1.35 + lift, 0.55, 0.5, p.dark);
  eye(P, -0.2, -1.35 + lift, 0.18, { glow: p.glow });
  eye(P, 0.24, -1.35 + lift, 0.18, { glow: p.glow });
  limb(P, [0.6, -1.2 + lift, 1.0, -2.0 + lift], 0.26, p.body);
  orb(P, 1.1, -2.7 + lift, 0.34);
};

export const PAINTERS: Readonly<Record<EnemyShape, Painter>> = {
  goblin: grunt, fox, bug, ogre, wolf, imp, seer, golem, warden, generic, genericRanged,
};

/** Sprite box per shape in sprite units: x0, x1, y0 (top, negative), y1 (below feet). */
export interface Box { readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number }
export const BOXES: Readonly<Record<EnemyShape, Box>> = {
  goblin: { x0: -2.3, x1: 2.3, y0: -2.85, y1: 0.3 },
  fox: { x0: -2.9, x1: 2.4, y0: -2.6, y1: 0.3 },
  bug: { x0: -1.7, x1: 1.7, y0: -2.4, y1: 0.3 },
  ogre: { x0: -2.0, x1: 2.9, y0: -3.2, y1: 0.4 },
  wolf: { x0: -2.5, x1: 2.6, y0: -2.7, y1: 0.3 },
  imp: { x0: -1.7, x1: 2.1, y0: -3.9, y1: 0.3 },
  seer: { x0: -2.1, x1: 2.1, y0: -4.4, y1: 0.3 },
  golem: { x0: -2.4, x1: 2.4, y0: -3.4, y1: 0.3 },
  warden: { x0: -3.0, x1: 3.2, y0: -5.4, y1: 0.4 },
  generic: { x0: -1.7, x1: 1.7, y0: -2.7, y1: 0.3 },
  genericRanged: { x0: -1.7, x1: 2.1, y0: -3.6, y1: 0.3 },
};
