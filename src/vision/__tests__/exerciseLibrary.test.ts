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

  it('high-knees: a lifted knee reads higher than a resting one', () => {
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
      leftKnee: { x: 0.5, y: 0.42 }, // one knee driven up above the hip line
      rightKnee: { x: 0.5, y: 0.7 },
    });
    const def = getExercise('high-knees');
    expect(def.analyze(lifted).depth!).toBeGreaterThan(def.analyze(rest).depth!);
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
