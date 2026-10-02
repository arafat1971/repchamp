/**
 * The Reps widget's athlete: a chibi, softly-shaded 3D figure doing a squat,
 * front view, as a man or a woman. Plain path data in a 100 x 130 box, in
 * the same part format as `pandaArt.js` ({ d, fill | stroke, width, opacity,
 * box }) so the same writers draw it.
 *
 * `figure(sex, k)` poses it at squat depth `k` (0 standing, 1 deepest): the
 * hips drop, the knees track out, the arms come up in front to balance, and
 * the woman's ponytail swings a little behind.
 *
 * Limbs are layered strokes — a darker underside, the colour, a thin light
 * highlight — which reads as rounded 3D forms without any gradients a
 * widget cannot animate cheaply.
 */

const W = 100;
const H = 130;

function f(n) {
  return Math.round(n * 100) / 100;
}

/** An ellipse as two arcs. */
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

/** A rounded limb: shadow, colour, highlight. */
function limb(d, width, color, shade, light) {
  return [
    { d, stroke: shade, width: width + 1.6 },
    { d, stroke: color, width },
    { d, stroke: light, width: Math.max(1, width * 0.22), opacity: 0.55 },
  ];
}

const PALETTE = {
  male: {
    skin: '#F2C29B',
    skinShade: '#D9A07A',
    skinLight: '#FFE1C8',
    hair: '#2B2321',
    hairLight: '#5A4A44',
    top: '#2F7BF2',
    topShade: '#1F5BC4',
    topLight: '#7FB2FF',
    bottom: '#26324A',
    bottomShade: '#18202F',
    bottomLight: '#4A5878',
    band: '#FF6B2C',
    shoe: '#FFFFFF',
    sole: '#FF6B2C',
  },
  female: {
    skin: '#F5C6A5',
    skinShade: '#DEA586',
    skinLight: '#FFE4D1',
    hair: '#5B3A29',
    hairLight: '#8A5C43',
    top: '#F2557A',
    topShade: '#C93B5F',
    topLight: '#FF9BB4',
    bottom: '#6A4BD6',
    bottomShade: '#4C33A6',
    bottomLight: '#9C85F0',
    band: '#2FD3B5',
    shoe: '#FFFFFF',
    sole: '#7C5CFA',
  },
};

const GRADIENTS = {
  skin: { type: 'radial', stops: [[0, '#FFE6D3'], [0.65, '#F4C29F'], [1, '#D99C76']], relative: true },
  shadow: { type: 'radial', cx: 50, cy: 124, r: 30, stops: [[0, '#0B1020', 0.35], [1, '#0B1020', 0]] },
};

function figure(sex = 'male', k = 0) {
  const p = PALETTE[sex === 'female' ? 'female' : 'male'];
  const female = sex === 'female';
  const t = Math.max(0, Math.min(1, k));
  const hipY = 72 + t * 15;
  const shoulderY = hipY - 30 + t * 2;
  const headY = shoulderY - 17;
  const kneeX = 9 + t * 9;
  const kneeY = 96 + t * 3;
  const ankleY = 114;
  const parts = [];

  parts.push({ d: ellipse(50, 124, 26, 4.5), fill: 'grad:shadow' });

  // The ponytail sits behind the head.
  if (female) {
    const sw = (t - 0.5) * 6;
    parts.push({ d: curve([58, headY - 6], [70 + sw, headY - 2], [64 + sw, headY + 14]), stroke: p.hair, width: 7 });
    parts.push({ d: curve([58, headY - 6], [69 + sw, headY - 2], [63 + sw, headY + 12]), stroke: p.hairLight, width: 2, opacity: 0.6 });
    parts.push({ d: ellipse(59, headY - 6, 3, 2.4), fill: p.band });
  }

  // Legs: thigh then shin, each side.
  for (const side of [-1, 1]) {
    const hip = [50 + side * 7, hipY];
    const knee = [50 + side * kneeX, kneeY];
    const ankle = [50 + side * 12, ankleY];
    const legColor = female ? p.bottom : p.skin;
    const legShade = female ? p.bottomShade : p.skinShade;
    const legLight = female ? p.bottomLight : p.skinLight;
    parts.push(...limb(line([knee, ankle]), 11, legColor, legShade, legLight));
    // Thighs: shorts (man) or leggings (woman).
    parts.push(...limb(line([hip, knee]), 13.5, p.bottom, p.bottomShade, p.bottomLight));
    // Shoes.
    parts.push({ d: ellipse(50 + side * 13, ankleY + 4, 7.5, 4.2), fill: p.shoe });
    parts.push({ d: `M${f(50 + side * 13 - 7.5)},${f(ankleY + 5.5)} Q${f(50 + side * 13)},${f(ankleY + 9.5)} ${f(50 + side * 13 + 7.5)},${f(ankleY + 5.5)}`, stroke: p.sole, width: 2 });
  }

  // Torso: a rounded tee / tank, darker at the sides.
  const tw = 14;
  const torso = `M${f(50 - tw)},${f(shoulderY + 2)} Q50,${f(shoulderY - 3)} ${f(50 + tw)},${f(shoulderY + 2)} L${f(50 + tw - 3)},${f(hipY + 2)} Q50,${f(hipY + 6)} ${f(50 - tw + 3)},${f(hipY + 2)} Z`;
  parts.push({ d: torso, fill: p.topShade });
  parts.push({ d: `M${f(50 - tw + 2.5)},${f(shoulderY + 2)} Q50,${f(shoulderY - 1.5)} ${f(50 + tw - 2.5)},${f(shoulderY + 2)} L${f(50 + tw - 5)},${f(hipY + 1)} Q50,${f(hipY + 4)} ${f(50 - tw + 5)},${f(hipY + 1)} Z`, fill: p.top });
  parts.push({ d: ellipse(45, shoulderY + 9, 3.5, 7, -10), fill: p.topLight, opacity: 0.45 });
  if (!female) {
    // Shorts' waistband.
    parts.push({ d: line([[50 - tw + 3, hipY + 1], [50 + tw - 3, hipY + 1]]), stroke: p.bottomShade, width: 3 });
  } else {
    // A little logo stripe on the sports top.
    parts.push({ d: curve([50 - tw + 4, shoulderY + 6], [50, shoulderY + 10], [50 + tw - 4, shoulderY + 6]), stroke: p.topLight, width: 1.6, opacity: 0.8 });
  }

  // Arms: down at the sides standing, up in front at the bottom of the squat.
  for (const side of [-1, 1]) {
    const shoulder = [50 + side * (tw - 1), shoulderY + 3];
    const hand = [50 + side * (22 - t * 13), hipY + 2 - t * 26];
    const elbow = [50 + side * (19 - t * 3), shoulderY + 12 - t * 7];
    parts.push(...limb(`M${f(shoulder[0])},${f(shoulder[1])} Q${f(elbow[0])},${f(elbow[1])} ${f(hand[0])},${f(hand[1])}`, 8.5, p.skin, p.skinShade, p.skinLight));
    // Sleeve cap.
    parts.push({ d: ellipse(shoulder[0] + side * 1.5, shoulder[1] + 1.5, 4.8, 4.2), fill: female ? p.skin : p.top });
    parts.push({ d: ellipse(hand[0], hand[1], 4.6, 4.6), fill: p.skin });
    parts.push({ d: ellipse(hand[0] - 1, hand[1] - 1, 1.6, 1.4), fill: p.skinLight, opacity: 0.7 });
  }

  // Neck and head.
  parts.push({ d: line([[50, headY + 9], [50, shoulderY + 1]]), stroke: p.skinShade, width: 7 });
  parts.push({ d: ellipse(50, headY, 16, 15.5), fill: 'grad:skin', box: [50, headY, 16] });

  // Hair.
  if (female) {
    parts.push({ d: `M34,${f(headY + 2)} Q33.5,${f(headY - 18)} 50,${f(headY - 14)} Q66.5,${f(headY - 18)} 66,${f(headY + 2)} Q60,${f(headY - 7)} 50,${f(headY - 6)} Q40,${f(headY - 7)} 36.5,${f(headY + 2)} Z`, fill: p.hair });
    parts.push({ d: curve([38, headY - 1], [37.5, headY + 8], [40, headY + 11]), stroke: p.hair, width: 3.2 });
    parts.push({ d: curve([44, headY - 11], [50, headY - 13], [56, headY - 11]), stroke: p.hairLight, width: 1.6, opacity: 0.7 });
  } else {
    parts.push({ d: `M34.2,${f(headY - 1)} Q34.5,${f(headY - 18)} 50,${f(headY - 18)} Q65.5,${f(headY - 18)} 65.8,${f(headY - 1)} Q59,${f(headY - 10)} 50,${f(headY - 9)} Q41,${f(headY - 10)} 34.2,${f(headY - 1)} Z`, fill: p.hair });
    parts.push({ d: curve([42, headY - 11], [48, headY - 14], [56, headY - 12]), stroke: p.hairLight, width: 1.6, opacity: 0.7 });
  }
  // Sweatband.
  parts.push({ d: curve([34.5, headY - 5], [50, headY - 11], [65.5, headY - 5]), stroke: p.band, width: 2.6 });

  // Face: gentle eyes, a smile that turns determined at the bottom.
  for (const side of [-1, 1]) {
    parts.push({ d: ellipse(50 + side * 6, headY + 3, 2, 2.4), fill: '#2A1E1A' });
    parts.push({ d: ellipse(50 + side * 6 - 0.6, headY + 2.1, 0.7, 0.7), fill: '#FFFFFF' });
    parts.push({ d: ellipse(50 + side * 10, headY + 8, 3, 1.8), fill: '#FF8FA3', opacity: 0.45 });
  }
  parts.push({ d: curve([46, headY + 9], [50, headY + 12 - t * 2], [54, headY + 9]), stroke: '#8C3B2E', width: 1.3 });

  return parts;
}

module.exports = { W, H, GRADIENTS, figure };
