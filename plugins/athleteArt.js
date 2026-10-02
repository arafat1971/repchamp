/**
 * The Reps widget's athlete: a realistic, adult-proportioned figure doing a
 * push-up, side view, facing left — a man or a woman. Path data in a W x H
 * box, in the part format the widget and app writers share:
 * { d, fill | stroke, width, opacity, gradient? } where `gradient` is a linear
 * gradient in box coordinates ({ x1, y1, x2, y2, stops }).
 *
 * Proportions follow an adult canon (head ≈ 1/8 of height, legs ≈ half): the
 * body is one anatomical silhouette built along the ankle-to-shoulder line —
 * at each station (ankle, calf, knee, thigh, glute, waist, ribs, chest,
 * shoulder) it has its own thickness on the back side and the floor side, so
 * calves, glutes, back and chest read as real forms. Arms are a two-bone
 * chain of fixed length, so the elbow bends naturally as the chest drops.
 *
 * Light: a key light from above, shading every form across its thickness —
 * highlight, base, core shadow, then a little light bounced up off the floor
 * — plus a thin rim light along the back, specular glints on the rounded
 * forms, muscle definition, and contact shadows where the body meets the
 * floor.
 *
 * `figure(sex, k)` poses one rep at depth `k` (0 arms locked out, 1 chest
 * down): the plank pivots at the ankles, the elbows fold back, the head stays
 * in line with the spine.
 */

const W = 112;
const H = 66;
const FLOOR = 60;
/** Shoulder x; the hands sit just ahead of it, the feet ~80 behind. */
const SX = 24;

/** Where the key light comes from (towards the light, unit vector). */
const LIGHT = [-0.34, -0.94];

function f(n) {
  return Math.round(n * 100) / 100;
}

function ellipse(cx, cy, rx, ry, rot = 0) {
  const c = Math.cos((rot * Math.PI) / 180);
  const s = Math.sin((rot * Math.PI) / 180);
  const x1 = cx + rx * c;
  const y1 = cy + rx * s;
  const x2 = cx - rx * c;
  const y2 = cy - rx * s;
  return `M${f(x1)},${f(y1)} A${f(rx)},${f(ry)} ${f(rot)} 1,1 ${f(x2)},${f(y2)} A${f(rx)},${f(ry)} ${f(rot)} 1,1 ${f(x1)},${f(y1)} Z`;
}

/** A smooth closed shape through points (quadratic curves via midpoints). */
function smooth(points) {
  const n = points.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M${f(mid(points[n - 1], points[0])[0])},${f(mid(points[n - 1], points[0])[1])} `;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const m = mid(p, points[(i + 1) % n]);
    d += `Q${f(p[0])},${f(p[1])} ${f(m[0])},${f(m[1])} `;
  }
  return `${d}Z`;
}

/** A smooth open line through points. */
function curve(points) {
  let d = `M${f(points[0][0])},${f(points[0][1])} `;
  for (let i = 1; i < points.length - 1; i++) {
    const m = [(points[i][0] + points[i + 1][0]) / 2, (points[i][1] + points[i + 1][1]) / 2];
    d += `Q${f(points[i][0])},${f(points[i][1])} ${f(m[0])},${f(m[1])} `;
  }
  const e = points[points.length - 1];
  return `${d}L${f(e[0])},${f(e[1])}`;
}

function rgb(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/**
 * Light across a form, from its lit edge (x1, y1) to its shadow edge
 * (x2, y2): highlight, base, core shadow, then floor bounce.
 */
function shade(x1, y1, x2, y2, c) {
  return {
    x1: f(x1),
    y1: f(y1),
    x2: f(x2),
    y2: f(y2),
    stops: [[0, c[0]], [0.38, c[1]], [0.8, c[2]], [1, mix(c[2], c[1], 0.5)]],
  };
}

/** A vertical light over a box: for shapes that are round (heads, hands). */
function lit(y1, y2, c) {
  return shade(0, y1, 0, y2, c);
}

const LOOK = {
  male: {
    skin: ['#F2C7A4', '#D59C76', '#9A6345'],
    hair: ['#4A3F42', '#1E191B', '#0A0809'],
    top: ['#45454F', '#1E1E24', '#09090B'],
    bottom: ['#E4D5B6', '#BFA983', '#86724F'],
    shoe: ['#FFFFFF', '#EEEEF2', '#B4B4BE'],
    accent: '#FF5A36',
    lip: '#B5715E',
  },
  female: {
    skin: ['#F8D2B8', '#E0A886', '#AE7354'],
    hair: ['#7A5040', '#3E2620', '#1A0F0D'],
    top: ['#E0D4FF', '#B49CFA', '#7559D2'],
    bottom: ['#454553', '#1B1B23', '#060608'],
    shoe: ['#FFFFFF', '#EEEEF2', '#B4B4BE'],
    accent: '#B49CFA',
    lip: '#C9707A',
  },
};

/*
 * The silhouette: [u, back, front] — u runs 0 (a point just past the ankle)
 * to 1 (shoulder) along the body line, with the ankle at 0.06, knee 0.36, hip
 * 0.65; back/front are thicknesses on the back side and the floor side.
 */
const BODY = {
  male: [
    [0.0, 1.6, 1.6],
    [0.06, 1.9, 1.8],
    [0.12, 2.6, 2.0],
    [0.22, 3.6, 2.5],
    [0.3, 2.8, 2.5],
    [0.36, 2.6, 2.8],
    [0.47, 3.4, 4.0],
    [0.58, 4.2, 4.6],
    [0.63, 5.1, 4.4],
    [0.72, 4.0, 4.2],
    [0.82, 4.4, 5.6],
    [0.92, 4.8, 6.2],
    [0.98, 4.6, 4.4],
    [1.0, 3.2, 3.2],
  ],
  female: [
    [0.0, 1.5, 1.5],
    [0.06, 1.8, 1.7],
    [0.12, 2.4, 1.9],
    [0.22, 3.3, 2.3],
    [0.3, 2.6, 2.3],
    [0.36, 2.4, 2.6],
    [0.47, 3.3, 3.9],
    [0.58, 4.4, 4.4],
    [0.63, 5.6, 4.2],
    [0.72, 3.5, 3.5],
    [0.82, 3.8, 4.6],
    [0.92, 4.2, 5.4],
    [0.98, 4.0, 3.8],
    [1.0, 2.8, 2.8],
  ],
};

function profileAt(profile, u) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [u0, a0, b0] = profile[i];
    const [u1, a1, b1] = profile[i + 1];
    if (u >= u0 && u <= u1) {
      const t = (u - u0) / (u1 - u0 || 1);
      const s = t * t * (3 - 2 * t);
      return [a0 + (a1 - a0) * s, b0 + (b1 - b0) * s];
    }
  }
  const last = profile[profile.length - 1];
  return [last[1], last[2]];
}

/** The elbow of a two-bone arm from shoulder S to wrist R, bending back (+x). */
function elbowOf(S, R, L1, L2) {
  const vx = R[0] - S[0];
  const vy = R[1] - S[1];
  const len = Math.hypot(vx, vy) || 1;
  const d = Math.min(len, L1 + L2 - 0.01);
  const ux = vx / len;
  const uy = vy / len;
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  let px = -uy;
  let py = ux;
  if (px < 0) {
    px = -px;
    py = -py;
  }
  return [S[0] + ux * a + px * h, S[1] + uy * a + py * h];
}

/** A limb from a to b with a muscle profile [[s, left, right]…], lit from the key light. */
function limb(a, b, prof, colors, gradient) {
  const lx = b[0] - a[0];
  const ly = b[1] - a[1];
  const l = Math.hypot(lx, ly) || 1;
  const px = -ly / l;
  const py = lx / l;
  const L = [];
  const R = [];
  let wmax = 0;
  for (const [s, wl, wr] of prof) {
    const cx = a[0] + lx * s;
    const cy = a[1] + ly * s;
    L.push([cx + px * wl, cy + py * wl]);
    R.push([cx - px * wr, cy - py * wr]);
    wmax = Math.max(wmax, wl, wr);
  }
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const toLight = px * LIGHT[0] + py * LIGHT[1] >= 0 ? 1 : -1;
  const sx = px * toLight;
  const sy = py * toLight;
  return {
    d: smooth([...L, ...R.reverse()]),
    fill: 'none',
    gradient: gradient ?? shade(m[0] + sx * wmax, m[1] + sy * wmax, m[0] - sx * wmax, m[1] - sy * wmax, colors),
  };
}

/** One light across a whole arm (shoulder to wrist), so the elbow has no seam. */
function armLight(a, b, w, colors) {
  const lx = b[0] - a[0];
  const ly = b[1] - a[1];
  const l = Math.hypot(lx, ly) || 1;
  let px = -ly / l;
  let py = lx / l;
  if (px * LIGHT[0] + py * LIGHT[1] < 0) {
    px = -px;
    py = -py;
  }
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return shade(m[0] + px * w, m[1] + py * w, m[0] - px * w, m[1] - py * w, colors);
}

/** A ribbon along a polyline with a width at each point (hair, straps). */
function ribbon(pts, ws) {
  const L = [];
  const R = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l;
    const ny = (b[0] - a[0]) / l;
    L.push([p[0] + nx * ws[i], p[1] + ny * ws[i]]);
    R.push([p[0] - nx * ws[i], p[1] - ny * ws[i]]);
  });
  return smooth([...L, ...R.reverse()]);
}

const UPPER_ARM = [[0, 4.0, 4.3], [0.2, 3.5, 4.1], [0.45, 3.3, 3.5], [0.75, 2.7, 2.9], [1, 2.5, 2.6]];
const FOREARM = [[0, 2.5, 2.6], [0.22, 2.8, 2.6], [0.55, 2.2, 2.0], [0.9, 1.5, 1.5], [1, 1.4, 1.4]];
const L_UPPER = 18.4;
const L_FORE = 15.6;

function figure(sex = 'male', k = 0) {
  const female = sex === 'female';
  const p = LOOK[female ? 'female' : 'male'];
  const profile = BODY[female ? 'female' : 'male'];
  const t = Math.max(0, Math.min(1, k));
  const parts = [];
  const add = (part) => parts.push(part);
  const line = (pts, stroke, width, opacity) => add({ d: curve(pts), stroke, width, opacity });

  // The foot stays planted on the ball, heel up; the body pivots at the ankle.
  const ball = [SX + 80, FLOOR];
  const ankle = [ball[0] - 0.6, FLOOR - 8.6];
  const shoulder = [SX, FLOOR - 37 + t * 22];
  // The body line runs from a virtual point just past the ankle (u = 0).
  const toe = [ankle[0] + (ankle[0] - shoulder[0]) * (0.06 / 0.94), ankle[1] + (ankle[1] - shoulder[1]) * (0.06 / 0.94)];
  const dx = shoulder[0] - toe[0];
  const dy = shoulder[1] - toe[1];
  const len = Math.hypot(dx, dy);
  const ax = dx / len;
  const ay = dy / len;
  // "Up" — the back — is the normal pointing away from the floor.
  const nx = -ay;
  const ny = ax;
  const at = (u, off = 0) => [toe[0] + dx * u + nx * off, toe[1] + dy * u + ny * off];
  const slope = (Math.atan2(dy, dx) * 180) / Math.PI + 180;

  /** The silhouette between u0 and u1, inflated by `grow` (clothing), shifted by `off`. */
  const span = (u0, u1, grow = 0, sag = 0, off = [0, 0]) => {
    const top = [];
    const bot = [];
    const steps = Math.max(4, Math.round((u1 - u0) * 34));
    for (let i = 0; i <= steps; i++) {
      const u = u0 + ((u1 - u0) * i) / steps;
      const [a, b] = profileAt(profile, u);
      const hang = sag * Math.sin(((u - u0) / (u1 - u0 || 1)) * Math.PI);
      const q = at(u, a + grow);
      const r = at(u, -(b + grow + hang));
      top.push([q[0] + off[0], q[1] + off[1]]);
      bot.push([r[0] + off[0], r[1] + off[1]]);
    }
    return smooth([...top, ...bot.reverse()]);
  };
  /** A span shaded across its thickness (its typical thickness; thicker parts clamp). */
  const lit3d = (u0, u1, grow, sag, colors, off = [0, 0]) => {
    let A = 0;
    let B = 0;
    for (let i = 0; i <= 8; i++) {
      const [a, b] = profileAt(profile, u0 + ((u1 - u0) * i) / 8);
      A += a / 9;
      B += b / 9;
    }
    const um = (u0 + u1) / 2;
    const q = at(um, A + grow + 0.4);
    const r = at(um, -(B + grow + sag * 0.6));
    return { d: span(u0, u1, grow, sag, off), fill: 'none', gradient: shade(q[0] + off[0], q[1] + off[1], r[0] + off[0], r[1] + off[1], colors) };
  };
  /** A rim of light along the back between u0 and u1. */
  const rim = (u0, u1, grow, color, opacity, width = 0.5) => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const u = u0 + ((u1 - u0) * i) / 10;
      pts.push(at(u, profileAt(profile, u)[0] + grow - 0.35));
    }
    line(pts, color, width, opacity);
  };
  /** A point on the body at u, a fraction `side` of the way to the back (+1) or front (−1) edge. */
  const on = (u, side, grow = 0) => {
    const [a, b] = profileAt(profile, u);
    return at(u, side >= 0 ? side * (a + grow) : side * (b + grow));
  };

  // ── The floor: a long soft shadow, a darker pool under the chest as it drops,
  // and contact patches under hands and feet.
  add({ d: ellipse(SX + 38, FLOOR + 2, 50, 3.4), fill: '#0B1020', opacity: 0.16 });
  add({ d: ellipse(SX + 10, FLOOR + 1, 16 - t * 3, 2 - t * 0.4), fill: '#0B1020', opacity: 0.06 + t * 0.2 });
  add({ d: ellipse(ball[0] - 1, FLOOR + 0.5, 6.5, 1.3), fill: '#0B1020', opacity: 0.4 });
  add({ d: ellipse(SX - 5, FLOOR + 0.5, 6.5, 1.2), fill: '#0B1020', opacity: 0.4 });

  // ── Arm geometry, shared by both arms.
  const shoulderJoint = at(0.975, -1.6);
  const wrist = [SX - 1.2, FLOOR - 2.5];
  // As the chest drops the elbows flare back ~45°, so seen from the side the
  // upper arm foreshortens: the elbow stays up behind the shoulder, not on the floor.
  const elbow = elbowOf(shoulderJoint, wrist, L_UPPER * (1 - 0.45 * t), L_FORE * (1 - 0.1 * t));
  // Each bone runs a little past the elbow, so the joint reads as one arm.
  const elbowOut = [elbow[0] + (elbow[0] - shoulderJoint[0]) * 0.07, elbow[1] + (elbow[1] - shoulderJoint[1]) * 0.07];
  const elbowIn = [elbow[0] + (elbow[0] - wrist[0]) * 0.1, elbow[1] + (elbow[1] - wrist[1]) * 0.1];

  // ── Head frame: in line with the spine, face tipped a little forward.
  const th = (18 * Math.PI) / 180;
  const fdir = [-nx * Math.cos(th) + ax * Math.sin(th), -ny * Math.cos(th) + ay * Math.sin(th)];
  const udir = [ax * Math.cos(th) + nx * Math.sin(th), ay * Math.cos(th) + ny * Math.sin(th)];
  const neckBase = at(0.995, 0.6);
  const hc = [neckBase[0] + udir[0] * 7.6 - fdir[0] * 0.9, neckBase[1] + udir[1] * 7.6 - fdir[1] * 0.9];
  const hp = (fv, uv) => [hc[0] + fdir[0] * fv + udir[0] * uv, hc[1] + fdir[1] * fv + udir[1] * uv];
  const hpts = (list) => list.map(([a, b]) => hp(a, b));

  // ── Far side, in shadow behind the body: leg, shoe, arm, hand.
  const far = [1.8, -0.55];
  const farOf = (q) => [q[0] + far[0], q[1] + far[1]];
  const dim = (c) => [mix(c[0], c[2], 0.55), mix(c[1], c[2], 0.6), mix(c[2], '#000000', 0.35)];
  const farLeg = [1.6, -0.3];
  if (female) {
    add(lit3d(0.03, 0.5, 0, 0, dim(p.skin), farLeg));
    add(lit3d(0.48, 0.66, 0.35, 0, dim(p.bottom), farLeg));
  } else {
    add(lit3d(0.04, 0.66, 0.8, 0, dim(p.bottom), farLeg));
  }
  shoe([ball[0] + 2.2, ball[1]], dim(p.shoe), p, true);
  const farArm = armLight(farOf(shoulderJoint), farOf(wrist), 4, dim(p.skin));
  add(limb(farOf(elbowIn), farOf(wrist), FOREARM, null, farArm));
  add(limb(farOf(shoulderJoint), farOf(elbowOut), UPPER_ARM, null, farArm));
  hand(farOf(wrist), dim(p.skin), true);

  // ── Neck, behind the head.
  add(limb(at(0.97, 0.2), hp(-0.8, -3.4), [[0, 3.0, 3.0], [0.5, 2.5, 2.5], [1, 2.4, 2.4]], p.skin));

  // ── The body: skin first, then clothing over it.
  if (female) {
    add(lit3d(0.03, 0.7, 0, 0, p.skin));
    add(lit3d(0.62, 1.0, 0, 0, p.skin));
    // Legs: calf heads, the kneecap, the hamstring, a glint along the shin.
    line([on(0.12, 0.45), on(0.18, 0.95), on(0.27, 0.55)], p.skin[2], 0.4, 0.45);
    line([on(0.33, -0.7), on(0.36, -1.05), on(0.395, -0.75)], p.skin[2], 0.4, 0.5);
    line([on(0.4, 0.3), on(0.44, 0.75)], p.skin[2], 0.35, 0.35);
    add({ d: ellipse(...on(0.2, 0.7), 3.2, 0.7, slope), fill: '#FFFFFF', opacity: 0.22 });
    line([on(0.1, -0.55), on(0.2, -0.6), on(0.3, -0.55)], '#FFFFFF', 0.4, 0.18);
    rim(0.03, 0.48, 0, '#FFF1E4', 0.5);
    // Biker shorts: hugging, a stitched seam down the thigh, a waistband.
    add(lit3d(0.48, 0.735, 0.35, 0, p.bottom));
    rim(0.48, 0.735, 0.35, '#8A8AA0', 0.55);
    line([on(0.49, 0.05, 0.35), on(0.6, 0.1, 0.35), on(0.72, 0.0, 0.35)], '#3A3A48', 0.3, 0.9);
    add({ d: ellipse(...on(0.635, 0.55, 0.35), 3.8, 1.0, slope), fill: '#FFFFFF', opacity: 0.1 });
    add({ d: curve([on(0.725, 1, 0.45), on(0.73, 0, 0.45), on(0.725, -1, 0.45)]), stroke: '#2C2C38', width: 1.3 });
    // Bare midriff: the waist's soft core shadow.
    line([on(0.75, -0.7), on(0.78, -0.85)], p.skin[2], 0.5, 0.35);
    // Crop tank, a hem of light along the top.
    add(lit3d(0.795, 1.0, 0.45, 0, p.top));
    rim(0.8, 0.99, 0.45, '#F4EEFF', 0.75, 0.55);
    line([on(0.8, 1, 0.45), on(0.8, 0, 0.45), on(0.805, -1, 0.45)], '#6A50C4', 0.45, 0.6);
    line([on(0.86, -0.3, 0.45), on(0.9, -0.75, 0.45)], '#6A50C4', 0.35, 0.4);
  } else {
    // Cargo joggers: loose, cuffed at the ankle, a side pocket and fold lines.
    add(lit3d(0.04, 0.745, 0.8, 0, p.bottom));
    rim(0.06, 0.74, 0.8, '#FFF8EA', 0.55);
    add({ d: curve([on(0.065, 1, 0.8), on(0.065, -1, 0.8)]), stroke: '#8E7A58', width: 1.8 });
    line([on(0.075, 1, 0.8), on(0.075, -1, 0.8)], '#A8936E', 0.3, 0.8);
    const pk = on(0.56, 0.05, 0.8);
    add({ d: ellipse(pk[0], pk[1], 4.4, 2.6, slope), fill: 'none', gradient: lit(pk[1] - 2.6, pk[1] + 2.6, [p.bottom[1], mix(p.bottom[1], p.bottom[2], 0.3), p.bottom[2]]) });
    line([[pk[0] - 4.2, pk[1] - 1.6 + (slope > 0 ? 0.6 : 0)], [pk[0] + 4.2, pk[1] - 1.0]], '#7E6A48', 0.5, 0.9);
    // Fabric folds bunching behind the knee and at the hip.
    for (const [u, du] of [[0.33, 0.035], [0.385, 0.02], [0.6, 0.03]]) {
      line([on(u, 0.7, 0.8), [on(u + du / 2, 0, 0.8)[0] + 0.8, on(u + du / 2, 0, 0.8)[1]], on(u + du, -0.75, 0.8)], '#9A845E', 0.45, 0.75);
      line([on(u + 0.008, 0.6, 0.8), on(u + du / 2 + 0.008, 0, 0.8)], '#F2E6CC', 0.3, 0.5);
    }
    // Side seam, catching the light.
    line([on(0.08, 0.15, 0.8), on(0.35, 0.1, 0.8), on(0.6, 0.15, 0.8), on(0.74, 0.1, 0.8)], '#D8C8A4', 0.3, 0.7);
    // Oversized tee: loose, hanging off the chest under gravity.
    add(lit3d(0.68, 1.0, 1.2, 2.8, p.top));
    rim(0.69, 0.99, 1.2, '#8C8C9C', 0.6, 0.55);
    const hang = (u) => 1.2 + 2.8 * Math.sin(((u - 0.68) / 0.32) * Math.PI) * 0.9;
    for (const u of [0.76, 0.84, 0.9]) {
      line([on(u, 0.1, 1.2), [on(u + 0.012, -0.5, 1.2)[0] - 0.6, on(u + 0.012, -0.5, 1.2)[1]], on(u + 0.03, -1, hang(u + 0.03))], '#000000', 0.5, 0.55);
      line([on(u + 0.012, 0.0, 1.2), on(u + 0.03, -0.7, hang(u + 0.03))], '#5A5A66', 0.3, 0.45);
    }
    line([on(0.69, 1, 1.2), on(0.69, 0, 1.2), on(0.69, -0.95, 1.2)], '#2E2E36', 0.5, 0.8);
    // A chain swinging down from the neck.
    const c0 = on(0.965, -0.4, 1.2);
    line([c0, [c0[0] + 1.6, c0[1] + 5 + t], [c0[0] + 4.8, c0[1] + 1]], '#D6DCE6', 0.6, 1);
    add({ d: ellipse(c0[0] + 1.9, c0[1] + 4.2 + t * 0.8, 0.7, 0.9), fill: '#EEF1F6' });
  }

  // ── Ambient occlusion where the arm meets the torso.
  add({ d: ellipse(...at(0.95, -2.8), 3.2, 2.4, slope), fill: '#000000', opacity: 0.12 });

  // ── Shoe.
  shoe(ball, p.shoe, p, false);

  // ── Near arm: upper arm, forearm, hand, then the deltoid cap over the joint.
  const arm = armLight(shoulderJoint, wrist, 4, p.skin);
  add(limb(elbowIn, wrist, FOREARM, null, arm));
  add(limb(shoulderJoint, elbowOut, UPPER_ARM, null, arm));
  hand(wrist, p.skin, false);
  {
    // Triceps horseshoe, the deltoid's edge, the forearm's ridge, a vein.
    const along = (a, b, s, side) => {
      const lx = b[0] - a[0];
      const ly = b[1] - a[1];
      const l = Math.hypot(lx, ly) || 1;
      return [a[0] + lx * s + (-ly / l) * side, a[1] + ly * s + (lx / l) * side];
    };
    line([along(shoulderJoint, elbow, 0.28, -2.6), along(shoulderJoint, elbow, 0.5, -1.4), along(shoulderJoint, elbow, 0.78, -1.6)], p.skin[2], 0.35, 0.3);
    line([along(elbow, wrist, 0.08, 1.6), along(elbow, wrist, 0.35, 0.7), along(elbow, wrist, 0.75, 0.2)], p.skin[2], 0.3, 0.25);
  }
  const delt = [shoulderJoint[0] + 0.4, shoulderJoint[1] + 0.6];
  // The deltoid caps the shoulder, shaded with the arm it belongs to.
  add({ d: ellipse(delt[0], delt[1], female ? 3.7 : 4.3, female ? 3.4 : 3.8, slope), fill: 'none', gradient: arm });
  add({ d: ellipse(delt[0] - 0.4, delt[1] - 1.9, 1.5, 0.6, slope), fill: '#FFFFFF', opacity: 0.12 });
  line([[delt[0] + 3.8, delt[1] + 0.4], [delt[0] + 2.6, delt[1] + 3.6], [delt[0] - 0.2, delt[1] + 4.2]], p.skin[2], 0.4, 0.4);
  if (!female) {
    // Sleeve over the deltoid, a hem with a fold, light along the top.
    const sl0 = [shoulderJoint[0] + 1.2, shoulderJoint[1] - 2.2];
    const lx = elbowOut[0] - shoulderJoint[0];
    const ly = elbowOut[1] - shoulderJoint[1];
    const sl1 = [shoulderJoint[0] + lx * 0.44, shoulderJoint[1] + ly * 0.44];
    add(limb(sl0, sl1, [[0, 4.6, 5.4], [0.35, 5.0, 5.6], [0.8, 4.8, 5.2], [1, 4.6, 5.0]], p.top));
    const l = Math.hypot(lx, ly) || 1;
    const hem = (side) => [sl1[0] - (ly / l) * side - (lx / l) * 0.6, sl1[1] + (lx / l) * side - (ly / l) * 0.6];
    line([hem(-3.6), [sl1[0] + (lx / l) * 0.2, sl1[1] + (ly / l) * 0.2], hem(3.8)], '#000000', 0.5, 0.6);
    line([[sl0[0] + lx * 0.3 + 1.6, sl0[1] + ly * 0.3], [sl0[0] + lx * 0.6 + 2.6, sl0[1] + ly * 0.6]], '#000000', 0.4, 0.5);
  }

  // ── Head.
  head();

  return parts;

  /** A sneaker on the ball of the foot, heel up, toes bent along the floor. */
  function shoe(b, colors, look, isFar) {
    const s = (x, y) => [b[0] + x, b[1] + y];
    const outline = [
      s(-4.9, -0.2),
      s(-5.3, -1.3),
      s(-4.0, -2.7),
      s(-2.6, -4.4),
      s(-2.4, -7.4),
      s(-2.9, -10.2),
      s(-1.6, -10.8),
      s(0.4, -9.8),
      s(2.4, -11.4),
      s(4.0, -10.6),
      s(4.6, -8.0),
      s(3.0, -3.6),
      s(1.6, -0.2),
    ];
    add({ d: smooth(outline), fill: 'none', gradient: shade(b[0] - 5, b[1] - 6, b[0] + 4, b[1] - 3, colors) });
    // Midsole along the back and under the toes, an outsole line.
    add({ d: smooth([s(4.5, -9.6), s(4.9, -8.0), s(3.4, -3.4), s(1.9, 0.1), s(-4.6, 0.2), s(-4.2, -0.9), s(1.0, -1.2), s(2.4, -3.8), s(3.6, -8.2)]), fill: isFar ? colors[1] : '#F7F7F9' });
    line([s(4.7, -8.6), s(3.3, -3.6), s(1.9, -0.3), s(-4.4, -0.1)], isFar ? colors[2] : '#A6A6B2', 0.45, 0.9);
    if (isFar) return;
    // Laces up the front, the brand stripe, a heel tab, a crease at the toe box.
    for (let i = 0; i < 3; i++) {
      line([s(-2.9 + i * 0.1, -5.0 - i * 1.5), s(-1.6 + i * 0.1, -5.3 - i * 1.5)], '#C8C8D2', 0.5, 1);
    }
    line([s(-3.8, -1.6), s(-0.6, -3.0), s(2.4, -7.6)], look.accent, 0.75, 1);
    add({ d: ellipse(...s(3.4, -10.6), 1.0, 0.7, 30), fill: look.accent });
    line([s(-3.7, -2.8), s(-2.9, -2.1)], '#B4B4BE', 0.35, 0.8);
    add({ d: ellipse(...s(-3.6, -2.9), 1.2, 0.5, -40), fill: '#FFFFFF', opacity: 0.9 });
  }

  /** A hand flat on the floor, fingers pointing forward. */
  function hand(w, colors, isFar) {
    const x = w[0];
    const F = FLOOR;
    add({
      d: smooth([
        [x + 1.6, F - 2.4],
        [x - 0.8, F - 3.1],
        [x - 4.8, F - 2.6],
        [x - 7.4, F - 1.5],
        [x - 9.5, F - 0.6],
        [x - 9.2, F + 0.1],
        [x - 2.0, F + 0.1],
        [x + 2.1, F - 0.2],
      ]),
      fill: 'none',
      gradient: lit(F - 3.1, F + 0.2, colors),
    });
    if (isFar) return;
    line([[x - 5.4, F - 1.8], [x - 7.4, F - 0.9], [x - 8.9, F - 0.3]], colors[2], 0.3, 0.55);
    line([[x - 5.0, F - 0.9], [x - 6.8, F - 0.3], [x - 8.2, F]], colors[2], 0.3, 0.45);
    line([[x + 1.4, F - 2.2], [x + 0.8, F - 1.2]], colors[2], 0.3, 0.4);
  }

  /** Her ponytail: a short lift off the tie, then it falls past the neck. */
  function ponytail() {
    const base = hp(-4.0, 4.0);
    const back = [-fdir[0] * 0.8 - udir[0] * 0.2, -fdir[1] * 0.8 - udir[1] * 0.2];
    const sway = t * 1.4;
    // Gravity takes it straight away: a short lift off the tie, then it falls.
    const tail = [
      base,
      [base[0] + back[0] * 2.6, base[1] + back[1] * 2.6 + 0.6],
      [base[0] + back[0] * 3.6 + 0.4, base[1] + back[1] * 3.6 + 4.2],
      [base[0] + back[0] * 3.4 + 0.2 + sway, base[1] + back[1] * 3.4 + 8.0],
      [base[0] + back[0] * 2.8 - 0.2 + sway, base[1] + back[1] * 2.8 + 10.8],
    ];
    add({ d: ribbon(tail, [1.5, 2.1, 2.0, 1.4, 0.3]), fill: 'none', gradient: shade(tail[1][0] - 2, tail[0][1] - 2, tail[1][0] + 3, tail[4][1], p.hair) });
    for (const o of [-0.7, 0.1, 0.8]) {
      line(tail.slice(0, 4).map(([x, y], i) => [x + o * (1 - i / 5), y]), p.hair[0], 0.28, 0.5);
    }
  }

  function head() {
    // Skull and face profile: crown, forehead, brow, nose, lips, chin, jaw.
    const face = hpts([
      [-1.4, 6.3],
      [2.6, 5.9],
      [4.6, 3.8],
      [5.0, 2.0],
      [4.4, 1.0],
      [6.9, -0.7],
      [4.8, -1.7],
      [5.1, -2.3],
      [4.6, -2.9],
      [5.0, -3.6],
      [4.3, -4.5],
      [5.2, -5.7],
      [3.4, -6.5],
      [0.4, -4.8],
      [-1.4, -3.4],
      [-3.6, -1.0],
      [-4.3, 2.4],
      [-3.5, 5.0],
    ]);
    const ys = face.map((q) => q[1]);
    add({ d: smooth(face), fill: 'none', gradient: lit(Math.min(...ys), Math.max(...ys), p.skin) });
    // The face turned from the light: a soft shadow over the front, a lit cheekbone.
    add({ d: smooth(hpts([[2.4, 2.4], [4.6, 1.4], [5.2, -1.2], [4.4, -5.2], [2.6, -5.6], [1.8, -2.4]])), fill: p.skin[2], opacity: 0.12 });
    add({ d: ellipse(...hp(3.3, -0.9), 1.1, 0.55, 0), fill: '#FFFFFF', opacity: 0.16 });
    // Jaw line and the shadow it casts on the neck.
    line(hpts([[4.4, -5.8], [2.2, -5.9], [0.4, -4.6]]), p.skin[2], 0.4, 0.5);
    // Ear: outer rim, inner fold.
    add({ d: smooth(hpts([[-0.3, 1.9], [0.6, 0.6], [0.3, -1.6], [-0.9, -1.7], [-1.6, 0.2], [-1.2, 1.9]])), fill: 'none', gradient: lit(hp(0, 2)[1] - 1, hp(0, -1.7)[1] + 1, [p.skin[1], p.skin[1], p.skin[2]]) });
    line(hpts([[-0.4, 1.2], [0.0, 0.2], [-0.3, -0.9]]), p.skin[2], 0.3, 0.7);
    // Eye: an upper lid with lashes, the iris looking at the floor ahead, a glint.
    add({ d: smooth(hpts([[3.2, 1.0], [3.8, 1.35], [4.4, 0.85], [3.9, 0.55]])), fill: '#F4ECE6' });
    add({ d: ellipse(...hp(3.95, 0.85), 0.36, 0.36), fill: '#2A1A14' });
    add({ d: ellipse(...hp(4.05, 0.98), 0.12, 0.12), fill: '#FFFFFF', opacity: 0.9 });
    line(hpts([[3.0, 1.15], [3.8, 1.5], [4.5, 0.95]]), '#1A100C', female ? 0.5 : 0.4, 1);
    if (female) line(hpts([[4.3, 1.05], [4.75, 1.35]]), '#1A100C', 0.3, 0.9);
    line(hpts([[3.4, 0.5], [4.0, 0.42]]), p.skin[2], 0.25, 0.5);
    // Brow.
    line(hpts([[2.8, 2.1], [3.8, 2.45], [4.7, 2.15]]), p.hair[1], female ? 0.4 : 0.6, 0.95);
    // Nostril, lips, mouth line.
    line(hpts([[4.9, -1.0], [5.3, -1.25]]), p.skin[2], 0.3, 0.8);
    add({ d: smooth(hpts([[4.4, -2.2], [5.1, -2.4], [4.8, -2.9], [5.0, -3.5], [4.4, -3.4]])), fill: p.lip, opacity: female ? 0.85 : 0.45 });
    line(hpts([[4.0, -2.95], [4.85, -2.9]]), '#6E3A30', 0.3, 0.8);
    if (!female) {
      // Stubble along the jaw.
      add({ d: smooth(hpts([[4.6, -2.0], [4.9, -4.6], [3.4, -6.1], [0.6, -4.8], [1.6, -3.4], [3.6, -3.0]])), fill: p.hair[1], opacity: 0.14 });
    }

    if (female) {
      // Sleek pulled-back hair, a soft hairline, strands combed to the tie.
      const capPts = hpts([
        [4.1, 3.6],
        [4.0, 5.6],
        [2.0, 7.0],
        [-1.6, 7.0],
        [-4.3, 5.2],
        [-5.0, 2.2],
        [-4.2, -1.6],
        [-2.6, -0.6],
        [-1.8, 1.4],
        [0.4, 2.6],
        [2.4, 2.6],
        [3.4, 3.2],
      ]);
      const cy = capPts.map((q) => q[1]);
      add({ d: smooth(capPts), fill: 'none', gradient: lit(Math.min(...cy), Math.max(...cy), p.hair) });
      for (const [a, b, c] of [[[3.6, 4.4], [1.0, 6.3], [-3.2, 5.6]], [[3.0, 3.4], [0.0, 5.0], [-3.4, 5.0]], [[1.6, 2.8], [-1.0, 3.6], [-3.6, 4.6]]]) {
        line(hpts([a, b, c]), p.hair[0], 0.28, 0.6);
      }
      line(hpts([[0.8, 6.6], [-2.2, 6.4]]), '#C8957C', 0.4, 0.5);
      ponytail();
      // Scrunchie, and a gold hoop.
      const tie = hp(-4.0, 4.0);
      add({ d: ellipse(tie[0], tie[1], 1.5, 1.2, slope + 30), fill: '#F27AA7' });
      add({ d: ellipse(tie[0] - 0.4, tie[1] - 0.4, 0.6, 0.35, slope), fill: '#FFC2D8', opacity: 0.9 });
      const hoop = hp(-0.4, -2.6);
      add({ d: ellipse(hoop[0], hoop[1], 0.8, 1.05), stroke: '#E8B84A', width: 0.4 });
    } else {
      // A low fade at the sides, under textured curls on top.
      add({ d: smooth(hpts([[-3.9, 5.6], [-4.6, 2.4], [-3.9, -1.2], [-2.2, -1.2], [-1.6, 1.4], [0.6, 2.6], [3.2, 3.0], [4.4, 4.0], [2.8, 5.6], [-1.0, 6.4]])), fill: 'none', gradient: lit(hp(-1, 6.4)[1] - 1, hp(-3.9, -1.2)[1], [p.hair[1], mix(p.hair[1], p.skin[1], 0.35), mix(p.hair[1], p.skin[1], 0.6)]) });
      const top = hpts([
        [3.9, 3.9],
        [5.0, 5.8],
        [3.8, 8.0],
        [0.4, 9.0],
        [-3.0, 8.4],
        [-4.8, 6.2],
        [-4.2, 4.4],
        [-2.0, 5.2],
        [1.0, 5.0],
        [3.0, 3.8],
      ]);
      const ty = top.map((q) => q[1]);
      add({ d: smooth(top), fill: 'none', gradient: lit(Math.min(...ty), Math.max(...ty), p.hair) });
      // Curl texture: little coils catching light, darker hollows between.
      const coils = [[3.4, 6.2], [1.6, 7.3], [-0.6, 7.6], [-2.6, 7.0], [-3.8, 5.4], [2.4, 5.2], [0.4, 6.2], [-1.6, 6.0], [-3.0, 4.8], [1.2, 4.8], [4.0, 4.8]];
      coils.forEach(([a, b], i) => {
        const r = 0.35 + (i % 3) * 0.08;
        const q = hp(a, b);
        add({ d: ellipse(q[0], q[1], r, r * 0.8, i * 37), fill: p.hair[0], opacity: 0.45 });
        add({ d: ellipse(q[0] + 0.35, q[1] + 0.35, r * 0.6, r * 0.5, i * 37), fill: p.hair[2], opacity: 0.7 });
      });
      line(hpts([[1.4, 8.3], [-1.6, 8.3]]), '#8A7C80', 0.4, 0.45);
    }
  }
}

module.exports = { W, H, figure };
