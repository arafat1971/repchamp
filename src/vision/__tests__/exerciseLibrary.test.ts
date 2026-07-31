import { EXERCISES, getExercise, type ExerciseId } from '../exercises';
import { makePose } from './testPoses';
import type { KeypointName, Keypoint, Pose } from '../keypoints';

/** Build a pose from named joint positions, all fully confident. */
function poseFrom(joints: Partial<Record<KeypointName, { x: number; y: number }>>): Pose {
  const overrides: Partial<Record<KeypointName, Partial<Keypoint>>> = {};
  for (const [name, pos] of Object.entries(joints)) {
    overrides[name as KeypointName] = { ...pos, score: 0.95 };
  }
  return makePose(overrides, 0);
}

const NEW_EXERCISES: ExerciseId[] = [
  'lunge',
  'situp',
  'glute-bridge',
  'pike-push',
  'high-knees',
  'jumping-jack',
];

describe('exercise library — registration', () => {
  it('every new exercise is registered and self-consistent', () => {
    for (const id of NEW_EXERCISES) {
      const def = getExercise(id);
      expect(def.id).toBe(id);
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.hudLabel).toBe(def.hudLabel.toUpperCase());
      expect(def.metricLabels).toHaveLength(3);
      expect(def.cues.length).toBeGreaterThan(0);
      // Thresholds must be ordered so a rep can actually be booked.
      expect(def.downThreshold).toBeGreaterThan(def.upThreshold);
    }
  });

  it('EXERCISES covers exactly the known ids', () => {
    expect(Object.keys(EXERCISES).sort()).toEqual(
      ['glute-bridge', 'high-knees', 'jumping-jack', 'lunge', 'pike-push', 'push', 'shoulder', 'situp', 'squat', 'stretch'].sort(),
    );
  });
});

describe('exercise library — depth signal moves the right way', () => {
  // Each case gives a "top" pose (should read low depth) and a "bottom"/"full"
  // pose (should read high depth), so we prove the analyzer's polarity is right.

  it('lunge: deep front-knee bend reads deeper than a standing leg', () => {
    const standing = poseFrom({
      leftHip: { x: 0.5, y: 0.4 },
      leftKnee: { x: 0.5, y: 0.6 },
      leftAnkle: { x: 0.5, y: 0.8 }, // straight leg
      leftShoulder: { x: 0.5, y: 0.2 },
      rightShoulder: { x: 0.5, y: 0.2 },
    });
    const deep = poseFrom({
      leftHip: { x: 0.5, y: 0.5 },
      leftKnee: { x: 0.5, y: 0.62 },
      leftAnkle: { x: 0.66, y: 0.62 }, // ~90° bend
      leftShoulder: { x: 0.5, y: 0.3 },
      rightShoulder: { x: 0.5, y: 0.3 },
    });
    const def = getExercise('lunge');
    expect(def.analyze(deep).depth!).toBeGreaterThan(def.analyze(standing).depth!);
  });

  it('lunge: alternating sides return low depth when both legs are even', () => {
    // Both legs equally bent → asymmetry ~0 so the rep counter can close.
    const bothDeep = poseFrom({
      leftHip: { x: 0.4, y: 0.5 },
      leftKnee: { x: 0.4, y: 0.62 },
      leftAnkle: { x: 0.56, y: 0.62 },
      rightHip: { x: 0.6, y: 0.5 },
      rightKnee: { x: 0.6, y: 0.62 },
      rightAnkle: { x: 0.76, y: 0.62 },
      leftShoulder: { x: 0.4, y: 0.3 },
      rightShoulder: { x: 0.6, y: 0.3 },
    });
    const oneDeep = poseFrom({
      leftHip: { x: 0.4, y: 0.5 },
      leftKnee: { x: 0.4, y: 0.62 },
      leftAnkle: { x: 0.56, y: 0.62 },
      rightHip: { x: 0.6, y: 0.4 },
      rightKnee: { x: 0.6, y: 0.6 },
      rightAnkle: { x: 0.6, y: 0.8 }, // straight
      leftShoulder: { x: 0.4, y: 0.3 },
      rightShoulder: { x: 0.6, y: 0.3 },
    });
    const def = getExercise('lunge');
    expect(def.analyze(bothDeep).depth!).toBeLessThan(def.upThreshold);
    expect(def.analyze(oneDeep).depth!).toBeGreaterThan(def.analyze(bothDeep).depth!);
  });

  it('high-knees: a single lifted knee reads higher than rest (asymmetry signal)', () => {
    const rest = poseFrom({
      leftShoulder: { x: 0.5, y: 0.3 },
      rightShoulder: { x: 0.5, y: 0.3 },
      leftHip: { x: 0.5, y: 0.5 },
      rightHip: { x: 0.5, y: 0.5 },
      leftKnee: { x: 0.5, y: 0.7 },
      rightKnee: { x: 0.5, y: 0.7 }, // knees low
    });
    const lifted = poseFrom({
      leftShoulder: { x: 0.5, y: 0.3 },
      rightShoulder: { x: 0.5, y: 0.3 },
      leftHip: { x: 0.5, y: 0.5 },
      rightHip: { x: 0.5, y: 0.5 },
      leftKnee: { x: 0.5, y: 0.35 }, // one knee driven up
      rightKnee: { x: 0.5, y: 0.7 },
    });
    const bothHigh = poseFrom({
      leftShoulder: { x: 0.5, y: 0.3 },
      rightShoulder: { x: 0.5, y: 0.3 },
      leftHip: { x: 0.5, y: 0.5 },
      rightHip: { x: 0.5, y: 0.5 },
      leftKnee: { x: 0.5, y: 0.35 },
      rightKnee: { x: 0.5, y: 0.35 },
    });
    const def = getExercise('high-knees');
    expect(def.analyze(lifted).depth!).toBeGreaterThan(def.analyze(rest).depth!);
    // Alternating signal must return low when both knees are equally high —
    // otherwise the hysteresis counter never closes a rep.
    expect(def.analyze(bothHigh).depth!).toBeLessThan(def.upThreshold);
  });

  it('jumping-jack: hands overhead read higher than hands down', () => {
    const down = poseFrom({
      leftShoulder: { x: 0.4, y: 0.3 },
      rightShoulder: { x: 0.6, y: 0.3 },
      leftHip: { x: 0.4, y: 0.5 },
      rightHip: { x: 0.6, y: 0.5 },
      leftWrist: { x: 0.4, y: 0.5 }, // hands at hip level
      rightWrist: { x: 0.6, y: 0.5 },
    });
    const up = poseFrom({
      leftShoulder: { x: 0.4, y: 0.3 },
      rightShoulder: { x: 0.6, y: 0.3 },
      leftHip: { x: 0.4, y: 0.5 },
      rightHip: { x: 0.6, y: 0.5 },
      leftWrist: { x: 0.45, y: 0.1 }, // hands overhead
      rightWrist: { x: 0.55, y: 0.1 },
    });
    const def = getExercise('jumping-jack');
    expect(def.analyze(up).depth!).toBeGreaterThan(def.analyze(down).depth!);
  });

  it('jumping-jack / shoulder / stretch tolerate one occluded wrist', () => {
    const oneWristUp: Pose = makePose(
      {
        leftShoulder: { x: 0.4, y: 0.3, score: 0.95 },
        rightShoulder: { x: 0.6, y: 0.3, score: 0.95 },
        leftHip: { x: 0.4, y: 0.5, score: 0.95 },
        rightHip: { x: 0.6, y: 0.5, score: 0.95 },
        leftWrist: { x: 0.45, y: 0.1, score: 0.95 },
        rightWrist: { x: 0.55, y: 0.1, score: 0.05 }, // occluded
      },
      0,
    );
    for (const id of ['jumping-jack', 'shoulder', 'stretch'] as ExerciseId[]) {
      expect(getExercise(id).analyze(oneWristUp).depth).not.toBeNull();
    }
  });

  it('glute-bridge: raised hips read higher than hips on the floor', () => {
    // Hips down: shoulder→hip→knee bent. Hips up: nearly straight.
    const down = poseFrom({
      leftShoulder: { x: 0.3, y: 0.6 },
      rightShoulder: { x: 0.3, y: 0.6 },
      leftHip: { x: 0.5, y: 0.62 },
      rightHip: { x: 0.5, y: 0.62 },
      leftKnee: { x: 0.6, y: 0.5 },
      rightKnee: { x: 0.6, y: 0.5 },
    });
    const up = poseFrom({
      leftShoulder: { x: 0.3, y: 0.55 },
      rightShoulder: { x: 0.3, y: 0.55 },
      leftHip: { x: 0.5, y: 0.5 }, // hips lifted into a straight line
      rightHip: { x: 0.5, y: 0.5 },
      leftKnee: { x: 0.7, y: 0.5 },
      rightKnee: { x: 0.7, y: 0.5 },
    });
    const def = getExercise('glute-bridge');
    expect(def.analyze(up).depth!).toBeGreaterThan(def.analyze(down).depth!);
  });
});
