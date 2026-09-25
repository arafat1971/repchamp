import { angleAt, clamp, midpoint, tiltFromHorizontal } from './geometry';
import { getKeypoint } from './keypoints';
import type { KeypointName, Pose } from './keypoints';

/**
 * Camera yoga: a pose is judged by the joint angles it is made of, not by
 * counting a movement. Each pose is a handful of angle targets (front knee at
 * ~100°, arms level at the shoulder…) and the reading is how close the body is
 * to all of them at once. The same 17 MoveNet keypoints and the same pipeline
 * as rep counting — only the maths on top differs.
 *
 * Pure: no camera, no clock. Everything here is testable from a synthetic pose.
 */

/** The four angles a pose is described with. */
export type JointKind = 'knee' | 'hip' | 'elbow' | 'shoulder';

type BodySide = 'left' | 'right';

/** Vertex in the middle: the angle is measured at the second joint. */
function triple(kind: JointKind, side: BodySide): readonly [KeypointName, KeypointName, KeypointName] {
  switch (kind) {
    case 'knee':
      return [`${side}Hip`, `${side}Knee`, `${side}Ankle`];
    case 'hip':
      return [`${side}Shoulder`, `${side}Hip`, `${side}Knee`];
    case 'elbow':
      return [`${side}Shoulder`, `${side}Elbow`, `${side}Wrist`];
    case 'shoulder':
      return [`${side}Hip`, `${side}Shoulder`, `${side}Elbow`];
  }
}

/**
 * One angle a pose needs.
 *
 * `side` says which limb: `both` applies the target to the left and right
 * alike; `A` and `B` are the two halves of an asymmetric pose (the bent and the
 * straight leg of Warrior II). Which physical side is A is decided per frame —
 * whichever assignment fits better — so a pose can be done facing either way.
 */
export interface AngleTarget {
  joint: JointKind;
  side: 'both' | 'A' | 'B';
  /** Degrees, 0..180, interior angle at the joint. */
  target: number;
  /** Within this many degrees counts as spot on. */
  tolerance: number;
  /** Cue when the angle is too small — the joint needs to open. */
  open: string;
  /** Cue when the angle is too large — the joint needs to close. */
  close: string;
  weight?: number;
}

/** The torso line's tilt from horizontal: 90 is upright, 0 is lying flat. */
export interface TorsoTarget {
  joint: 'torso';
  target: number;
  tolerance: number;
  /** Too flat — lift. */
  open: string;
  /** Too upright — fold. */
  close: string;
  weight?: number;
}

export type PoseTarget = AngleTarget | TorsoTarget;

export type YogaLevel = 'beginner' | 'intermediate' | 'advanced';

/** A stick figure in a 100×100 box, for the "this is the shape" picture. */
export interface Figure {
  head: readonly [number, number];
  ls: readonly [number, number];
  rs: readonly [number, number];
  le: readonly [number, number];
  re: readonly [number, number];
  lw: readonly [number, number];
  rw: readonly [number, number];
  lh: readonly [number, number];
  rh: readonly [number, number];
  lk: readonly [number, number];
  rk: readonly [number, number];
  la: readonly [number, number];
  ra: readonly [number, number];
}

export interface YogaPose {
  id: YogaPoseId;
  name: string;
  sanskrit: string;
  level: YogaLevel;
  /** How to stand to the camera: facing it, or side-on. */
  view: 'front' | 'side';
  /** One line on how to get into it. */
  setup: string;
  targets: readonly PoseTarget[];
  figure: Figure;
}

export type YogaPoseId =
  | 'mountain'
  | 'tree'
  | 'chair'
  | 'warrior1'
  | 'warrior2'
  | 'triangle'
  | 'side-angle'
  | 'goddess'
  | 'plank'
  | 'down-dog'
  | 'cobra'
  | 'warrior3'
  | 'boat';

/* Reused targets. */
const upright = (tolerance = 10): TorsoTarget => ({
  joint: 'torso',
  target: 90,
  tolerance,
  open: 'Stand tall — stack your shoulders over your hips',
  close: 'Stand tall — stack your shoulders over your hips',
});
const straightLegs: AngleTarget = { joint: 'knee', side: 'both', target: 175, tolerance: 10, open: 'Straighten your legs', close: 'Straighten your legs' };
const straightArms: AngleTarget = { joint: 'elbow', side: 'both', target: 170, tolerance: 15, open: 'Straighten your arms', close: 'Straighten your arms', weight: 0.6 };
const armsOverhead: AngleTarget = { joint: 'shoulder', side: 'both', target: 165, tolerance: 20, open: 'Reach your arms higher, up by your ears', close: 'Bring your arms up by your ears' };
const armsLevel: AngleTarget = { joint: 'shoulder', side: 'both', target: 90, tolerance: 15, open: 'Lift your arms level with your shoulders', close: 'Lower your arms to shoulder height' };

export const YOGA_POSES: Readonly<Record<YogaPoseId, YogaPose>> = {
  mountain: {
    id: 'mountain',
    name: 'Mountain',
    sanskrit: 'Tadasana',
    level: 'beginner',
    view: 'front',
    setup: 'Feet together, arms by your sides, crown of the head lifting.',
    targets: [
      straightLegs,
      { joint: 'hip', side: 'both', target: 175, tolerance: 10, open: 'Press your hips forward, stand straight', close: 'Press your hips forward, stand straight' },
      { joint: 'shoulder', side: 'both', target: 12, tolerance: 14, open: 'Let your arms rest by your sides', close: 'Let your arms rest by your sides' },
      upright(),
    ],
    figure: { head: [50, 12], ls: [42, 24], rs: [58, 24], le: [40, 40], re: [60, 40], lw: [39, 55], rw: [61, 55], lh: [45, 52], rh: [55, 52], lk: [45, 72], rk: [55, 72], la: [45, 92], ra: [55, 92] },
  },
  tree: {
    id: 'tree',
    name: 'Tree',
    sanskrit: 'Vrksasana',
    level: 'beginner',
    view: 'front',
    setup: 'Stand on one leg, sole of the other foot on the inner thigh, arms overhead.',
    targets: [
      { joint: 'knee', side: 'A', target: 175, tolerance: 10, open: 'Straighten your standing leg', close: 'Straighten your standing leg', weight: 1.2 },
      { joint: 'knee', side: 'B', target: 55, tolerance: 25, open: 'Draw your foot higher up the thigh', close: 'Bend your lifted knee more', weight: 1.2 },
      { joint: 'hip', side: 'B', target: 135, tolerance: 25, open: 'Open your bent knee out to the side', close: 'Open your bent knee out to the side' },
      armsOverhead,
      upright(12),
    ],
    figure: { head: [50, 22], ls: [42, 32], rs: [58, 32], le: [41, 18], re: [59, 18], lw: [48, 6], rw: [52, 6], lh: [45, 56], rh: [55, 56], lk: [45, 75], rk: [68, 67], la: [45, 94], ra: [48, 70] },
  },
  chair: {
    id: 'chair',
    name: 'Chair',
    sanskrit: 'Utkatasana',
    level: 'beginner',
    view: 'side',
    setup: 'Side-on to the camera. Sit back as if into a chair, arms reaching up.',
    targets: [
      { joint: 'knee', side: 'both', target: 110, tolerance: 15, open: 'Rise up a little', close: 'Sit lower, as if into a chair', weight: 1.3 },
      { joint: 'hip', side: 'both', target: 95, tolerance: 18, open: 'Lift your chest', close: 'Sit your hips further back' },
      armsOverhead,
    ],
    figure: { head: [40, 26], ls: [44, 36], rs: [44, 36], le: [36, 20], re: [36, 20], lw: [30, 8], rw: [30, 8], lh: [56, 62], rh: [56, 62], lk: [34, 72], rk: [34, 72], la: [45, 92], ra: [45, 92] },
  },
  warrior1: {
    id: 'warrior1',
    name: 'Warrior I',
    sanskrit: 'Virabhadrasana I',
    level: 'intermediate',
    view: 'side',
    setup: 'Side-on. Long stride, bend the front knee over the ankle, arms overhead.',
    targets: [
      { joint: 'knee', side: 'A', target: 105, tolerance: 15, open: 'Ease out of the front knee a little', close: 'Bend deeper into your front knee', weight: 1.3 },
      { joint: 'knee', side: 'B', target: 172, tolerance: 12, open: 'Straighten your back leg', close: 'Straighten your back leg' },
      armsOverhead,
      { joint: 'torso', target: 85, tolerance: 12, open: 'Lift your chest upright', close: 'Lift your chest upright' },
    ],
    figure: { head: [42, 20], ls: [44, 30], rs: [44, 30], le: [42, 16], re: [42, 16], lw: [40, 4], rw: [40, 4], lh: [48, 56], rh: [48, 56], lk: [30, 62], rk: [66, 73], la: [30, 92], ra: [82, 92] },
  },
  warrior2: {
    id: 'warrior2',
    name: 'Warrior II',
    sanskrit: 'Virabhadrasana II',
    level: 'beginner',
    view: 'front',
    setup: 'Face the camera, feet wide. Bend one knee, arms stretched level.',
    targets: [
      { joint: 'knee', side: 'A', target: 100, tolerance: 15, open: 'Ease out of the front knee a little', close: 'Bend deeper into your front knee', weight: 1.3 },
      { joint: 'knee', side: 'B', target: 172, tolerance: 12, open: 'Straighten your back leg', close: 'Straighten your back leg' },
      armsLevel,
      straightArms,
      upright(12),
    ],
    figure: { head: [50, 16], ls: [43, 28], rs: [57, 28], le: [28, 28], re: [72, 28], lw: [12, 28], rw: [88, 28], lh: [46, 55], rh: [54, 55], lk: [28, 60], rk: [70, 73], la: [26, 92], ra: [85, 92] },
  },
  triangle: {
    id: 'triangle',
    name: 'Triangle',
    sanskrit: 'Trikonasana',
    level: 'intermediate',
    view: 'front',
    setup: 'Face the camera, legs wide and straight. Tip sideways, one hand down, one up.',
    targets: [
      straightLegs,
      { joint: 'torso', target: 25, tolerance: 18, open: 'Lift out of the hip a little', close: 'Tip further over your front leg' },
      { joint: 'shoulder', side: 'both', target: 95, tolerance: 22, open: 'Reach your arms long, one up and one down', close: 'Reach your arms long, one up and one down' },
      straightArms,
    ],
    figure: { head: [24, 36], ls: [32, 44], rs: [38, 30], le: [30, 58], re: [40, 16], lw: [28, 70], rw: [42, 4], lh: [46, 55], rh: [54, 55], lk: [36, 72], rk: [64, 72], la: [26, 92], ra: [74, 92] },
  },
  'side-angle': {
    id: 'side-angle',
    name: 'Extended Side Angle',
    sanskrit: 'Utthita Parsvakonasana',
    level: 'advanced',
    view: 'front',
    setup: 'From Warrior II, lower your forearm to the front thigh, top arm over the ear.',
    targets: [
      { joint: 'knee', side: 'A', target: 100, tolerance: 15, open: 'Ease out of the front knee a little', close: 'Bend deeper into your front knee', weight: 1.3 },
      { joint: 'knee', side: 'B', target: 172, tolerance: 12, open: 'Straighten your back leg', close: 'Straighten your back leg' },
      { joint: 'torso', target: 30, tolerance: 15, open: 'Lift out of the hip a little', close: 'Lean further over your front knee' },
      { joint: 'shoulder', side: 'B', target: 165, tolerance: 22, open: 'Reach your top arm over your ear', close: 'Reach your top arm over your ear' },
    ],
    figure: { head: [26, 34], ls: [30, 42], rs: [38, 30], le: [30, 55], re: [28, 16], lw: [34, 60], rw: [16, 6], lh: [46, 56], rh: [54, 56], lk: [28, 60], rk: [70, 73], la: [26, 92], ra: [85, 92] },
  },
  goddess: {
    id: 'goddess',
    name: 'Goddess',
    sanskrit: 'Utkata Konasana',
    level: 'intermediate',
    view: 'front',
    setup: 'Face the camera, feet wide and turned out. Sink low, elbows bent up like a cactus.',
    targets: [
      { joint: 'knee', side: 'both', target: 105, tolerance: 15, open: 'Rise up a little', close: 'Sink lower, knees over toes', weight: 1.3 },
      { joint: 'elbow', side: 'both', target: 90, tolerance: 20, open: 'Open your elbows to a right angle', close: 'Bend your elbows to a right angle' },
      armsLevel,
      upright(),
    ],
    figure: { head: [50, 16], ls: [43, 28], rs: [57, 28], le: [30, 28], re: [70, 28], lw: [30, 14], rw: [70, 14], lh: [45, 55], rh: [55, 55], lk: [28, 66], rk: [72, 66], la: [30, 92], ra: [70, 92] },
  },
  plank: {
    id: 'plank',
    name: 'Plank',
    sanskrit: 'Phalakasana',
    level: 'intermediate',
    view: 'side',
    setup: 'Side-on. Hands under shoulders, one straight line from head to heels.',
    targets: [
      { joint: 'hip', side: 'both', target: 172, tolerance: 10, open: 'Lift your hips into one straight line', close: 'Lower your hips into one straight line', weight: 1.4 },
      straightLegs,
      straightArms,
      { joint: 'shoulder', side: 'both', target: 80, tolerance: 15, open: 'Hands under your shoulders', close: 'Hands under your shoulders' },
      { joint: 'torso', target: 12, tolerance: 12, open: 'Lower your chest in line', close: 'Lower your chest in line' },
    ],
    figure: { head: [14, 54], ls: [22, 58], rs: [22, 58], le: [21, 70], re: [21, 70], lw: [20, 82], rw: [20, 82], lh: [52, 64], rh: [52, 64], lk: [70, 70], rk: [70, 70], la: [88, 76], ra: [88, 76] },
  },
  'down-dog': {
    id: 'down-dog',
    name: 'Downward Dog',
    sanskrit: 'Adho Mukha Svanasana',
    level: 'intermediate',
    view: 'side',
    setup: 'Side-on. Hands and feet down, hips high, an upside-down V.',
    targets: [
      { joint: 'hip', side: 'both', target: 75, tolerance: 20, open: 'Walk your hands a little forward', close: 'Lift your hips higher', weight: 1.3 },
      straightLegs,
      straightArms,
      { joint: 'shoulder', side: 'both', target: 170, tolerance: 15, open: 'Push the floor away, arms in line with your back', close: 'Push the floor away, arms in line with your back' },
    ],
    figure: { head: [26, 70], ls: [32, 62], rs: [32, 62], le: [25, 75], re: [25, 75], lw: [18, 88], rw: [18, 88], lh: [55, 30], rh: [55, 30], lk: [70, 58], rk: [70, 58], la: [82, 88], ra: [82, 88] },
  },
  cobra: {
    id: 'cobra',
    name: 'Cobra',
    sanskrit: 'Bhujangasana',
    level: 'beginner',
    view: 'side',
    setup: 'Side-on, lying face down. Press through the hands and lift the chest.',
    targets: [
      { joint: 'hip', side: 'both', target: 140, tolerance: 20, open: 'Lift your chest higher', close: 'Keep your hips on the floor', weight: 1.3 },
      straightLegs,
      { joint: 'elbow', side: 'both', target: 160, tolerance: 25, open: 'Press up through your hands', close: 'Soften your elbows', weight: 0.6 },
      { joint: 'torso', target: 35, tolerance: 15, open: 'Lift your chest higher', close: 'Lower a little, keep your hips down' },
    ],
    figure: { head: [24, 50], ls: [30, 62], rs: [30, 62], le: [28, 76], re: [28, 76], lw: [26, 88], rw: [26, 88], lh: [52, 84], rh: [52, 84], lk: [70, 88], rk: [70, 88], la: [88, 90], ra: [88, 90] },
  },
  warrior3: {
    id: 'warrior3',
    name: 'Warrior III',
    sanskrit: 'Virabhadrasana III',
    level: 'advanced',
    view: 'side',
    setup: 'Side-on. Balance on one leg, body and back leg level like a T, arms forward.',
    targets: [
      { joint: 'knee', side: 'A', target: 172, tolerance: 10, open: 'Straighten your standing leg', close: 'Straighten your standing leg' },
      { joint: 'hip', side: 'A', target: 90, tolerance: 20, open: 'Tip your chest further forward', close: 'Lift your chest a little' },
      { joint: 'hip', side: 'B', target: 170, tolerance: 15, open: 'Lift your back leg level with your hips', close: 'Lower your back leg level with your hips', weight: 1.3 },
      { joint: 'knee', side: 'B', target: 172, tolerance: 12, open: 'Straighten your back leg', close: 'Straighten your back leg' },
      { joint: 'torso', target: 10, tolerance: 15, open: 'Lower your chest level with the floor', close: 'Lower your chest level with the floor' },
    ],
    figure: { head: [22, 48], ls: [32, 50], rs: [32, 50], le: [18, 50], re: [18, 50], lw: [6, 50], rw: [6, 50], lh: [55, 52], rh: [55, 52], lk: [55, 72], rk: [74, 52], la: [55, 92], ra: [92, 52] },
  },
  boat: {
    id: 'boat',
    name: 'Boat',
    sanskrit: 'Navasana',
    level: 'advanced',
    view: 'side',
    setup: 'Side-on, seated. Lean back, lift straight legs, arms reaching forward.',
    targets: [
      { joint: 'hip', side: 'both', target: 70, tolerance: 20, open: 'Lean back a little more', close: 'Lift your legs and chest closer', weight: 1.3 },
      { joint: 'knee', side: 'both', target: 165, tolerance: 20, open: 'Straighten your legs if you can', close: 'Straighten your legs if you can' },
      { joint: 'torso', target: 50, tolerance: 15, open: 'Lift your chest', close: 'Lean back a little' },
    ],
    figure: { head: [70, 34], ls: [66, 44], rs: [66, 44], le: [53, 50], re: [53, 50], lw: [40, 52], rw: [40, 52], lh: [56, 70], rh: [56, 70], lk: [38, 50], rk: [38, 50], la: [24, 38], ra: [24, 38] },
  },
};

/** The figure done the other way round — for the "other side" half of a flow. */
export function mirrorFigure(f: Figure): Figure {
  const m = (p: readonly [number, number]) => [100 - p[0], p[1]] as const;
  return {
    head: m(f.head), ls: m(f.rs), rs: m(f.ls), le: m(f.re), re: m(f.le), lw: m(f.rw), rw: m(f.lw),
    lh: m(f.rh), rh: m(f.lh), lk: m(f.rk), rk: m(f.lk), la: m(f.ra), ra: m(f.la),
  };
}

/** The figure to show for a flow step: mirrored on its second side. */
export function stepFigure(step: FlowStep): Figure {
  const f = YOGA_POSES[step.pose].figure;
  return step.switchSide ? mirrorFigure(f) : f;
}

export function getYogaPose(id: YogaPoseId): YogaPose {
  return YOGA_POSES[id];
}

/* ------------------------------------------------------------------ *
 * Reading a frame
 * ------------------------------------------------------------------ */

/** Past tolerance, a target's score falls to zero across this many degrees. */
const FALLOFF_DEG = 35;

/** Fewer than this share of targets visible and the frame is not judged. */
const MIN_MEASURED = 0.6;

export const OUT_OF_FRAME_CUE = 'Step back so your whole body is in frame';
export const SWITCH_SIDE_CUE = 'Now switch to the other side';

export interface PoseReading {
  /** 0..1 how close the body is to the pose, or null when too little is visible. */
  match: number | null;
  /** Share of the pose's targets the camera could measure, 0..1. */
  visibility: number;
  /** The one correction that would help most, or null when it's all close. */
  cue: string | null;
  /** For asymmetric poses, the body side playing the "A" role (the bent / standing leg). */
  side: BodySide | null;
}

function angleOf(pose: Pose, kind: JointKind, side: BodySide): number | null {
  const [a, b, c] = triple(kind, side);
  const ka = getKeypoint(pose, a);
  const kb = getKeypoint(pose, b);
  const kc = getKeypoint(pose, c);
  if (!ka || !kb || !kc) return null;
  return angleAt(ka, kb, kc);
}

/** Torso tilt from horizontal, from whichever shoulders and hips are visible. */
export function torsoTilt(pose: Pose): number | null {
  const ls = getKeypoint(pose, 'leftShoulder');
  const rs = getKeypoint(pose, 'rightShoulder');
  const lh = getKeypoint(pose, 'leftHip');
  const rh = getKeypoint(pose, 'rightHip');
  const shoulder = ls && rs ? midpoint(ls, rs) : (ls ?? rs);
  const hip = lh && rh ? midpoint(lh, rh) : (lh ?? rh);
  if (!shoulder || !hip) return null;
  return tiltFromHorizontal(shoulder, hip);
}

/** 1 inside the tolerance, falling linearly to 0 over `FALLOFF_DEG` beyond it. */
export function targetScore(angle: number, target: number, tolerance: number): number {
  const over = Math.abs(angle - target) - tolerance;
  if (over <= 0) return 1;
  return clamp(1 - over / FALLOFF_DEG, 0, 1);
}

interface Scored {
  score: number;
  weight: number;
  cue: string | null;
}

function scoreTargets(pose: Pose, targets: readonly PoseTarget[], sideA: BodySide): { scored: Scored[]; total: number } {
  const sideB: BodySide = sideA === 'left' ? 'right' : 'left';
  const scored: Scored[] = [];
  let total = 0;
  for (const t of targets) {
    const weight = t.weight ?? 1;
    const measure = (angle: number | null) => {
      total += 1;
      if (angle === null) return;
      const score = targetScore(angle, t.target, t.tolerance);
      const cue = score >= 0.8 ? null : angle < t.target ? t.open : t.close;
      scored.push({ score, weight, cue });
    };
    if (t.joint === 'torso') {
      measure(torsoTilt(pose));
    } else if (t.side === 'both') {
      measure(angleOf(pose, t.joint, 'left'));
      measure(angleOf(pose, t.joint, 'right'));
    } else {
      measure(angleOf(pose, t.joint, t.side === 'A' ? sideA : sideB));
    }
  }
  return { scored, total };
}

function summarise(scored: Scored[], total: number): { match: number | null; visibility: number; cue: string | null } {
  const visibility = total === 0 ? 0 : scored.length / total;
  if (visibility < MIN_MEASURED) return { match: null, visibility, cue: OUT_OF_FRAME_CUE };
  let sum = 0;
  let weights = 0;
  let worst: Scored | null = null;
  for (const s of scored) {
    sum += s.score * s.weight;
    weights += s.weight;
    // The heaviest shortfall is the one worth saying out loud.
    if (s.cue && (!worst || (1 - s.score) * s.weight > (1 - worst.score) * worst.weight)) worst = s;
  }
  return { match: weights === 0 ? null : sum / weights, visibility, cue: worst?.cue ?? null };
}

function isAsymmetric(targets: readonly PoseTarget[]): boolean {
  return targets.some((t) => t.joint !== 'torso' && t.side !== 'both');
}

/**
 * How close this frame is to `yoga`.
 *
 * An asymmetric pose is tried both ways round — left leg bent, then right — and
 * the better fit wins, unless `only` pins the side (the "now the other side"
 * half of a flow, so doing the same side twice doesn't count).
 */
export function readPose(pose: Pose, yoga: YogaPose, only?: BodySide): PoseReading {
  if (!isAsymmetric(yoga.targets)) {
    const { scored, total } = scoreTargets(pose, yoga.targets, 'left');
    return { ...summarise(scored, total), side: null };
  }
  const bySide = (side: BodySide): PoseReading => {
    const { scored, total } = scoreTargets(pose, yoga.targets, side);
    return { ...summarise(scored, total), side };
  };
  const left = bySide('left');
  const right = bySide('right');
  const best = (right.match ?? -1) > (left.match ?? -1) ? right : left;
  if (!only || best.side === only) return best;

  // Pinned to a side, but the body is clearly doing the other one: the arms and
  // torso still match either way, so without this the same side done twice
  // would read as a near-miss rather than as the wrong side.
  const pinned = only === 'left' ? left : right;
  if ((best.match ?? 0) - (pinned.match ?? 0) > 0.1) {
    return { ...pinned, match: Math.min(pinned.match ?? 0, 0.4), cue: SWITCH_SIDE_CUE };
  }
  return pinned;
}

/* ------------------------------------------------------------------ *
 * Holding a pose
 * ------------------------------------------------------------------ */

export interface HoldUpdate {
  /** Smoothed 0..1 match. */
  match: number;
  inPose: boolean;
  heldMs: number;
  /** 0..1 toward the hold target. */
  progress: number;
  done: boolean;
}

export interface HoldSummary {
  heldMs: number;
  /** Mean smoothed match while in the pose, 0..1. 0 when never reached. */
  alignment: number;
  /** Best smoothed match seen at any point. */
  best: number;
}

/**
 * Times a hold. The match is smoothed (a single twitchy frame shouldn't drop you
 * out), you're "in" once it clears `enter`, and you stay in until it sits under
 * `exit` for longer than the grace period — a wobble in Tree isn't a fall.
 * Hold time only accrues while in; alignment is averaged over that time.
 */
export class HoldTracker {
  private smoothed = 0;
  private primed = false;
  private lastT: number | null = null;
  private inPose = false;
  private belowSince: number | null = null;
  private heldMs = 0;
  private alignSum = 0;
  private best = 0;

  constructor(
    readonly targetMs: number,
    private readonly opts: { enter?: number; exit?: number; graceMs?: number; smoothingMs?: number } = {},
  ) {}

  push(match: number | null, t: number): HoldUpdate {
    const enter = this.opts.enter ?? 0.72;
    const exit = this.opts.exit ?? 0.58;
    const grace = this.opts.graceMs ?? 900;
    const tau = this.opts.smoothingMs ?? 300;
    const value = match ?? 0;

    // Capped so a stall (camera hiccup, app backgrounded) can't bank seconds.
    const dt = this.lastT === null ? 0 : clamp(t - this.lastT, 0, 250);
    this.lastT = t;
    this.smoothed = this.primed ? this.smoothed + (value - this.smoothed) * (1 - Math.exp(-dt / tau)) : value;
    this.primed = true;
    this.best = Math.max(this.best, this.smoothed);

    if (this.inPose) {
      this.heldMs += dt;
      this.alignSum += this.smoothed * dt;
      if (this.smoothed < exit) {
        if (this.belowSince === null) this.belowSince = t;
        if (t - this.belowSince > grace) {
          this.inPose = false;
          this.belowSince = null;
        }
      } else {
        this.belowSince = null;
      }
    } else if (this.smoothed >= enter) {
      this.inPose = true;
      this.belowSince = null;
    }

    const heldMs = Math.min(this.heldMs, this.targetMs);
    return {
      match: this.smoothed,
      inPose: this.inPose,
      heldMs,
      progress: this.targetMs === 0 ? 1 : heldMs / this.targetMs,
      done: this.heldMs >= this.targetMs,
    };
  }

  /** After a pause: the next frame starts a fresh interval rather than bridging the gap. */
  resume(): void {
    this.lastT = null;
  }

  summary(): HoldSummary {
    return {
      heldMs: Math.min(this.heldMs, this.targetMs),
      alignment: this.heldMs === 0 ? 0 : this.alignSum / this.heldMs,
      best: this.best,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Flows
 * ------------------------------------------------------------------ */

export interface FlowStep {
  pose: YogaPoseId;
  holdSec: number;
  /** The second side of an asymmetric pose: must be done the other way round. */
  switchSide?: boolean;
}

export interface YogaFlow {
  id: string;
  title: string;
  level: YogaLevel;
  blurb: string;
  steps: readonly FlowStep[];
}

/** Both sides of an asymmetric pose, in order. */
function sides(pose: YogaPoseId, holdSec: number): FlowStep[] {
  return [
    { pose, holdSec },
    { pose, holdSec, switchSide: true },
  ];
}

export const YOGA_FLOWS: readonly YogaFlow[] = [
  {
    id: 'wake-up',
    title: 'Morning wake-up',
    level: 'beginner',
    blurb: 'Standing poses to open up the body. Gentle and steady.',
    steps: [
      { pose: 'mountain', holdSec: 20 },
      { pose: 'chair', holdSec: 20 },
      ...sides('warrior2', 25),
      ...sides('tree', 25),
      { pose: 'mountain', holdSec: 20 },
    ],
  },
  {
    id: 'strength-balance',
    title: 'Strength & balance',
    level: 'intermediate',
    blurb: 'Longer holds through the warriors, triangle and goddess.',
    steps: [
      { pose: 'mountain', holdSec: 15 },
      { pose: 'chair', holdSec: 30 },
      ...sides('warrior1', 30),
      ...sides('warrior2', 30),
      ...sides('triangle', 30),
      { pose: 'goddess', holdSec: 30 },
      ...sides('tree', 40),
      { pose: 'mountain', holdSec: 15 },
    ],
  },
  {
    id: 'power',
    title: 'Advanced power flow',
    level: 'advanced',
    blurb: 'Plank to dog to cobra, deep lunges, Warrior III and boat.',
    steps: [
      { pose: 'plank', holdSec: 30 },
      { pose: 'down-dog', holdSec: 40 },
      { pose: 'cobra', holdSec: 30 },
      { pose: 'down-dog', holdSec: 30 },
      ...sides('warrior1', 40),
      ...sides('side-angle', 40),
      ...sides('warrior3', 25),
      { pose: 'boat', holdSec: 30 },
      ...sides('tree', 45),
      { pose: 'mountain', holdSec: 20 },
    ],
  },
  {
    id: 'balance-mastery',
    title: 'Balance mastery',
    level: 'advanced',
    blurb: 'Long single-leg holds and a strong core. Stillness under load.',
    steps: [
      { pose: 'mountain', holdSec: 20 },
      ...sides('tree', 60),
      ...sides('warrior3', 40),
      { pose: 'chair', holdSec: 45 },
      { pose: 'boat', holdSec: 45 },
      { pose: 'mountain', holdSec: 20 },
    ],
  },
];

export function getFlow(id: string): YogaFlow | undefined {
  return YOGA_FLOWS.find((f) => f.id === id);
}

/** Rough length of a flow in minutes, including the gaps between poses. */
export function flowMinutes(flow: YogaFlow, restSec = 8): number {
  const sec = flow.steps.reduce((acc, s) => acc + s.holdSec + restSec, 0);
  return Math.max(1, Math.round(sec / 60));
}

export interface StepResult {
  pose: YogaPoseId;
  heldMs: number;
  targetMs: number;
  /** 0..1 */
  alignment: number;
  skipped: boolean;
}

/**
 * The session's score, 0..100: alignment over the held poses, scaled by how
 * much of the planned holding was actually done. Skipping half the flow can't
 * score like finishing it.
 */
export function flowScore(results: readonly StepResult[]): number {
  if (results.length === 0) return 0;
  const target = results.reduce((a, r) => a + r.targetMs, 0);
  const held = results.reduce((a, r) => a + r.heldMs, 0);
  if (target === 0 || held === 0) return 0;
  const alignment = results.reduce((a, r) => a + r.alignment * r.heldMs, 0) / held;
  return Math.round(clamp(alignment * (held / target), 0, 1) * 100);
}
