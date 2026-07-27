/**
 * COCO 17-keypoint topology, as emitted by MoveNet SinglePose (Lightning/Thunder).
 *
 * The model returns a `[1, 1, 17, 3]` tensor of `(y, x, score)` triples in
 * normalised image space, so index order here must match the model exactly.
 */
export const KEYPOINT_NAMES = [
  'nose',
  'leftEye',
  'rightEye',
  'leftEar',
  'rightEar',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
] as const;

export type KeypointName = (typeof KEYPOINT_NAMES)[number];

export const KEYPOINT_INDEX = KEYPOINT_NAMES.reduce<Record<KeypointName, number>>(
  (acc, name, i) => {
    acc[name] = i;
    return acc;
  },
  {} as Record<KeypointName, number>,
);

export const KEYPOINT_COUNT = KEYPOINT_NAMES.length;

/** A single detected joint in normalised (0..1) image coordinates. */
export interface Keypoint {
  x: number;
  y: number;
  /** Model confidence, 0..1. */
  score: number;
}

/** One inference result: all 17 joints plus the frame timestamp in ms. */
export interface Pose {
  keypoints: readonly Keypoint[];
  timestamp: number;
}

/**
 * Bone list for drawing the skeleton overlay. Ordered head → torso → arms → legs
 * so the stroke layering reads naturally.
 */
export const SKELETON_BONES: readonly (readonly [KeypointName, KeypointName])[] = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];

/** Below this the joint is treated as missing rather than merely imprecise. */
export const MIN_KEYPOINT_SCORE = 0.3;

export function getKeypoint(pose: Pose, name: KeypointName): Keypoint | null {
  const kp = pose.keypoints[KEYPOINT_INDEX[name]];
  if (!kp || kp.score < MIN_KEYPOINT_SCORE) return null;
  return kp;
}

/**
 * Mean confidence across the joints an exercise actually depends on.
 * Used to gate calibration and to suppress rep counting when the athlete
 * walks out of frame mid-set.
 */
export function meanScore(pose: Pose, names: readonly KeypointName[]): number {
  if (names.length === 0) return 0;
  let total = 0;
  for (const name of names) {
    total += pose.keypoints[KEYPOINT_INDEX[name]]?.score ?? 0;
  }
  return total / names.length;
}
