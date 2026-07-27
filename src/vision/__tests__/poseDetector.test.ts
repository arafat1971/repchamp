import { decodePoseTensor, framingConfidence } from '../poseDetector';
import { KEYPOINT_COUNT } from '../keypoints';
import { makePose } from './testPoses';

describe('decodePoseTensor', () => {
  it('decodes a 51-value tensor and mirrors x for the flipped front preview', () => {
    const values = new Array<number>(KEYPOINT_COUNT * 3).fill(0);
    values[0] = 0.4; // nose y
    values[1] = 0.3; // nose x
    values[2] = 0.8; // nose score

    const pose = decodePoseTensor(values, 5);
    expect(pose?.keypoints[0]?.y).toBeCloseTo(0.4); // y passes through
    expect(pose?.keypoints[0]?.x).toBeCloseTo(1 - 0.3); // x mirrored
    expect(pose?.keypoints[0]?.score).toBeCloseTo(0.8);
    expect(pose?.timestamp).toBe(5);
  });

  it('returns every keypoint the model reported', () => {
    const values = new Array<number>(KEYPOINT_COUNT * 3).fill(0.5);
    expect(decodePoseTensor(values, 0)?.keypoints).toHaveLength(KEYPOINT_COUNT);
  });

  it('returns null for a truncated tensor rather than a partial pose', () => {
    expect(decodePoseTensor([0, 0, 0], 0)).toBeNull();
  });
});

describe('framingConfidence', () => {
  it('scores a fully visible body near 1', () => {
    // makePose defaults every joint to score 0.9.
    expect(framingConfidence(makePose({}))).toBeGreaterThan(0.85);
  });

  it('weights the torso above the limbs', () => {
    const torsoNames = ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'] as const;
    const limbNames = [
      'leftElbow',
      'rightElbow',
      'leftWrist',
      'rightWrist',
      'leftKnee',
      'rightKnee',
      'leftAnkle',
      'rightAnkle',
    ] as const;

    const torsoHidden = makePose(Object.fromEntries(torsoNames.map((n) => [n, { score: 0 }])));
    const limbsHidden = makePose(Object.fromEntries(limbNames.map((n) => [n, { score: 0 }])));

    // Losing the torso must cost more confidence than losing the extremities.
    expect(framingConfidence(torsoHidden)).toBeLessThan(framingConfidence(limbsHidden));
  });
});
