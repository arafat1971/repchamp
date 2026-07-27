import { KEYPOINT_COUNT, type Keypoint, type Pose } from './keypoints';

/**
 * Square input resolution the model expects. Must match the downloaded variant:
 * MoveNet Lightning is 192, Thunder is 256. See `scripts/fetch-model.sh`.
 */
export const MODEL_INPUT_SIZE = 192;

/**
 * MoveNet emits a `[1, 1, 17, 3]` float tensor, flattened to 51 values as
 * `(y, x, score)` triples in normalised image space — note y comes *first*.
 *
 * Kept as a standalone pure function (rather than inlined into the frame
 * processor) so it can be unit-tested against captured tensors, and so the
 * worklet stays small enough to run inside one frame interval.
 */
export function decodePoseTensor(output: ArrayLike<number>, timestamp: number): Pose | null {
  if (output.length < KEYPOINT_COUNT * 3) return null;

  const keypoints: Keypoint[] = new Array<Keypoint>(KEYPOINT_COUNT);
  for (let i = 0; i < KEYPOINT_COUNT; i++) {
    const base = i * 3;
    keypoints[i] = {
      // Mirrored here rather than in a second pass: the front-facing preview is
      // flipped, and building 17 objects only to rebuild 17 more allocated
      // twice per frame for no benefit.
      x: 1 - (output[base + 1] as number),
      y: output[base] as number,
      score: output[base + 2] as number,
    };
  }
  return { keypoints, timestamp };
}

/**
 * Confidence that a full body is in frame, used to drive the calibration ring.
 *
 * Averaging every joint would punish the athlete for an occluded ankle, so this
 * weights the torso (which must be visible) above the extremities.
 */
export function framingConfidence(pose: Pose): number {
  const torsoIndices = [5, 6, 11, 12]; // shoulders + hips
  const limbIndices = [7, 8, 9, 10, 13, 14, 15, 16];

  let torso = 0;
  for (const i of torsoIndices) torso += pose.keypoints[i]?.score ?? 0;
  torso /= torsoIndices.length;

  let limbs = 0;
  for (const i of limbIndices) limbs += pose.keypoints[i]?.score ?? 0;
  limbs /= limbIndices.length;

  return Math.min(1, torso * 0.7 + limbs * 0.3);
}
