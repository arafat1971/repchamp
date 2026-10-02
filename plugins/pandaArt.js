/**
 * The hydration panda, as vector art — one drawing for the app and the widget.
 *
 * A fluffy panda sitting soles-forward, hugging a big water bottle. The bottle
 * holds what is left of today's water: it starts the day full and the panda
 * drinks it down, so the picture always means what it shows.
 *
 * Two outfits share one body: `classic`, and `hoodie` (a blue hoodie,
 * and sparkly eyes). Every shape is plain SVG path data —
 * arcs carry their own rotation — so react-native-svg (app) and VectorDrawable
 * (widget) both take it as is.
 *
 * The bottle is posed by `{ cx, cy, angle }`; its water always stays level
 * with the ground however the bottle tilts, and the arms reach from the
 * shoulders to grips on the bottle, so any pose — resting, lifted to the
 * mouth for a sip — draws correctly.
 *
 * Coordinates: a 200 x 260 box; the panda fills y 30..260 (designer y + DY)
 * and the band above is room for sparkles to float up.
 */

const W = 200;
const H = 260;
const DY = 30;

function f(n) {
  'worklet';
  return Math.round(n * 100) / 100;
}
function rad(deg) {
  'worklet';
  return (deg * Math.PI) / 180;
}

/** A tiny deterministic random, so fur tufts look organic but never change. */
function rnd(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** A (rotated) ellipse as two arcs, in designer coordinates. */
function ellipse(cx, cy, rx, ry, rot = 0) {
  const c = Math.cos(rad(rot));
  const s = Math.sin(rad(rot));
  const x1 = cx + rx * c;
  const y1 = cy + DY + rx * s;
  const x2 = cx - rx * c;
  const y2 = cy + DY - rx * s;
  return `M${f(x1)},${f(y1)} A${f(rx)},${f(ry)} ${f(rot)} 1,1 ${f(x2)},${f(y2)} A${f(rx)},${f(ry)} ${f(rot)} 1,1 ${f(x1)},${f(y1)} Z`;
}

/**
 * Shift the "x,y" points of a designer path under the headroom. Arcs are
 * written with `arc()` instead: their radii and flags are pairs too, and must
 * not move.
 */
function pts(d) {
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${f(+x)},${f(+y + DY)}`);
}
/** An arc segment to (x, y) in designer coordinates. */
function arc(rx, ry, large, sweep, x, y) {
  return `A${f(rx)},${f(ry)} 0 ${large},${sweep} ${f(x)},${f(y + DY)}`;
}
const at = (x, y) => `${f(x)},${f(y + DY)}`;

/**
 * Fur: small pointed tufts around an ellipse's edge, between two angles
 * (degrees, 0 = right, 90 = down). Drawn in the fur's edge colour behind the
 * shape, they break its outline into fluff.
 */
function tufts(cx, cy, rx, ry, from, to, count, len, seed) {
  let d = '';
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const a = rad(from + (to - from) * t);
    const w = (rad(to - from) / count) * 0.62;
    const l = len * (0.55 + 0.6 * rnd(seed + i));
    const p = (ang, k) => [cx + Math.cos(ang) * rx * k, cy + DY + Math.sin(ang) * ry * k];
    const [x1, y1] = p(a - w, 0.97);
    const [x2, y2] = p(a + w, 0.97);
    const tipK = 1 + l / Math.max(rx, ry);
    const [tx, ty] = p(a + w * (rnd(seed + i + 50) - 0.5) * 0.8, tipK);
    // A soft, rounded lick of fur rather than a spike.
    d += `M${f(x1)},${f(y1)} Q${f(tx - (x2 - x1) * 0.35)},${f(ty - (y2 - y1) * 0.35)} ${f(tx)},${f(ty)} Q${f(tx + (x2 - x1) * 0.35)},${f(ty + (y2 - y1) * 0.35)} ${f(x2)},${f(y2)} Z `;
  }
  return d.trim();
}

/**
 * Fur strands: short, slightly curved hairs crossing an ellipse's edge,
 * between two angles. Thin and translucent, many of them read as fur texture
 * rather than lines. `inward` < 0 starts them outside the edge.
 */
function furStrokes(cx, cy, rx, ry, from, to, count, len, seed, inward = 0.35) {
  let d = '';
  for (let i = 0; i < count; i++) {
    const t = (i + rnd(seed + i * 3) * 0.8) / count;
    const a = rad(from + (to - from) * t);
    const l = len * (0.6 + 0.7 * rnd(seed + i * 7));
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    // Start a little inside the edge, end a little past it, with a curl.
    const x0 = cx + nx * (rx - l * inward);
    const y0 = cy + DY + ny * (ry - l * inward);
    const x1 = cx + nx * (rx + l * (1 - inward));
    const y1 = cy + DY + ny * (ry + l * (1 - inward));
    const curl = (rnd(seed + i * 11) - 0.5) * l * 0.8;
    d += `M${f(x0)},${f(y0)} Q${f((x0 + x1) / 2 - ny * curl)},${f((y0 + y1) / 2 + nx * curl)} ${f(x1)},${f(y1)} `;
  }
  return d.trim();
}

/**
 * Head fur, sampled as tapered strands so a lock can bend or curl. Each
 * panda has its own: `tuft` is a soft upright tuft (classic); `curl` is one
 * big swirl lock with two little wisps (hoodie).
 *
 * `sway` bends the tips sideways (-1..1), `lift` stands them up or lets
 * them droop, and `t` (seconds) adds each strand's own flutter. A strand is
 * [root x, root y, length, start angle (deg, 0 = up), curl (deg bent over its
 * length), width, flutter phase].
 */
const FUR = {
  tuft: [
    [90, 29, 15, -30, -10, 6.5, 0.0],
    [95.5, 27, 21, -14, -8, 7.5, 1.3],
    [100.5, 26.5, 24, 2, 6, 8, 2.1],
    [105.5, 27, 19, 17, 10, 7, 3.4],
    [110, 29.5, 13, 32, 12, 6, 4.6],
    [98, 28, 14, -4, 0, 5, 5.2],
  ],
  curl: [
    // A cowlick: rises from the crown, sweeps over and rolls into a swirl.
    [99, 29, 38, 24, -330, 10, 0.4],
    [92, 29, 12, -34, -30, 5.5, 2.2],
    [108, 29.5, 10, 38, 40, 5, 3.6],
  ],
};

function furStrand(sd, sway, lift, t) {
  'worklet';
  const N = 16;
  const len = sd[2] * (1 + lift * 0.12);
  const flutter = Math.sin(t * 2.2 + sd[6]) * 5 + Math.sin(t * 3.7 + sd[6] * 2) * 2.5;
  // Curls unwind a little as they lift and whip with the sway.
  const curl = sd[4] * (1 - lift * 0.25) + sway * 28 + flutter;
  let ang = ((sd[3] + sway * 8) * Math.PI) / 180;
  const step = len / N;
  const dAng = (curl * Math.PI) / 180 / N;
  const xs = [sd[0]];
  const ys = [sd[1] + DY];
  const as = [ang];
  for (let i = 1; i <= N; i++) {
    ang += dAng * (0.6 + 0.8 * (i / N));
    xs.push(xs[i - 1] + Math.sin(ang) * step);
    ys.push(ys[i - 1] - Math.cos(ang) * step + (1 - lift) * step * 0.05);
    as.push(ang);
  }
  // Outline: out along the left edge, back along the right, tapering to a point.
  let left = '';
  let right = '';
  for (let i = 0; i <= N; i++) {
    // Full through the middle, rounding off to a soft tip.
    const u = i / N;
    const w = sd[5] * 0.5 * Math.sqrt(Math.max(0, 1 - u * u)) * (0.85 + 0.3 * Math.sin(u * Math.PI));
    const nx = Math.cos(as[i]) * w;
    const ny = Math.sin(as[i]) * w;
    left += `${i === 0 ? 'M' : 'L'}${f(xs[i] - nx)},${f(ys[i] - ny)} `;
    right = `L${f(xs[i] + nx)},${f(ys[i] + ny)} ` + right;
  }
  return `${left}${right}Z `;
}

function crownFur(sway = 0, lift = 0, t = 0, kind = 'tuft') {
  'worklet';
  const list = kind === 'curl' ? FUR.curl : FUR.tuft;
  let d = '';
  for (let i = 0; i < list.length; i++) d += furStrand(list[i], sway, lift, t);
  return d;
}

/* ---------- The bottle ---------- */

/** The bottle at rest, hugged against the chest, leaning a little. */
const REST = { cx: 90, cy: 178, angle: -16 };
/** Lifted to the mouth for a sip: tipped toward the lips. */
const SIP = { cx: 71, cy: 172, angle: 30 };

/** Blend two poses (`t` 0 = a, 1 = b). */
function lerpPose(a, b, t) {
  'worklet';
  return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, angle: a.angle + (b.angle - a.angle) * t };
}

/** A point in the bottle's frame to the box (headroom included). */
function bp(pose, x, y) {
  'worklet';
  const c = Math.cos(rad(pose.angle));
  const s = Math.sin(rad(pose.angle));
  return [pose.cx + x * c - y * s, pose.cy + DY + x * s + y * c];
}
function bxy(pose, x, y) {
  'worklet';
  const [a, b] = bp(pose, x, y);
  return `${f(a)},${f(b)}`;
}

/** The glass the water lives in, in the bottle's frame. */
const GLASS = { x0: -19, x1: 19, top: -34, bottom: 46, r: 10 };

function bRect(pose, x0, y0, x1, y1, r) {
  const a = pose.angle;
  const P = (x, y) => bxy(pose, x, y);
  return (
    `M${P(x0 + r, y0)} L${P(x1 - r, y0)} A${r},${r} ${f(a)} 0,1 ${P(x1, y0 + r)} ` +
    `L${P(x1, y1 - r)} A${r},${r} ${f(a)} 0,1 ${P(x1 - r, y1)} ` +
    `L${P(x0 + r, y1)} A${r},${r} ${f(a)} 0,1 ${P(x0, y1 - r)} ` +
    `L${P(x0, y0 + r)} A${r},${r} ${f(a)} 0,1 ${P(x0 + r, y0)} Z`
  );
}
function bEllipse(pose, x, y, rx, ry) {
  const [cx, cy] = bp(pose, x, y);
  return ellipse(cx, cy - DY, rx, ry, pose.angle);
}

/** The glass interior as a polygon (rounded corners sampled), in the box. */
function glassPolygon(pose) {
  'worklet';
  const { x0, x1, top, bottom, r } = GLASS;
  const out = [];
  const corner = (cx, cy, from) => {
    for (let i = 0; i <= 4; i++) {
      const a = ((from + i * 22.5) * Math.PI) / 180;
      out.push(bp(pose, cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
  };
  corner(x1 - r, top + r, 270);
  corner(x1 - r, bottom - r, 0);
  corner(x0 + r, bottom - r, 90);
  corner(x0 + r, top + r, 180);
  return out;
}

/** The part of a polygon below the horizontal line `y` (screen y grows down). */
function clipBelow(poly, y) {
  'worklet';
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ain = a[1] >= y;
    const bin = b[1] >= y;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (y - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, y]);
    }
  }
  return out;
}

function area(poly) {
  'worklet';
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

/**
 * The water for a fill of `level` (0..1 of the glass), in a bottle posed by
 * `pose`. The surface stays level with the ground: it is found by bisection
 * so the water's area is `level` of the glass's, whatever the tilt.
 * `tilt` rotates what "the ground" means (degrees) — the app draws the bottle
 * in a rotated layer and passes the opposite rotation, so the water still
 * settles level on screen. `phase`/`amp` ripple the surface.
 */
function waterPath(level, pose = REST, phase = 0, amp = 1.2, tilt = 0) {
  'worklet';
  const l = Math.max(0, Math.min(1, level));
  if (l <= 0.004) return '';
  const glass = glassPolygon(pose);
  const c = Math.cos((tilt * Math.PI) / 180);
  const s = Math.sin((tilt * Math.PI) / 180);
  const px = pose.cx;
  const py = pose.cy + DY;
  const toG = (p) => [px + (p[0] - px) * c + (p[1] - py) * s, py - (p[0] - px) * s + (p[1] - py) * c];
  const fromG = (p) => [px + (p[0] - px) * c - (p[1] - py) * s, py + (p[0] - px) * s + (p[1] - py) * c];
  const g = glass.map(toG);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < g.length; i++) {
    if (g[i][1] < minY) minY = g[i][1];
    if (g[i][1] > maxY) maxY = g[i][1];
  }
  const total = area(g);
  let lo = minY;
  let hi = maxY;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (area(clipBelow(g, mid)) > l * total) lo = mid;
    else hi = mid;
  }
  const y = (lo + hi) / 2;
  const water = clipBelow(g, y);
  if (water.length < 3) return '';
  let d = '';
  for (let i = 0; i < water.length; i++) {
    let p = water[i];
    if (Math.abs(p[1] - y) < 0.01) p = [p[0], p[1] + amp * Math.sin(phase + p[0] * 0.18)];
    const q = fromG(p);
    d += `${i === 0 ? 'M' : 'L'}${f(q[0])},${f(q[1])} `;
  }
  return `${d}Z`;
}

/** A point on the bottle's axis (rest pose): 0 the bottom of the glass, 1 its top. */
function bottleAxis(t) {
  'worklet';
  const y = GLASS.bottom - 4 + (GLASS.top + 6 - (GLASS.bottom - 4)) * t;
  return bp(REST, 0, y);
}

/* ---------- Colours and gradients ---------- */

const C = {
  black: '#15151B',
  blackSoft: '#2B2B35',
  sole: '#2F2F3A',
  pink: '#F6A3B6',
  mouth: '#5E1628',
  tongue: '#FF7A98',
  furEdge: '#E3E6EF',
  bottleBlue: '#4EA2F2',
  bottleDeep: '#2A7FD8',
  glassEdge: '#A6D8F7',
  heart: '#3B8CF0',
  hoodie: '#6BA6EC',
  hoodieDeep: '#4A86D6',
  hoodieLight: '#9CC6F6',
  sparkle: '#FFD24A',
};

/**
 * Gradients. Absolute ones are in box coordinates; `relative` ones centre on
 * each shape's `box` (designer centre and radius), lit from the upper left.
 * A stop is [offset, colour, opacity?].
 */
const GRADIENTS = {
  head: { type: 'radial', cx: 86, cy: 56 + DY, r: 94, stops: [[0, '#FFFFFF'], [0.55, '#FBFCFF'], [0.82, '#EBEEF7'], [0.95, '#D9DFEE'], [1, '#CBD3E6']] },
  body: { type: 'radial', cx: 88, cy: 148 + DY, r: 78, stops: [[0, '#FFFFFF'], [0.62, '#F4F6FB'], [0.9, '#DDE2EE'], [1, '#CAD1E3']] },
  pad: { type: 'radial', cx: 0, cy: 0, r: 1, stops: [[0, '#FFD3DD'], [0.55, '#F7A9BB'], [1, '#E3869F']], relative: true },
  occlusion: { type: 'radial', cx: 0, cy: 0, r: 1, stops: [[0, '#1B2240', 0.22], [0.6, '#1B2240', 0.08], [1, '#1B2240', 0]], relative: true, centred: true },
  fold: { type: 'linear', x1: 0, y1: 150 + DY, x2: 0, y2: 225 + DY, stops: [[0, '#FFFFFF', 0.25], [1, '#1B3A7A', 0.2]] },
  hoodie: { type: 'radial', cx: 84, cy: 150 + DY, r: 80, stops: [[0, '#8DBDF4'], [0.6, '#6BA6EC'], [1, '#3E78C8']] },
  sleeve: { type: 'radial', cx: 0, cy: 0, r: 1, stops: [[0, '#93C2F6'], [0.7, '#679FE6'], [1, '#3F78C6']], relative: true },
  ear: { type: 'radial', cx: 0, cy: 0, r: 1, stops: [[0, '#45454F'], [0.6, '#232329'], [1, '#0E0E12']], relative: true },
  black: { type: 'radial', cx: 0, cy: 0, r: 1, stops: [[0, '#3C3C47'], [0.65, '#1E1E25'], [1, '#0D0D11']], relative: true },
  eye: { type: 'radial', cx: 0, cy: 0, r: 1, stops: [[0, '#3A3F5A'], [0.55, '#14151E'], [1, '#050508']], relative: true },
  iris: { type: 'radial', cx: 0, cy: 0, r: 1, stops: [[0, '#A7D5FF'], [0.35, '#4C8EF0'], [0.72, '#1C47B8'], [1, '#0A1850']], relative: true },
  nose: { type: 'radial', cx: 0, cy: 0, r: 1, stops: [[0, '#5A5A68'], [0.5, '#24242C'], [1, '#0B0B0F']], relative: true },
  blush: { type: 'radial', cx: 0, cy: 0, r: 1, stops: [[0, '#FF7FA0', 0.85], [0.55, '#FF97B0', 0.5], [1, '#FFB6C6', 0]], relative: true, centred: true },
  cup: { type: 'radial', cx: 0, cy: 0, r: 1, stops: [[0, '#FFFFFF'], [0.7, '#EEF3FB'], [1, '#C5D2E6']], relative: true },
  shadow: { type: 'radial', cx: 100, cy: 228 + DY, r: 78, stops: [[0, '#1B2240', 0.26], [0.7, '#1B2240', 0.08], [1, '#1B2240', 0]] },
  water: { type: 'linear', x1: 0, y1: 120 + DY, x2: 0, y2: 226 + DY, stops: [[0, '#9ADEFF'], [0.5, '#56B4F8'], [1, '#2A86EA']] },
  glass: { type: 'linear', x1: 60, y1: 0, x2: 120, y2: 0, stops: [[0, '#FFFFFF', 0.75], [0.4, '#E8F6FF', 0.35], [1, '#CDEBFF', 0.55]] },
  muzzle: { type: 'radial', cx: 0, cy: 0, r: 1, stops: [[0, '#FFFFFF'], [0.7, '#FAFBFE'], [1, '#E6EAF3', 0]], relative: true, centred: true },
  fur: { type: 'linear', x1: 0, y1: 80, x2: 0, y2: 30, stops: [[0, '#FFFFFF'], [1, '#E4E9F4']] },
  cap: { type: 'linear', x1: 0, y1: 105 + DY, x2: 0, y2: 145 + DY, stops: [[0, '#8CCBFF'], [1, '#347FD8']] },
};

/** Where a shape-relative radial gradient sits for a `box` [cx, cy, r]. */
function gradientCircle(g, box) {
  if (g.centred) return [box[0], box[1] + DY, box[2]];
  return [box[0] - box[2] * 0.3, box[1] + DY - box[2] * 0.35, box[2] * 1.35];
}

/* ---------- The panda ---------- */

/** The eyes: centre, size, and the patch they sit in (for lids). */
const EYES = [
  { cx: 69, cy: 96 + DY, r: 18, patch: [67, 96, 30] },
  { cx: 131, cy: 96 + DY, r: 18, patch: [133, 96, 30] },
];

const SHOULDERS = [
  [56, 152],
  [144, 150],
];
/** Where each paw grips the bottle, in its frame. */
const GRIPS = [
  [-20, 6],
  [20, 18],
];

function pads(cx, cy, mirror) {
  const m = mirror ? -1 : 1;
  const toes = [
    [-10, -9, 3.7],
    [-3.6, -14, 3.9],
    [4, -14, 3.9],
    [10.4, -9, 3.7],
  ];
  return [
    { d: ellipse(cx, cy + 5, 10.5, 8.6), fill: 'grad:pad', box: [cx, cy + 5, 10.5] },
    { d: ellipse(cx - 3, cy + 2, 4.2, 2.2), fill: '#FFFFFF', opacity: 0.45 },
    ...toes.flatMap(([x, y, r]) => [
      { d: ellipse(cx + m * x, cy + y, r, r * 1.1), fill: 'grad:pad', box: [cx + m * x, cy + y, r] },
      { d: ellipse(cx + m * x - 1, cy + y - 1.2, r * 0.38, r * 0.3), fill: '#FFFFFF', opacity: 0.5 },
    ]),
  ];
}

/** A limb from a shoulder (designer) to a point in the box, as a capsule. */
function limb(sx, sy, gx, gy, thick) {
  const dx = gx - sx;
  const dy = gy - (sy + DY);
  const len = Math.hypot(dx, dy);
  const rot = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
  return { d: ellipse((sx + gx) / 2, (sy + DY + gy) / 2 - DY, thick, len / 2 + thick * 0.45, rot), len };
}

/** The body, legs and ground shadow — never moves. */
/** Where each foot pivots at the hip, for kicks (drawing coordinates). */
const HIPS = [
  [66, 196 + DY],
  [134, 196 + DY],
];

/** One leg and foot (0 left, 1 right): fluffy black leg, sole, pink pads. */
function footParts(side) {
  const x = side === 0 ? 52 : 148;
  const sx = side === 0 ? 51 : 149;
  return [
    { d: tufts(x, 203, 28, 25, side === 0 ? 150 : 200, side === 0 ? 340 : 390, 22, 2.2, 11 + side * 6), fill: C.black },
    { d: ellipse(x, 203, 28, 25, side === 0 ? -18 : 18), fill: 'grad:black', box: [x, 203, 28] },
    { d: furStrokes(x, 203, 28, 25, side === 0 ? 150 : 200, side === 0 ? 340 : 390, 40, 2.4, 81 + side * 10), stroke: '#1C1C22', width: 0.9, opacity: 0.9 },
    { d: ellipse(sx, 208, 19, 17), fill: C.sole },
    ...pads(sx, 208, side === 1),
  ];
}

function backParts(outfit = 'classic', { feet = true } = {}) {
  const hoodie = outfit === 'hoodie';
  const parts = [
    { d: ellipse(100, 228, 78, 11), fill: 'grad:shadow' },
    /* Contact shadows right under each foot, darker than the soft pool. */
    { d: ellipse(52, 226, 26, 5), fill: 'grad:occlusion', box: [52, 226, 26] },
    { d: ellipse(148, 226, 26, 5), fill: 'grad:occlusion', box: [148, 226, 26] },
    { d: tufts(100, 170, 64, 55, 15, 165, 40, 3.2, 3), fill: C.furEdge },
    { d: ellipse(100, 170, 64, 55), fill: 'grad:body' },
    { d: furStrokes(100, 170, 64, 55, 10, 170, 70, 5, 61), stroke: '#C9D0E0', width: 0.7, opacity: 0.8 },
    /* Soft shadow where the arms and bottle press into the chest. */
    { d: ellipse(92, 186, 44, 30), fill: 'grad:occlusion', box: [92, 186, 44] },
    /* The head's shadow falling on the chest, under the chin. */
    { d: ellipse(100, 138, 58, 16), fill: 'grad:occlusion', box: [100, 138, 58] },
    /* Where the legs meet the body. */
    { d: ellipse(62, 206, 30, 18), fill: 'grad:occlusion', box: [62, 206, 30] },
    { d: ellipse(138, 206, 30, 18), fill: 'grad:occlusion', box: [138, 206, 30] },
  ];
  if (hoodie) {
    parts.push(
      /* A short, cropped hoodie: it ends mid-belly so the fluffy tummy shows,
         with just a ribbed hem, two drawstrings and a tiny panda patch. */
      { d: `M${at(37, 168)} ${arc(64, 55, 0, 1, 163, 168)} L${at(160, 184)} Q${at(100, 199)} ${at(40, 184)} Z`, fill: 'grad:hoodie' },
      { d: pts('M40,184 Q100,199 160,184'), stroke: C.hoodieDeep, width: 6 },
      { d: pts('M44,182 L44,188 M56,186 L56,192 M70,189 L70,195 M84,191 L84,197 M100,192 L100,198 M116,191 L116,197 M130,189 L130,195 M144,186 L144,192 M156,182 L156,188'), stroke: C.hoodieLight, width: 0.9, opacity: 0.5 },
      { d: pts('M91,150 Q90,160 92,168'), stroke: '#F4F8FF', width: 2 },
      { d: pts('M109,150 Q110,160 108,168'), stroke: '#F4F8FF', width: 2 },
      { d: ellipse(92, 169.5, 1.5, 2), fill: '#D7DEEA' },
      { d: ellipse(108, 169.5, 1.5, 2), fill: '#D7DEEA' },
      { d: ellipse(138, 170, 6.5, 5.8), fill: '#FFFFFF' },
      { d: ellipse(133.5, 165.5, 2.3, 2.3), fill: C.black },
      { d: ellipse(142.5, 165.5, 2.3, 2.3), fill: C.black },
      { d: ellipse(136, 170.5, 1.4, 1.8), fill: C.black },
      { d: ellipse(140, 170.5, 1.4, 1.8), fill: C.black },
    );
  }
  parts.push(
    ...(feet ? [...footParts(0), ...footParts(1)] : []),
  );
  return parts;
}

/** Ear centres, for renderers that let them twitch. */
const EARS = [
  [40, 40],
  [160, 40],
];

/** One ear (0 left, 1 right), with fluff, shading and an inner hollow. */
function earParts(side) {
  const [x, y] = EARS[side];
  const ix = side === 0 ? x + 3 : x - 3;
  return [
    { d: tufts(x, y, 25, 24, 150, 390, 28, 2, 23 + side * 6), fill: C.black },
    { d: ellipse(x, y, 25, 24), fill: 'grad:ear', box: [x, y, 25] },
    { d: furStrokes(x, y, 25, 24, 170, 370, 40, 2.4, 101 + side * 9), stroke: '#1C1C22', width: 0.9, opacity: 0.9 },
    { d: ellipse(ix, y + 4, 12, 11), fill: '#3A3A45', opacity: 0.55 },
    { d: ellipse(ix - 3, y - 3, 6, 4), fill: '#FFFFFF', opacity: 0.08 },
  ];
}

/** Head, patches, nose and cheeks — the face without eyes or mouth. Ears
    are included unless the renderer draws them itself (`ears: false`). */
/** The cheeks' blush and its little strokes. */
function blushParts() {
  return [
    { d: ellipse(44, 124, 16, 10), fill: 'grad:blush', box: [44, 124, 16] },
    { d: ellipse(156, 124, 16, 10), fill: 'grad:blush', box: [156, 124, 16] },
    { d: pts('M39,122 L37,127 M44,122 L42,127 M49,122 L47,127'), stroke: '#FF6F92', width: 1.4, opacity: 0.7 },
    { d: pts('M151,122 L153,127 M156,122 L158,127 M161,122 L163,127'), stroke: '#FF6F92', width: 1.4, opacity: 0.7 },
  ];
}

/** The button nose, with its gloss. `NOSE` is its centre, for a sniff. */
const NOSE = [100, 110 + DY];
function noseParts() {
  return [
    { d: pts('M90.5,108.5 Q100,102.5 109.5,108.5 Q110,114 100,117 Q90,114 90.5,108.5 Z'), fill: 'grad:nose', box: [100, 109, 10] },
    { d: ellipse(96.5, 107.2, 3.4, 1.5), fill: '#FFFFFF', opacity: 0.7 },
    { d: ellipse(103.5, 109, 1.2, 0.8), fill: '#FFFFFF', opacity: 0.35 },
  ];
}

function headParts(outfit = 'classic', { ears = true, nose = true } = {}) {
  const hoodie = outfit === 'hoodie';
  const parts = [];
  if (hoodie) {
    /* The hood, bunched behind the neck. */
    parts.push({ d: pts('M36,136 Q100,168 164,136 Q170,156 150,166 Q100,178 50,166 Q30,156 36,136 Z'), fill: C.hoodieDeep });
  }
  if (ears) parts.push(...earParts(0), ...earParts(1));
  parts.push(
    { d: tufts(100, 84, 74, 62, 0, 360, 96, 2.8, 5), fill: C.furEdge },
    { d: ellipse(100, 84, 74, 62), fill: 'grad:head' },
    /* Where each ear meets the head, and a soft shade along the jaw. */
    { d: ellipse(46, 36, 16, 8, -35), fill: 'grad:occlusion', box: [46, 36, 16] },
    { d: ellipse(154, 36, 16, 8, 35), fill: 'grad:occlusion', box: [154, 36, 16] },
    { d: ellipse(100, 138, 54, 10), fill: 'grad:occlusion', box: [100, 134, 54] },
    /* Fur: strands breaking the outline, and a fine texture across the face. */
    { d: furStrokes(100, 84, 74, 62, 0, 360, 130, 4, 121), stroke: '#D3D9E6', width: 0.6, opacity: 0.6 },
    /* Cheek fluff at the jowls. */
    { d: furStrokes(100, 100, 72, 46, 25, 155, 34, 5, 141, 0.2), stroke: '#D6DCE8', width: 0.7, opacity: 0.55 },
    { d: pts('M56,54 Q63,48 72,51'), stroke: C.black, width: 2.6 },
    { d: pts('M128,51 Q137,48 144,54'), stroke: C.black, width: 2.6 },
    /* Chubby cheek fluff, puffing out past the jaw. */
    { d: tufts(52, 112, 26, 20, 90, 220, 18, 3, 171), fill: C.furEdge },
    { d: tufts(148, 112, 26, 20, -40, 90, 18, 3, 181), fill: C.furEdge },
    { d: ellipse(52, 112, 26, 20, -10), fill: 'grad:head' },
    { d: ellipse(148, 112, 26, 20, 10), fill: 'grad:head' },
    { d: ellipse(67, 96, 25.5, 30, 36), fill: 'grad:black', box: [67, 96, 30] },
    { d: ellipse(133, 96, 25.5, 30, -36), fill: 'grad:black', box: [133, 96, 30] },
    /* A soft, slightly raised muzzle around the nose and mouth. */
    { d: ellipse(100, 118, 20, 15), fill: 'grad:muzzle', box: [100, 118, 20] },
    ...blushParts(),
    ...(nose ? noseParts() : []),
  );
  return parts;
}

/** The mouth, by expression. */
function mouthParts(kind = 'smile') {
  if (kind === 'sip') return [{ d: ellipse(100, 123, 4.5, 3.6), fill: C.mouth }];
  if (kind === 'gulp') {
    return [
      { d: pts('M94,121 Q100,125 106,121'), stroke: C.mouth, width: 2.2 },
      { d: ellipse(40, 117, 8, 6), fill: '#FFFFFF', opacity: 0.35 },
      { d: ellipse(160, 117, 8, 6), fill: '#FFFFFF', opacity: 0.35 },
    ];
  }
  if (kind === 'thirsty') {
    return [
      { d: pts('M100,115.5 L100,118'), stroke: C.black, width: 1.8 },
      { d: pts('M92,121 Q100,118 108,121 Q106,129 100,129 Q94,129 92,121 Z'), fill: C.mouth },
      { d: pts('M95,126 Q100,123 105,126 Q104,133 100,134 Q96,133 95,126 Z'), fill: C.tongue },
    ];
  }
  if (kind === 'blep') {
    /* A closed smile with the tip of the tongue poking out. */
    return [
      { d: pts('M100,115.5 L100,119'), stroke: C.black, width: 1.8 },
      { d: pts('M91,119 Q95.5,123 100,119 Q104.5,123 109,119'), stroke: C.mouth, width: 2 },
      { d: pts('M96.5,121 Q100,120.5 103.5,121 Q104,127.5 100,128 Q96,127.5 96.5,121 Z'), fill: C.tongue },
      { d: pts('M100,122 L100,126'), stroke: '#E25C7E', width: 0.8, opacity: 0.7 },
    ];
  }
  if (kind === 'o') return [{ d: ellipse(100, 124, 5.5, 6.5), fill: C.mouth }, { d: ellipse(100, 127, 3.5, 2.5), fill: C.tongue }];
  if (kind === 'sleepy') return [{ d: pts('M95,121 Q100,124 105,121'), stroke: C.mouth, width: 2 }];
  return [
    { d: pts('M100,115.5 L100,118'), stroke: C.black, width: 1.8 },
    { d: pts('M88,118 Q100,123 112,118 Q111,134 100,135 Q89,134 88,118 Z'), fill: C.mouth },
    { d: pts('M92.5,129 Q100,123.5 107.5,129 Q104,135 100,135 Q96,135 92.5,129 Z'), fill: C.tongue },
    { d: pts('M90,118.6 Q100,122.4 110,118.6'), stroke: '#FFFFFF', width: 1.2, opacity: 0.5 },
  ];
}

/** The eye white. */
/**
 * The eyes are small, glossy and dark — "pookie" eyes — so there is no eye
 * white; only a faint rim lifts each one off its black patch.
 */
const EYE_R = 11.5;
function eyeWhiteParts(eye) {
  return [{ d: ellipse(eye.cx, eye.cy - DY + 1, EYE_R + 1.3, EYE_R + 1.6), fill: '#3A3B48', opacity: 0.9 }];
}

/** The eye itself: a dark gloss with two soft shines — the part that looks around. */
function irisParts(eye, look = 'open') {
  const { cx, cy } = eye;
  const y = cy - DY + 1;
  const big = look === 'love';
  const er = big ? EYE_R + 1.2 : EYE_R;
  const parts = [
    { d: ellipse(cx, y, er, er * 1.08), fill: 'grad:eye', box: [cx, y, er] },
    /* A big soft shine up top and a small one below: the whole cute look. */
    { d: ellipse(cx - er * 0.32, y - er * 0.38, er * (big ? 0.48 : 0.4), er * (big ? 0.42 : 0.36)), fill: '#FFFFFF' },
    { d: ellipse(cx + er * 0.38, y + er * 0.36, er * 0.17, er * 0.17), fill: '#FFFFFF', opacity: 0.9 },
  ];
  if (look === 'sparkle' || big) {
    /* A tiny twinkle, for the hoodie panda and for happy moments. */
    const sx = cx + er * 0.5;
    const sy = y - er * 0.55;
    const k = er * 0.22;
    parts.push({ d: pts(`M${sx},${sy - k} L${sx + k * 0.28},${sy - k * 0.28} L${sx + k},${sy} L${sx + k * 0.28},${sy + k * 0.28} L${sx},${sy + k} L${sx - k * 0.28},${sy + k * 0.28} L${sx - k},${sy} L${sx - k * 0.28},${sy - k * 0.28} Z`), fill: '#FFFFFF', opacity: 0.95 });
  }
  return parts;
}

/** Whole eyes: white plus iris. */
function eyeParts(eye, look = 'open') {
  return [...eyeWhiteParts(eye), ...irisParts(eye, look)];
}

/** Lids over the eyes: a blink, happy arcs, heavy thirsty lids, or sleepy. */
function lidParts(eye, kind = 'shut') {
  const { cx, cy, r } = eye;
  const y = cy - DY;
  const patch = { fill: 'grad:black', box: eye.patch };
  if (kind === 'happy') {
    return [
      { d: ellipse(cx, y, r + 1.2, r + 1.2), ...patch },
      { d: pts(`M${cx - r * 0.8},${y + 3} Q${cx},${y - r * 0.75} ${cx + r * 0.8},${y + 3}`), stroke: '#F2F5FF', width: 3.2 },
    ];
  }
  if (kind === 'thirsty' || kind === 'sleepy') {
    const drop = kind === 'sleepy' ? r * 0.35 : -1;
    return [
      { d: `M${at(cx - r - 1.5, y + drop)} ${arc(r + 1.5, r + 1.5, 0, 1, cx + r + 1.5, y + drop)} Z`, ...patch },
      { d: `M${at(cx - r, y + drop)} L${at(cx + r, y + drop)}`, stroke: '#6A6A7A', width: 2 },
    ];
  }
  return [
    { d: ellipse(cx, y, r + 1.2, r + 1.2), ...patch },
    { d: pts(`M${cx - r * 0.75},${y + 1} Q${cx},${y + r * 0.55} ${cx + r * 0.75},${y + 1}`), stroke: '#6A6A7A', width: 2.4 },
  ];
}
function closedEyeParts(eye) {
  return lidParts(eye, 'shut');
}

/** The bottle behind its water: handle, cap, spout, and the glass body. */
function bottleBackParts(pose = REST) {
  const [sx, sy] = bp(pose, 5, 10);
  return [
    /* The bottle's soft shadow on the belly behind it. */
    { d: ellipse(sx + 4, sy - DY + 3, 22, 40, pose.angle), fill: '#1B2240', opacity: 0.09 },
    { d: bEllipse(pose, -25, -40, 8, 11), stroke: C.bottleBlue, width: 3.8 },
    { d: bRect(pose, -18.5, -51, 18.5, -32, 7), fill: 'grad:cap' },
    { d: bRect(pose, -15, -49, 15, -46.5, 1.2), fill: '#FFFFFF', opacity: 0.35 },
    { d: bRect(pose, -5.5, -61, 5.5, -50, 2.8), fill: C.bottleDeep },
    { d: bRect(pose, -3.5, -60, -1, -52, 1), fill: '#FFFFFF', opacity: 0.4 },
    { d: bEllipse(pose, -12, -48, 4.2, 4.2), fill: C.black },
    { d: bEllipse(pose, 12, -48, 4.2, 4.2), fill: C.black },
    { d: bRect(pose, GLASS.x0, GLASS.top, GLASS.x1, GLASS.bottom, GLASS.r), fill: '#EAF7FF', opacity: 0.55 },
  ];
}

/** In front of the water: the sticker, shine and rim. */
function bottleFrontParts(pose = REST) {
  return [
    { d: bEllipse(pose, 0, 4, 9, 8), fill: '#FFFFFF' },
    { d: bEllipse(pose, -7, -2, 3.1, 3.1), fill: C.black },
    { d: bEllipse(pose, 7, -2, 3.1, 3.1), fill: C.black },
    { d: bEllipse(pose, -3, 4.5, 1.8, 2.2), fill: C.black },
    { d: bEllipse(pose, 3, 4.5, 1.8, 2.2), fill: C.black },
    { d: bEllipse(pose, 0, 7.8, 1.2, 0.8), fill: C.black },
    { d: bEllipse(pose, -5.5, 7, 1.8, 1.1), fill: C.pink, opacity: 0.8 },
    { d: bEllipse(pose, 5.5, 7, 1.8, 1.1), fill: C.pink, opacity: 0.8 },
    /* A little water drop on the glass. */
    {
      d: `M${bxy(pose, 0, 13)} Q${bxy(pose, 5.5, 20)} ${bxy(pose, 5.5, 23)} A5.5,5.5 ${f(pose.angle)} 1,1 ${bxy(pose, -5.5, 23)} Q${bxy(pose, -5.5, 20)} ${bxy(pose, 0, 13)} Z`,
      fill: '#5EB4FF',
      opacity: 0.9,
    },
    { d: bRect(pose, -14.5, -27, -9.5, 36, 2.5), fill: '#FFFFFF', opacity: 0.55 },
    { d: bRect(pose, 11, -24, 13.5, 30, 1.2), fill: '#FFFFFF', opacity: 0.3 },
    { d: bRect(pose, GLASS.x0, GLASS.top, GLASS.x1, GLASS.bottom, GLASS.r), fill: 'grad:glass', opacity: 0.4 },
    { d: bRect(pose, GLASS.x0, GLASS.top, GLASS.x1, GLASS.bottom, GLASS.r), stroke: C.glassEdge, width: 1.6 },
    { d: bRect(pose, GLASS.x0 + 1.5, GLASS.bottom - 5, GLASS.x1 - 1.5, GLASS.bottom - 2, 1.5), fill: '#FFFFFF', opacity: 0.35 },
  ];
}

/** Arms reaching from the shoulders to their grips on the bottle. */
function armParts(outfit = 'classic', pose = REST) {
  const parts = [];
  SHOULDERS.forEach(([sx, sy], i) => {
    const [gx, gy] = bp(pose, GRIPS[i][0], GRIPS[i][1]);
    if (outfit === 'hoodie') {
      /* Black arm to the paw, with a short sleeve over the top half. */
      const fullArm = limb(sx, sy, gx, gy, 13.5);
      parts.push({ d: fullArm.d, fill: 'grad:black', box: [(sx + gx) / 2, (sy + DY + gy) / 2 - DY, fullArm.len / 2] });
      const wx = sx + (gx - sx) * 0.45;
      const wy = sy + DY + (gy - sy - DY) * 0.45;
      const sleeve = limb(sx, sy, wx, wy, 14);
      const shade = limb(sx + (i === 0 ? 3 : -3), sy + 4, wx + (i === 0 ? 3 : -3), wy + 4, 15);
      parts.push({ d: shade.d, fill: '#10224A', opacity: 0.14 });
      parts.push({ d: sleeve.d, fill: 'grad:sleeve', box: [(sx + wx) / 2, (sy + DY + wy) / 2 - DY, sleeve.len / 2] });
      const rot = (Math.atan2(gy - wy, gx - wx) * 180) / Math.PI - 90;
      parts.push({ d: ellipse(wx, wy - DY, 12, 5, rot), fill: C.hoodieLight });
      parts.push({ d: ellipse(wx, wy - DY, 12, 5, rot), stroke: '#6E9FE0', width: 0.8, opacity: 0.6 });
    } else {
      const arm = limb(sx, sy, gx, gy, 13.5);
      const shade = limb(sx + (i === 0 ? 3 : -3), sy + 4, gx + (i === 0 ? 3 : -3), gy + 4, 15);
      parts.push({ d: shade.d, fill: '#1B2240', opacity: 0.1 });
      parts.push({ d: arm.d, fill: 'grad:black', box: [(sx + gx) / 2, (sy + DY + gy) / 2 - DY, arm.len / 2] });
      /* A sheen along the top of the arm. */
      const mx = (sx + gx) / 2;
      const my = (sy + DY + gy) / 2 - DY;
      const rot = (Math.atan2(gy - sy - DY, gx - sx) * 180) / Math.PI - 90;
      parts.push({ d: ellipse(mx - 3, my - 2, 4, arm.len / 3, rot), fill: '#FFFFFF', opacity: 0.07 });
    }
    /* Toe lines on the paw. */
    const toeRot = pose.angle + (i === 0 ? -80 : 80);
    const tc = Math.cos(rad(toeRot));
    const ts = Math.sin(rad(toeRot));
    for (let k = -1; k <= 1; k++) {
      const ox = gx + tc * 6 - ts * k * 4;
      const oy = gy + ts * 6 + tc * k * 4;
      parts.push({ d: ellipse(ox, oy - DY, 1.6, 1.6), fill: '#3E3E4A', opacity: 0.8 });
    }
  });
  return parts;
}

/** The doodles around the panda, per outfit. */
/** No doodles around the panda: it stands on its own. Kept as a hook. */
function doodleParts() {
  return [];
}

/** A little sweat drop by the head — the thirsty tell. */
function sweatParts() {
  return [
    { d: `M${at(166, 56)} Q${at(172, 66)} ${at(172, 70)} ${arc(6, 6, 1, 1, 160, 70)} Q${at(160, 66)} ${at(166, 56)} Z`, fill: '#8FD0FF', stroke: '#4EA2F2', width: 1.2 },
    { d: ellipse(164, 69, 1.6, 2.4), fill: '#FFFFFF', opacity: 0.8 },
  ];
}

/** Default eye look for an outfit. */
const EYE_LOOK = { classic: 'open', hoodie: 'sparkle' };
/** Each panda's own head fur. */
const FUR_KIND = { classic: 'tuft', hoodie: 'curl' };

module.exports = {
  W,
  H,
  DY,
  REST,
  SIP,
  GLASS,
  EYES,
  GRADIENTS,
  COLORS: C,
  EYE_LOOK,
  FUR_KIND,
  gradientCircle,
  lerpPose,
  backParts,
  headParts,
  earParts,
  EARS,
  mouthParts,
  eyeWhiteParts,
  irisParts,
  eyeParts,
  lidParts,
  closedEyeParts,
  bottleBackParts,
  bottleFrontParts,
  armParts,
  doodleParts,
  sweatParts,
  waterPath,
  bottleAxis,
  crownFur,
  footParts,
  HIPS,
  noseParts,
  NOSE,
  blushParts,
};
