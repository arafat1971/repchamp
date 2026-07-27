import { KEYPOINT_COUNT, KEYPOINT_INDEX, type Keypoint, type Pose } from '../keypoints';
import type { KeypointName } from '../keypoints';

/**
 * Builds a synthetic pose so the rep logic can be tested without a camera.
 *
 * Every joint starts fully confident at a neutral position; `overrides` then
 * places the joints that matter for the movement under test.
 */
export function makePose(
  overrides: Partial<Record<KeypointName, Partial<Keypoint>>>,
  timestamp = 0,
): Pose {
  const keypoints: Keypoint[] = Array.from({ length: KEYPOINT_COUNT }, () => ({
    x: 0.5,
    y: 0.5,
    score: 0.9,
  }));

  for (const [name, value] of Object.entries(overrides)) {
    const index = KEYPOINT_INDEX[name as KeypointName];
    keypoints[index] = { ...(keypoints[index] as Keypoint), ...value };
  }

  return { keypoints, timestamp };
}

/** Places a joint at `distance` from `origin` along `degrees` (0° = +x, CCW). */
function polar(origin: { x: number; y: number }, degrees: number, distance: number) {
  const rad = (degrees * Math.PI) / 180;
  return { x: origin.x + Math.cos(rad) * distance, y: origin.y + Math.sin(rad) * distance };
}

/**
 * A push-up frame with a precise elbow angle.
 *
 * The shoulder sits along +x from the elbow and the wrist at `elbowAngle` from
 * it, so `angleAt(shoulder, elbow, wrist)` returns exactly `elbowAngle`.
 * Torso joints are laid out in a straight line for a clean plank.
 */
export function pushUpPose(elbowAngle: number, timestamp: number, score = 0.9): Pose {
  const elbow = { x: 0.5, y: 0.5 };
  const shoulder = polar(elbow, 0, 0.12);
  const wrist = polar(elbow, elbowAngle, 0.12);

  return makePose(
    {
      leftShoulder: { ...shoulder, score },
      rightShoulder: { ...shoulder, score },
      leftElbow: { ...elbow, score },
      rightElbow: { ...elbow, score },
      leftWrist: { ...wrist, score },
      rightWrist: { ...wrist, score },
      // Straight plank: shoulder → hip → knee collinear along +x.
      leftHip: { x: shoulder.x + 0.2, y: shoulder.y, score },
      rightHip: { x: shoulder.x + 0.2, y: shoulder.y, score },
      leftKnee: { x: shoulder.x + 0.4, y: shoulder.y, score },
      rightKnee: { x: shoulder.x + 0.4, y: shoulder.y, score },
      leftAnkle: { x: shoulder.x + 0.55, y: shoulder.y, score },
      rightAnkle: { x: shoulder.x + 0.55, y: shoulder.y, score },
    },
    timestamp,
  );
}

/** A squat frame with a precise knee angle and an upright torso. */
export function squatPose(kneeAngle: number, timestamp: number, score = 0.9): Pose {
  const knee = { x: 0.5, y: 0.6 };
  const hip = polar(knee, -90, 0.15); // directly above the knee
  const ankle = polar(knee, -90 + kneeAngle, 0.15);

  return makePose(
    {
      leftHip: { ...hip, score },
      rightHip: { ...hip, score },
      leftKnee: { ...knee, score },
      rightKnee: { ...knee, score },
      leftAnkle: { ...ankle, score },
      rightAnkle: { ...ankle, score },
      // Shoulders stacked above the hips keeps the torso vertical.
      leftShoulder: { x: hip.x, y: hip.y - 0.2, score },
      rightShoulder: { x: hip.x, y: hip.y - 0.2, score },
    },
    timestamp,
  );
}

/**
 * A shoulder-roll frame, filmed face-on, parameterised by how high the hands are
 * raised. `raise` is in torso units: 0 = hands at hip level (top of the roll),
 * 1 = hands up at shoulder level (committed roll). This is the exact signal
 * `shoulderRolls.analyze` reads — `(hipMid.y - wristMid.y) / torso`.
 */
export function shoulderPose(raise: number, timestamp: number, score = 0.9): Pose {
  const shoulderY = 0.35;
  const hipY = 0.6;
  const torso = hipY - shoulderY; // 0.25
  const wristY = hipY - raise * torso;

  return makePose(
    {
      leftShoulder: { x: 0.42, y: shoulderY, score },
      rightShoulder: { x: 0.58, y: shoulderY, score },
      leftElbow: { x: 0.4, y: (shoulderY + wristY) / 2, score },
      rightElbow: { x: 0.6, y: (shoulderY + wristY) / 2, score },
      leftWrist: { x: 0.4, y: wristY, score },
      rightWrist: { x: 0.6, y: wristY, score },
      leftHip: { x: 0.44, y: hipY, score },
      rightHip: { x: 0.56, y: hipY, score },
    },
    timestamp,
  );
}

/**
 * A full-body-stretch frame, parameterised by how far the hands have dropped
 * from overhead. `drop` is in torso units: -1 = hands one torso above the
 * shoulders (reach up, depth 0), +1 = hands at hip level (folded down, depth 1).
 * Matches `fullBodyStretch.analyze` — `(wristMid.y - shoulderMid.y) / torso`.
 */
export function stretchPose(drop: number, timestamp: number, score = 0.9): Pose {
  const shoulderY = 0.35;
  const hipY = 0.6;
  const torso = hipY - shoulderY; // 0.25
  const wristY = shoulderY + drop * torso;

  return makePose(
    {
      leftShoulder: { x: 0.42, y: shoulderY, score },
      rightShoulder: { x: 0.58, y: shoulderY, score },
      leftWrist: { x: 0.44, y: wristY, score },
      rightWrist: { x: 0.56, y: wristY, score },
      leftHip: { x: 0.44, y: hipY, score },
      rightHip: { x: 0.56, y: hipY, score },
      leftKnee: { x: 0.45, y: hipY + 0.2, score },
      rightKnee: { x: 0.55, y: hipY + 0.2, score },
    },
    timestamp,
  );
}

/**
 * Generates a full movement cycle by sweeping the driving angle from `top` down
 * to `bottom` and back, sampling at `fps`.
 */
export function repCycle(
  build: (angle: number, timestamp: number) => Pose,
  options: { top: number; bottom: number; durationMs: number; fps?: number; startAt?: number },
): Pose[] {
  const { top, bottom, durationMs, fps = 30, startAt = 0 } = options;
  const frameCount = Math.max(2, Math.round((durationMs / 1000) * fps));
  const poses: Pose[] = [];

  for (let i = 0; i <= frameCount; i++) {
    const t = i / frameCount;
    // Cosine ease so the movement slows at both ends, like a real rep.
    const phase = (1 - Math.cos(t * 2 * Math.PI)) / 2; // 0 → 1 → 0
    const angle = top + (bottom - top) * phase;
    poses.push(build(angle, startAt + Math.round(t * durationMs)));
  }
  return poses;
}
