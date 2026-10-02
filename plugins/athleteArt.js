/**
 * The Reps widget's athlete: a Gen Z chibi doing push-ups, side view, facing
 * left — as a man or a woman. Plain path data in a 140 x 92 box, in the same
 * part format as `pandaArt.js` ({ d, fill | stroke, width, opacity, box }).
 *
 * `figure(sex, k)` poses one rep at depth `k` (0 arms locked out, 1 chest
 * down): the body stays a straight plank from heels to shoulders and pivots
 * at the toes, the elbows fold back, the head dips with the chest.
 *
 * Him: fluffy textured curls, an oversized black tee, beige cargo joggers,
 * chunky sneakers and a thin silver chain. Her: a sleek high ponytail with a
 * scrunchie, gold hoops, a lilac crop tank, black biker shorts and chunky
 * sneakers. Limbs are layered strokes (shade, colour, highlight) so they read
 * as rounded 3D forms.
 */

const W = 140;
const H = 92;
const FLOOR = 84;

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

const line = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)},${f(y)}`).join(' ');
const curve = (a, c, b) => `M${f(a[0])},${f(a[1])} Q${f(c[0])},${f(c[1])} ${f(b[0])},${f(b[1])}`;

function limb(d, width, color, shade, light) {
  return [
    { d, stroke: shade, width: width + 1.6 },
    { d, stroke: color, width },
    { d, stroke: light, width: Math.max(1, width * 0.2), opacity: 0.5 },
  ];
}

const LOOK = {
  male: {
    skin: '#E9B48E',
    skinShade: '#C98E68',
    skinLight: '#FFD9BC',
    hair: '#1F1A1C',
    hairLight: '#4A3F44',
    top: '#17171C',
    topShade: '#0B0B0E',
    topLight: '#3A3A44',
    bottom: '#D8C3A0',
    bottomShade: '#B49E7A',
    bottomLight: '#F1E3C8',
    shoe: '#FAFAFA',
    shoeAccent: '#FF5A36',
    sole: '#E6E6EC',
  },
  female: {
    skin: '#F2C0A0',
    skinShade: '#D59C7C',
    skinLight: '#FFE1CE',
    hair: '#3A2420',
    hairLight: '#6E463C',
    top: '#B79CFF',
    topShade: '#8F72E8',
    topLight: '#DCCDFF',
    bottom: '#1B1B22',
    bottomShade: '#0D0D12',
    bottomLight: '#3C3C48',
    shoe: '#FAFAFA',
    shoeAccent: '#B79CFF',
    sole: '#E6E6EC',
  },
};

const GRADIENTS = {
  skin: { type: 'radial', stops: [[0, '#FFE3D0'], [0.65, '#F0BC97'], [1, '#CF9470']], relative: true },
  shadow: { type: 'radial', cx: 78, cy: FLOOR + 3, r: 56, stops: [[0, '#0B1020', 0.32], [1, '#0B1020', 0]] },
};

function figure(sex = 'male', k = 0) {
  const p = LOOK[sex === 'female' ? 'female' : 'male'];
  const female = sex === 'female';
  const t = Math.max(0, Math.min(1, k));

  // The plank: toes fixed, shoulders rise and fall.
  const toe = [120, FLOOR - 2];
  const shoulder = [46, 50 + t * 18];
  const along = (u) => [toe[0] + (shoulder[0] - toe[0]) * u, toe[1] + (shoulder[1] - toe[1]) * u];
  const ankle = along(0.06);
  const knee = along(0.3);
  const hip = along(0.52);
  const chest = along(0.86);
  const hand = [44, FLOOR - 1];
  // Elbow: straight under the shoulder at the top, folded back at the bottom.
  const elbow = [shoulder[0] + 3 + t * 13, shoulder[1] + (hand[1] - shoulder[1]) * 0.5 - t * 6];
  const head = [shoulder[0] - 15, shoulder[1] - 9 + t * 2];
  const parts = [];

  parts.push({ d: ellipse(80, FLOOR + 3, 50, 4.5), fill: 'grad:shadow' });

  // Her ponytail flows back from the crown, behind everything else.
  if (female) {
    const sw = t * 3;
    parts.push({ d: curve([head[0] + 6, head[1] - 12], [head[0] + 24, head[1] - 18 + sw], [head[0] + 30, head[1] - 4 + sw]), stroke: p.hair, width: 7.5 });
    parts.push({ d: curve([head[0] + 6, head[1] - 12], [head[0] + 23, head[1] - 17 + sw], [head[0] + 28, head[1] - 6 + sw]), stroke: p.hairLight, width: 2, opacity: 0.6 });
    parts.push({ d: ellipse(head[0] + 8, head[1] - 12.5, 3.2, 2.6, 20), fill: '#FF7AA8' });
  }

  // Far arm (behind the body), a touch darker.
  parts.push(...limb(line([shoulder, elbow, [hand[0] + 4, hand[1]]]), 7, p.skinShade, p.skinShade, p.skinLight));

  // Legs: joggers (him) or biker shorts over skin (her).
  if (female) {
    parts.push(...limb(line([ankle, knee]), 8.5, p.skin, p.skinShade, p.skinLight));
    parts.push(...limb(line([knee, hip]), 11, p.bottom, p.bottomShade, p.bottomLight));
  } else {
    parts.push(...limb(line([ankle, knee, hip]), 11, p.bottom, p.bottomShade, p.bottomLight));
    // A cargo pocket on the thigh.
    const mid = along(0.4);
    parts.push({ d: ellipse(mid[0], mid[1] + 1.5, 4, 2.6, -Math.atan2(shoulder[1] - toe[1], toe[0] - shoulder[0]) * 57.3), fill: p.bottomShade, opacity: 0.8 });
  }

  // Chunky sneaker.
  parts.push({ d: `M${f(toe[0] - 9)},${f(toe[1] - 3)} Q${f(toe[0])},${f(toe[1] - 9)} ${f(toe[0] + 7)},${f(toe[1] - 2)} L${f(toe[0] + 7)},${f(toe[1] + 2)} L${f(toe[0] - 9)},${f(toe[1] + 2)} Z`, fill: p.shoe });
  parts.push({ d: line([[toe[0] - 9, toe[1] + 2], [toe[0] + 7, toe[1] + 2]]), stroke: p.sole, width: 2.6 });
  parts.push({ d: curve([toe[0] - 6, toe[1] - 3], [toe[0] - 1, toe[1] - 6], [toe[0] + 4, toe[1] - 2.5]), stroke: p.shoeAccent, width: 1.6 });

  // Torso.
  if (female) {
    // Bare midriff, then the crop tank over the chest.
    parts.push(...limb(line([hip, along(0.68)]), 11, p.skin, p.skinShade, p.skinLight));
    parts.push(...limb(line([along(0.68), chest, shoulder]), 13, p.top, p.topShade, p.topLight));
  } else {
    // Oversized tee: wide and loose, hanging a little below the line.
    parts.push(...limb(line([hip, chest, shoulder]), 15, p.top, p.topShade, p.topLight));
    const loose = along(0.7);
    parts.push({ d: ellipse(loose[0], loose[1] + 6, 7, 3.4), fill: p.top });
    // A small graphic on the tee.
    const g = along(0.78);
    parts.push({ d: ellipse(g[0], g[1] + 1, 2.6, 2.6), stroke: '#FF5A36', width: 1.2 });
    // The chain, swinging down from the neck.
    parts.push({ d: curve([shoulder[0] + 1, shoulder[1] + 2], [shoulder[0] + 4, shoulder[1] + 9 + t * 2], [shoulder[0] + 8, shoulder[1] + 3]), stroke: '#D7DDE6', width: 1.1 });
  }

  // Near arm: shoulder to elbow to hand, with a sleeve on him.
  parts.push(...limb(line([shoulder, elbow, hand]), 7.5, p.skin, p.skinShade, p.skinLight));
  parts.push({ d: ellipse(hand[0] - 1, hand[1] - 0.5, 4.6, 2.6), fill: p.skin });
  if (!female) parts.push({ d: ellipse(shoulder[0] + 2.5, shoulder[1] + 3, 6, 5.2), fill: p.top });

  // Head: big chibi head, three-quarter towards us.
  parts.push({ d: line([head, shoulder]), stroke: p.skinShade, width: 6 });
  parts.push({ d: ellipse(head[0], head[1], 15.5, 15), fill: 'grad:skin', box: [head[0], head[1], 15.5] });

  if (female) {
    // Sleek pulled-back hair with a centre part and baby hairs.
    parts.push({ d: `M${f(head[0] - 15)},${f(head[1] - 1)} Q${f(head[0] - 14)},${f(head[1] - 17)} ${f(head[0] + 1)},${f(head[1] - 16.5)} Q${f(head[0] + 15)},${f(head[1] - 16)} ${f(head[0] + 15.5)},${f(head[1] - 2)} Q${f(head[0] + 10)},${f(head[1] - 10)} ${f(head[0])},${f(head[1] - 9)} Q${f(head[0] - 9)},${f(head[1] - 10)} ${f(head[0] - 15)},${f(head[1] - 1)} Z`, fill: p.hair });
    parts.push({ d: curve([head[0] - 2, head[1] - 15], [head[0] + 5, head[1] - 15.5], [head[0] + 11, head[1] - 12]), stroke: p.hairLight, width: 1.6, opacity: 0.7 });
    parts.push({ d: curve([head[0] - 12, head[1] - 4], [head[0] - 10, head[1] - 6], [head[0] - 9, head[1] - 3.5]), stroke: p.hair, width: 1 });
    // Gold hoop.
    parts.push({ d: ellipse(head[0] + 11, head[1] + 7, 2.8, 3.4), stroke: '#F2C14E', width: 1.3 });
  } else {
    // Fluffy textured curls on top, a soft fringe over the forehead.
    const curls = [[-12, -9, 5], [-6, -14, 6], [1, -16, 6.5], [8, -14, 6], [13, -9, 5], [-9, -5, 4.2], [4, -9, 5]];
    for (const [dx, dy, r] of curls) parts.push({ d: ellipse(head[0] + dx, head[1] + dy, r, r * 0.92), fill: p.hair });
    for (const [dx, dy, r] of [[-5, -15, 2], [3, -17, 2.2], [10, -13, 1.8]]) {
      parts.push({ d: ellipse(head[0] + dx, head[1] + dy, r, r * 0.8), fill: p.hairLight, opacity: 0.7 });
    }
    parts.push({ d: curve([head[0] - 11, head[1] - 4], [head[0] - 7, head[1] - 1], [head[0] - 3, head[1] - 5]), stroke: p.hair, width: 3 });
  }

  // Face, turned a little towards us: focused at the bottom, a grin at the top.
  for (const [dx] of [[-7], [1.5]]) {
    parts.push({ d: ellipse(head[0] + dx, head[1] + 2.5, 1.9, t > 0.8 ? 0.6 : 2.3), fill: '#22181A' });
    if (t <= 0.8) parts.push({ d: ellipse(head[0] + dx - 0.6, head[1] + 1.7, 0.6, 0.6), fill: '#FFFFFF' });
  }
  parts.push({ d: ellipse(head[0] - 10.5, head[1] + 7.5, 2.8, 1.6), fill: '#FF8FA3', opacity: 0.45 });
  parts.push({ d: ellipse(head[0] + 5, head[1] + 7.5, 2.6, 1.5), fill: '#FF8FA3', opacity: 0.45 });
  parts.push({ d: curve([head[0] - 6.5, head[1] + 8.5], [head[0] - 2.5, head[1] + 11 - t * 2.5], [head[0] + 1.5, head[1] + 8.5]), stroke: '#8C3B2E', width: 1.3 });

  return parts;
}

module.exports = { W, H, GRADIENTS, figure };
