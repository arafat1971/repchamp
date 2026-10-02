/**
 * The Reps widget's athlete: a realistic, adult-proportioned figure doing a
 * push-up, side view, facing left — a man or a woman. Path data in a 140 x 92
 * box, in the part format the widget and app writers share:
 * { d, fill | stroke, width, opacity, gradient? } where `gradient` is a linear
 * gradient in box coordinates ({ x1, y1, x2, y2, stops }).
 *
 * The body is one anatomical silhouette built along the spine-to-heel line:
 * at each station (ankle, calf, knee, thigh, glute, waist, ribs, chest,
 * shoulder) it has its own thickness above and below the line, so calves,
 * glutes, back and chest read as real forms. Clothing is the same silhouette
 * over a span, a little inflated. Everything is lit from above: each shape
 * is shaded light-on-top to dark-underneath, with soft contact shadows where
 * hands and toes meet the floor.
 *
 * `figure(sex, k)` poses one rep at depth `k` (0 arms locked out, 1 chest
 * down): the plank pivots at the toes, the elbows fold back, the head stays
 * in line with the spine.
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

/** A vertical light: lighter on top, base colour, shadow underneath. */
function lit(y1, y2, top, base, bottom) {
  return { x1: 0, y1, x2: 0, y2, stops: [[0, top], [0.45, base], [1, bottom]] };
}

const LOOK = {
  male: {
    skin: ['#F0C39F', '#D9A07A', '#A86E4C'],
    hair: ['#3A3134', '#1C1719', '#0C0A0B'],
    top: ['#3A3A42', '#1C1C21', '#08080A'],
    bottom: ['#E2D2B2', '#C2AD86', '#8E7A58'],
    shoe: ['#FFFFFF', '#ECECF0', '#B9B9C2'],
    accent: '#FF5A36',
  },
  female: {
    skin: ['#F6CDB1', '#E2AA88', '#B57A5A'],
    hair: ['#6A4436', '#3A2420', '#1C1110'],
    top: ['#D9CBFF', '#B49CFA', '#7C61D9'],
    bottom: ['#3A3A46', '#18181F', '#060608'],
    shoe: ['#FFFFFF', '#ECECF0', '#B9B9C2'],
    accent: '#B49CFA',
  },
};

/*
 * The silhouette: [u, above, below] — u runs 0 (toes) to 1 (shoulder) along
 * the body line; above/below are thicknesses on the back side and the front
 * (floor) side.
 */
const BODY = {
  male: [
    [0.0, 1.6, 1.6],
    [0.06, 2.1, 2.0],
    [0.17, 3.6, 2.4],
    [0.29, 2.5, 2.6],
    [0.41, 3.6, 4.2],
    [0.52, 4.6, 4.0],
    [0.64, 3.9, 3.8],
    [0.78, 4.4, 5.6],
    [0.9, 4.8, 6.0],
    [0.98, 4.6, 4.4],
    [1.0, 3.2, 3.2],
  ],
  female: [
    [0.0, 1.5, 1.5],
    [0.06, 1.9, 1.8],
    [0.17, 3.2, 2.2],
    [0.29, 2.3, 2.4],
    [0.41, 3.4, 3.9],
    [0.52, 5.0, 3.8],
    [0.64, 3.4, 3.2],
    [0.78, 3.8, 4.8],
    [0.9, 4.2, 5.4],
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

function figure(sex = 'male', k = 0) {
  const female = sex === 'female';
  const p = LOOK[female ? 'female' : 'male'];
  const profile = BODY[female ? 'female' : 'male'];
  const t = Math.max(0, Math.min(1, k));

  const toe = [121, FLOOR - 2.2];
  const shoulder = [46, 49 + t * 19];
  const dx = shoulder[0] - toe[0];
  const dy = shoulder[1] - toe[1];
  const len = Math.hypot(dx, dy);
  const ax = dx / len;
  const ay = dy / len;
  // "Up" (the back side) is the normal pointing away from the floor.
  const nx = ay;
  const ny = -ax;
  const at = (u, off = 0) => [toe[0] + dx * u + nx * off, toe[1] + dy * u + ny * off];
  const slope = (Math.atan2(dy, dx) * 180) / Math.PI;

  /** The silhouette between u0 and u1, inflated by `grow` (clothing). */
  const span = (u0, u1, grow = 0, sag = 0) => {
    const top = [];
    const bot = [];
    const steps = Math.max(4, Math.round((u1 - u0) * 30));
    for (let i = 0; i <= steps; i++) {
      const u = u0 + ((u1 - u0) * i) / steps;
      const [a, b] = profileAt(profile, u);
      const hang = sag * Math.sin(((u - u0) / (u1 - u0 || 1)) * Math.PI);
      top.push(at(u, a + grow));
      bot.push(at(u, -(b + grow + hang)));
    }
    lastBounds = [...top, ...bot].reduce((m, q) => [Math.min(m[0], q[1]), Math.max(m[1], q[1])], [Infinity, -Infinity]);
    return smooth([...top, ...bot.reverse()]);
  };
  let lastBounds = [0, 0];
  /** A span, lit from above across its real height. */
  const lit3d = (u0, u1, grow, sag, colors) => {
    const d = span(u0, u1, grow, sag);
    return { d, fill: 'none', gradient: lit(lastBounds[0], lastBounds[1], colors[0], colors[1], colors[2]) };
  };
  const parts = [];

  // Floor: a long soft shadow, darker contact patches under hands and toes.
  parts.push({ d: ellipse(82, FLOOR + 2.4, 46, 3.2), fill: '#0B1020', opacity: 0.18 });
  parts.push({ d: ellipse(toe[0], FLOOR + 0.6, 6, 1.4), fill: '#0B1020', opacity: 0.35 });
  parts.push({ d: ellipse(44, FLOOR + 0.6, 5.5, 1.3), fill: '#0B1020', opacity: 0.35 });

  // Arm geometry, shared by both arms.
  const shoulderJoint = at(0.985, -1.5);
  const hand = [43.5, FLOOR - 1.6];
  const elbow = [shoulderJoint[0] + 2 + t * 9, shoulderJoint[1] + (hand[1] - shoulderJoint[1]) * 0.52 - t * 4];

  /** A tapered limb from a to b, widths wa → wb, lit from above. */
  const taper = (a, b, wa, wb, colors) => {
    const lx = b[0] - a[0];
    const ly = b[1] - a[1];
    const l = Math.hypot(lx, ly) || 1;
    const px = -ly / l;
    const py = lx / l;
    const pts = [
      [a[0] + px * wa, a[1] + py * wa],
      [(a[0] + b[0]) / 2 + px * (wa + wb) * 0.56, (a[1] + b[1]) / 2 + py * (wa + wb) * 0.56],
      [b[0] + px * wb, b[1] + py * wb],
      [b[0] - px * wb, b[1] - py * wb],
      [(a[0] + b[0]) / 2 - px * (wa + wb) * 0.56, (a[1] + b[1]) / 2 - py * (wa + wb) * 0.56],
      [a[0] - px * wa, a[1] - py * wa],
    ];
    const yMin = Math.min(a[1], b[1]) - Math.max(wa, wb);
    const yMax = Math.max(a[1], b[1]) + Math.max(wa, wb);
    return { d: smooth(pts), fill: 'none', gradient: lit(yMin, yMax, colors[0], colors[1], colors[2]) };
  };

  // Far arm, behind the body, in shadow.
  const farShift = [3.5, -0.6];
  const fs = (q) => [q[0] + farShift[0], q[1] + farShift[1]];
  const farSkin = [p.skin[1], p.skin[2], '#7E4E36'];
  parts.push(taper(fs(shoulderJoint), fs(elbow), 3.4, 2.7, farSkin));
  parts.push(taper(fs(elbow), fs(hand), 2.7, 1.9, farSkin));

  // Her ponytail falls from the crown towards the floor.
  const neck = at(1.0, 0.6);
  const head = [neck[0] - 6.5 + ax * 2, neck[1] - 4.6];

  // The body: skin first, then clothing over it.
  parts.push(lit3d(0.0, 1.0, 0, 0, p.skin));
  if (female) {
    parts.push(lit3d(0.36, 0.565, 0.35, 0, p.bottom));
    parts.push(lit3d(0.73, 1.0, 0.45, 0, p.top));
    // Waistband and the crop tank's hem, a seam of light along the top.
    parts.push({ d: `M${f(at(0.555, 4.6)[0])},${f(at(0.555, 4.6)[1])} L${f(at(0.555, -4)[0])},${f(at(0.555, -4)[1])}`, stroke: '#2C2C36', width: 1.1 });
    parts.push({ d: `M${f(at(0.75, 4.2)[0])},${f(at(0.75, 4.2)[1])} Q${f(at(0.86, 5.4)[0])},${f(at(0.86, 5.4)[1])} ${f(at(0.97, 4.6)[0])},${f(at(0.97, 4.6)[1])}`, stroke: '#EEE6FF', width: 0.7, opacity: 0.8 });
  } else {
    // Cargo joggers: loose, cuffed at the ankle, a side pocket and fold lines.
    parts.push(lit3d(0.04, 0.575, 0.8, 0, p.bottom));
    parts.push({ d: `M${f(at(0.06, 2.6)[0])},${f(at(0.06, 2.6)[1])} L${f(at(0.06, -2.6)[0])},${f(at(0.06, -2.6)[1])}`, stroke: '#8E7A58', width: 1.6 });
    const pk = at(0.4, 0.4);
    parts.push({ d: ellipse(pk[0], pk[1], 4.2, 2.6, slope), fill: '#A9946E', opacity: 0.9 });
    parts.push({ d: `M${f(pk[0] - 4)},${f(pk[1] - 1.6)} L${f(pk[0] + 4)},${f(pk[1] - 1.2)}`, stroke: '#8E7A58', width: 0.6 });
    for (const u of [0.22, 0.31, 0.47]) {
      const a = at(u, 2.2);
      const b = at(u - 0.025, -2.8);
      parts.push({ d: `M${f(a[0])},${f(a[1])} Q${f((a[0] + b[0]) / 2 + 1)},${f((a[1] + b[1]) / 2)} ${f(b[0])},${f(b[1])}`, stroke: '#A08B66', width: 0.55, opacity: 0.8 });
    }
    // Oversized tee: loose, hanging off the chest under gravity.
    parts.push(lit3d(0.5, 1.0, 1.2, 2.6, p.top));
    for (const u of [0.66, 0.8]) {
      const a = at(u, -1);
      const b = at(u + 0.03, -6.5);
      parts.push({ d: `M${f(a[0])},${f(a[1])} Q${f(a[0] - 1)},${f((a[1] + b[1]) / 2)} ${f(b[0])},${f(b[1])}`, stroke: '#000000', width: 0.6, opacity: 0.6 });
    }
    // The chain hanging down from the neck.
    const c0 = at(0.97, -2);
    parts.push({ d: `M${f(c0[0])},${f(c0[1])} Q${f(c0[0] + 1.6)},${f(c0[1] + 5 + t)} ${f(c0[0] + 4.6)},${f(c0[1] + 1)}`, stroke: '#D6DCE6', width: 0.7 });
  }

  // Chunky sneaker.
  parts.push({
    d: smooth([
      [toe[0] - 7.5, toe[1] - 2.2],
      [toe[0] - 2, toe[1] - 6.2],
      [toe[0] + 4.5, toe[1] - 3],
      [toe[0] + 6, toe[1] + 1.4],
      [toe[0] - 8, toe[1] + 1.6],
    ]),
    fill: 'none',
    gradient: lit(toe[1] - 6, toe[1] + 2, p.shoe[0], p.shoe[1], p.shoe[2]),
  });
  parts.push({ d: `M${f(toe[0] - 8)},${f(toe[1] + 1.4)} L${f(toe[0] + 6)},${f(toe[1] + 1.4)}`, stroke: '#D4D4DC', width: 1.6 });
  parts.push({ d: `M${f(toe[0] - 5)},${f(toe[1] - 2.4)} Q${f(toe[0] - 1)},${f(toe[1] - 4.6)} ${f(toe[0] + 3.4)},${f(toe[1] - 1.6)}`, stroke: p.accent, width: 0.9 });

  // Near arm: deltoid, upper arm, forearm, hand.
  parts.push(taper(shoulderJoint, elbow, 3.9, 3.0, p.skin));
  parts.push(taper(elbow, hand, 3.0, 2.1, p.skin));
  parts.push({ d: ellipse(shoulderJoint[0] + 0.5, shoulderJoint[1] + 0.8, 4.4, 3.8, slope), fill: 'none', gradient: lit(shoulderJoint[1] - 4, shoulderJoint[1] + 5, p.skin[0], p.skin[1], p.skin[2]) });
  if (!female) {
    // Sleeve over the deltoid.
    parts.push({ d: ellipse(shoulderJoint[0] + 1.6, shoulderJoint[1] + 1, 5.6, 4.6, slope + 10), fill: 'none', gradient: lit(shoulderJoint[1] - 5, shoulderJoint[1] + 6, p.top[0], p.top[1], p.top[2]) });
  }
  parts.push({ d: smooth([[hand[0] - 4.6, hand[1] + 1.4], [hand[0] - 3.4, hand[1] - 1.4], [hand[0] + 1.8, hand[1] - 1.8], [hand[0] + 2.4, hand[1] + 1.4]]), fill: 'none', gradient: lit(hand[1] - 2, hand[1] + 1.6, p.skin[0], p.skin[1], p.skin[2]) });

  // Neck and head, in line with the spine, a profile facing the floor ahead.
  parts.push(taper(at(0.985, 0.2), [head[0] + 3.2, head[1] + 2.8], 2.6, 2.4, p.skin));
  if (female) {
    const tie = [head[0] + 4.8, head[1] - 6.4];
    parts.push({
      d: smooth([
        [tie[0], tie[1] - 1.2],
        [tie[0] + 7, tie[1] - 1],
        [tie[0] + 11, tie[1] + 5 + t * 2],
        [tie[0] + 10, tie[1] + 12 + t * 2],
        [tie[0] + 7.5, tie[1] + 5 + t * 2],
        [tie[0] + 1, tie[1] + 1.4],
      ]),
      fill: 'none',
      gradient: lit(tie[1] - 2, tie[1] + 13, p.hair[0], p.hair[1], p.hair[2]),
    });
    parts.push({ d: ellipse(tie[0] + 0.6, tie[1], 1.7, 1.5, 30), fill: '#F27AA7' });
  }
  // Skull and face profile.
  parts.push({
    d: smooth([
      [head[0] + 6.4, head[1] - 2],
      [head[0] + 4.6, head[1] - 7.4],
      [head[0] - 1.6, head[1] - 7.8],
      [head[0] - 6, head[1] - 4],
      [head[0] - 7.2, head[1] - 0.6],
      [head[0] - 8.6, head[1] + 1.4],
      [head[0] - 7, head[1] + 2.4],
      [head[0] - 6.6, head[1] + 4.6],
      [head[0] - 3, head[1] + 7],
      [head[0] + 2.6, head[1] + 6.4],
      [head[0] + 6.2, head[1] + 3.6],
    ]),
    fill: 'none',
    gradient: lit(head[1] - 8, head[1] + 7, p.skin[0], p.skin[1], p.skin[2]),
  });
  // Ear.
  parts.push({ d: ellipse(head[0] + 2.6, head[1] + 0.6, 1.5, 2.1, -10), fill: p.skin[2], opacity: 0.7 });
  // Eye, brow, mouth line.
  parts.push({ d: `M${f(head[0] - 5.4)},${f(head[1] - 0.4)} Q${f(head[0] - 4.4)},${f(head[1] - 1.2)} ${f(head[0] - 3.4)},${f(head[1] - 0.5)}`, stroke: '#2A1C18', width: 0.8 });
  parts.push({ d: `M${f(head[0] - 6)},${f(head[1] - 2.6)} Q${f(head[0] - 4.4)},${f(head[1] - 3.4)} ${f(head[0] - 2.8)},${f(head[1] - 2.6)}`, stroke: p.hair[1], width: 0.9 });
  parts.push({ d: `M${f(head[0] - 6.4)},${f(head[1] + 4)} Q${f(head[0] - 5.4)},${f(head[1] + 4.4 - t * 0.6)} ${f(head[0] - 4.4)},${f(head[1] + 4)}`, stroke: '#9A5B48', width: 0.6 });

  if (female) {
    // Sleek pulled-back hair, a soft hairline, a gold hoop.
    parts.push({
      d: smooth([
        [head[0] - 5.6, head[1] - 3.4],
        [head[0] - 1.6, head[1] - 8.2],
        [head[0] + 4.8, head[1] - 7.8],
        [head[0] + 6.8, head[1] - 2.4],
        [head[0] + 5.6, head[1] + 1.6],
        [head[0] + 3.6, head[1] - 2.4],
        [head[0] - 0.4, head[1] - 4.6],
      ]),
      fill: 'none',
      gradient: lit(head[1] - 8, head[1] + 2, p.hair[0], p.hair[1], p.hair[2]),
    });
    parts.push({ d: `M${f(head[0] - 3)},${f(head[1] - 6.6)} Q${f(head[0] + 1.6)},${f(head[1] - 8)} ${f(head[0] + 5)},${f(head[1] - 5.4)}`, stroke: '#9C6A56', width: 0.5, opacity: 0.8 });
    parts.push({ d: ellipse(head[0] + 2.4, head[1] + 4.4, 1.3, 1.7), stroke: '#E8B84A', width: 0.6 });
  } else {
    // Textured curls on top, faded short at the sides.
    parts.push({
      d: smooth([
        [head[0] - 6.4, head[1] - 3],
        [head[0] - 4.6, head[1] - 8.6],
        [head[0] + 1, head[1] - 10],
        [head[0] + 6.2, head[1] - 7.2],
        [head[0] + 6.8, head[1] - 2.6],
        [head[0] + 4.4, head[1] - 3.2],
        [head[0] + 1, head[1] - 5.4],
        [head[0] - 3, head[1] - 4.8],
      ]),
      fill: 'none',
      gradient: lit(head[1] - 10, head[1] - 2, p.hair[0], p.hair[1], p.hair[2]),
    });
    for (const [cx, cy, r] of [[-4, -8, 1.6], [-1, -9.4, 1.8], [2.4, -9.2, 1.7], [5, -7.4, 1.5], [-5.6, -5.6, 1.3], [0.6, -7, 1.4]]) {
      parts.push({ d: ellipse(head[0] + cx, head[1] + cy, r, r * 0.9), fill: p.hair[1] });
      parts.push({ d: ellipse(head[0] + cx - 0.4, head[1] + cy - 0.5, r * 0.45, r * 0.35), fill: p.hair[0], opacity: 0.8 });
    }
    // Fade at the side, under the curls.
    parts.push({ d: smooth([[head[0] + 0.6, head[1] - 4.4], [head[0] + 5.6, head[1] - 3.6], [head[0] + 5.2, head[1] + 0.6], [head[0] + 1.2, head[1] - 1.4]]), fill: p.hair[1], opacity: 0.45 });
  }

  return parts;
}

module.exports = { W, H, figure };
