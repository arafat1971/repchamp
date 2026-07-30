import { angleAt, clamp, midpoint, normalize, tiltFromHorizontal, weightedMidpoint } from './geometry';
import { KEYPOINT_INDEX, MIN_KEYPOINT_SCORE, meanScore } from './keypoints';
import type { Keypoint, KeypointName, Pose } from './keypoints';

export type ExerciseId =
  | 'push'
  | 'squat'
  | 'shoulder'
  | 'stretch'
  // Pro exercise library (couple mode + push/squat stay free; these are Pro).
  | 'lunge'
  | 'situp'
  | 'glute-bridge'
  | 'pike-push'
  | 'high-knees'
  | 'jumping-jack';

/**
 * Per-frame reading of the movement. `depth` is the single scalar the rep state
 * machine consumes: 0 at full extension (top of a push-up, standing), 1 at full
 * depth (chest down, thighs parallel).
 *
 * The two `alignment*` channels are secondary form signals — they never gate a
 * rep, they only feed the form report, so a sloppy rep still counts.
 */
export interface FrameAnalysis {
  /** 0..1 movement depth, or null when the required joints aren't visible. */
  depth: number | null;
  /** 0..1 primary alignment quality (back line / knee tracking). */
  alignment: number;
  /** Mean confidence over the joints this exercise needs. */
  visibility: number;
}

export interface ExerciseDefinition {
  id: ExerciseId;
  label: string;
  /** Uppercase label shown on the duel HUD, e.g. "PUSH-UP". */
  hudLabel: string;
  /** Joints that must be visible for calibration to lock. */
  requiredKeypoints: readonly KeypointName[];
  /** Depth at which the descent is considered committed. */
  downThreshold: number;
  /** Depth the athlete must return above to complete the rep. */
  upThreshold: number;
  /** Peak depth at or above which a rep is graded "full depth" rather than "partial". */
  fullDepthThreshold: number;
  /** Reps faster than this are bounce artefacts, not reps. */
  minRepDurationMs: number;
  /** Labels for the three bars in the form report, in order. */
  metricLabels: readonly [string, string, string];
  /** Coaching line shown at the bottom of the form report. */
  coachingTip: string;
  /** Cues spoken/shown during the set, cycled every few reps. */
  cues: readonly string[];
  analyze(pose: Pose): FrameAnalysis;
}

/**
 * Reads a joint by name. The index always exists — `KEYPOINT_INDEX` is derived
 * from the same fixed 17-entry list the model emits — so this narrows away the
 * `undefined` that `noUncheckedIndexedAccess` would otherwise propagate into
 * every angle calculation.
 */
function kp(pose: Pose, name: KeypointName): Keypoint {
  return pose.keypoints[KEYPOINT_INDEX[name]] as Keypoint;
}

/** The three joints driving one exercise, on a single side of the body. */
type JointTriple = readonly [KeypointName, KeypointName, KeypointName];

/**
 * Pick the body side the camera can see best. Bodyweight sets are usually filmed
 * side-on, so one arm/leg is occluded; averaging both sides would drag every
 * angle toward the noisy occluded joints.
 */
function betterSide(pose: Pose, left: JointTriple, right: JointTriple): JointTriple {
  return meanScore(pose, left) >= meanScore(pose, right) ? left : right;
}

const PUSH_REQUIRED = [
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
] as const;

/**
 * Push-up: depth is driven by elbow flexion.
 *
 * ~165° is a locked-out arm, ~75° is chest-to-floor. Anything outside that is
 * clamped, so hyperextension doesn't read as negative depth.
 */
export const pushUp: ExerciseDefinition = {
  id: 'push',
  label: 'Push-Ups',
  hudLabel: 'PUSH-UP',
  requiredKeypoints: PUSH_REQUIRED,
  downThreshold: 0.7,
  upThreshold: 0.3,
  fullDepthThreshold: 0.78,
  minRepDurationMs: 400,
  metricLabels: ['Range of motion', 'Back alignment', 'Tempo consistency'],
  coachingTip: 'Lower your chest a touch deeper to turn partials into full-depth reps.',
  cues: ['Great depth!', 'Keep the tempo', 'Nice and controlled', 'Push through!'],

  analyze(pose: Pose): FrameAnalysis {
    const side = betterSide(
      pose,
      ['leftShoulder', 'leftElbow', 'leftWrist'],
      ['rightShoulder', 'rightElbow', 'rightWrist'],
    );

    // Visibility is judged on the joints actually driving the angle, not on
    // every joint of both arms. Sets are filmed side-on — as the app instructs
    // — so the far arm is occluded and scores near zero; averaging it in
    // suppressed tracking even when the near arm was perfectly visible.
    const visibility = meanScore(pose, side);
    const [shoulderName, elbowName, wristName] = side;
    const shoulder = kp(pose, shoulderName);
    const elbow = kp(pose, elbowName);
    const wrist = kp(pose, wristName);

    if (
      shoulder.score < MIN_KEYPOINT_SCORE ||
      elbow.score < MIN_KEYPOINT_SCORE ||
      wrist.score < MIN_KEYPOINT_SCORE
    ) {
      return { depth: null, alignment: 0, visibility };
    }

    const elbowAngle = angleAt(shoulder, elbow, wrist);
    const depth = elbowAngle === null ? null : normalize(elbowAngle, 165, 75);

    // Back alignment: shoulders, hips and knees should form one line. We measure
    // how far the hip sits off the shoulder→knee segment, relative to torso length.
    const shoulderMid = weightedMidpoint(kp(pose, 'leftShoulder'), kp(pose, 'rightShoulder'));
    const hipMid = weightedMidpoint(kp(pose, 'leftHip'), kp(pose, 'rightHip'));
    const kneeMid = weightedMidpoint(kp(pose, 'leftKnee'), kp(pose, 'rightKnee'));

    const torsoAngle = angleAt(shoulderMid, hipMid, kneeMid);
    // 180° is a perfectly straight plank; sag or pike bends it.
    const alignment = torsoAngle === null ? 0 : normalize(torsoAngle, 140, 180);

    return { depth, alignment, visibility };
  },
};

const SQUAT_REQUIRED = [
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
  'leftShoulder',
  'rightShoulder',
] as const;

/**
 * Squat: depth is driven by knee flexion.
 *
 * ~172° standing, ~70° well below parallel. The alignment channel checks that the
 * torso stays tall rather than folding forward into a good-morning.
 */
export const squat: ExerciseDefinition = {
  id: 'squat',
  label: 'Squats',
  hudLabel: 'SQUAT',
  requiredKeypoints: SQUAT_REQUIRED,
  downThreshold: 0.68,
  upThreshold: 0.28,
  fullDepthThreshold: 0.75,
  minRepDurationMs: 450,
  metricLabels: ['Squat depth', 'Knee alignment', 'Tempo consistency'],
  coachingTip: 'Pause 1 count at the bottom to lock in full depth on every rep.',
  cues: ['Deep squat!', 'Drive through heels', 'Chest up', 'Knees tracking'],

  analyze(pose: Pose): FrameAnalysis {
    const side = betterSide(
      pose,
      ['leftHip', 'leftKnee', 'leftAnkle'],
      ['rightHip', 'rightKnee', 'rightAnkle'],
    );

    // As with push-ups: score only the leg we are measuring, so an occluded
    // far leg cannot suppress tracking.
    const visibility = meanScore(pose, side);
    const [hipName, kneeName, ankleName] = side;
    const hip = kp(pose, hipName);
    const knee = kp(pose, kneeName);
    const ankle = kp(pose, ankleName);

    if (
      hip.score < MIN_KEYPOINT_SCORE ||
      knee.score < MIN_KEYPOINT_SCORE ||
      ankle.score < MIN_KEYPOINT_SCORE
    ) {
      return { depth: null, alignment: 0, visibility };
    }

    const kneeAngle = angleAt(hip, knee, ankle);
    const depth = kneeAngle === null ? null : normalize(kneeAngle, 172, 70);

    // Torso lean: the shoulder→hip line should stay closer to vertical than to
    // horizontal. 90° from horizontal is upright; below ~45° is a heavy fold.
    const shoulderMid = weightedMidpoint(kp(pose, 'leftShoulder'), kp(pose, 'rightShoulder'));
    const hipMid = weightedMidpoint(kp(pose, 'leftHip'), kp(pose, 'rightHip'));
    const torsoTilt = tiltFromHorizontal(shoulderMid, hipMid);
    const alignment = normalize(torsoTilt, 45, 85);

    return { depth, alignment, visibility };
  },
};

const SHOULDER_REQUIRED = [
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
] as const;

/**
 * Shoulder Rolls: a mobility drill, filmed facing the camera.
 *
 * A roll is not a joint flexion — the elbow/knee angles barely change — so it
 * cannot be measured the way a push-up or squat is. Instead we track how far the
 * hands rise: the cue is "roll the shoulders while lifting the hands toward
 * shoulder height." Depth is the mean wrist height, expressed as a fraction of
 * the shoulder→hip torso span above the hips. Hands at hip level read ~0
 * (top of the movement); hands up at shoulder level read ~1 (committed roll).
 *
 * Using both wrists (rather than one side) keeps it symmetric — the athlete is
 * face-on, so both arms are visible.
 */
export const shoulderRolls: ExerciseDefinition = {
  id: 'shoulder',
  label: 'Shoulder Rolls',
  hudLabel: 'SHOULDER',
  requiredKeypoints: SHOULDER_REQUIRED,
  downThreshold: 0.6,
  upThreshold: 0.25,
  fullDepthThreshold: 0.7,
  minRepDurationMs: 600,
  metricLabels: ['Range of motion', 'Shoulder symmetry', 'Tempo consistency'],
  coachingTip: 'Lift your hands to shoulder height on every roll to get the full range.',
  cues: ['Full circle!', 'Nice and slow', 'Both shoulders', 'Keep it smooth'],

  analyze(pose: Pose): FrameAnalysis {
    const visibility = meanScore(pose, SHOULDER_REQUIRED);

    const leftShoulder = kp(pose, 'leftShoulder');
    const rightShoulder = kp(pose, 'rightShoulder');
    const leftWrist = kp(pose, 'leftWrist');
    const rightWrist = kp(pose, 'rightWrist');

    if (
      leftShoulder.score < MIN_KEYPOINT_SCORE ||
      rightShoulder.score < MIN_KEYPOINT_SCORE ||
      leftWrist.score < MIN_KEYPOINT_SCORE ||
      rightWrist.score < MIN_KEYPOINT_SCORE
    ) {
      return { depth: null, alignment: 0, visibility };
    }

    const shoulderMid = weightedMidpoint(leftShoulder, rightShoulder);
    const hipMid = weightedMidpoint(kp(pose, 'leftHip'), kp(pose, 'rightHip'));
    const wristMid = midpoint(leftWrist, rightWrist);

    // Torso span in normalised image units (keypoints are 0..1) — normalises for
    // the athlete's distance from camera. Guard against a degenerate span in a
    // bad frame, where the shoulders and hips collapse onto each other.
    const torso = Math.abs(hipMid.y - shoulderMid.y);
    if (torso < 0.02) return { depth: null, alignment: 0, visibility };

    // Image y grows downward, so a raised hand has a SMALLER y. Height above the
    // hip, in torso units: 0 at hip level, ~1 at shoulder level.
    const raise = (hipMid.y - wristMid.y) / torso;
    const depth = clamp(raise, 0, 1);

    // Symmetry: how level the two wrists are, relative to torso length. A tilt of
    // a third of the torso or more reads as fully asymmetric.
    const wristSkew = Math.abs(leftWrist.y - rightWrist.y) / torso;
    const alignment = 1 - normalize(wristSkew, 0, 0.33);

    return { depth, alignment, visibility };
  },
};

const STRETCH_REQUIRED = [
  'leftShoulder',
  'rightShoulder',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
] as const;

/**
 * Full-Body Stretch: reach tall overhead, then fold down toward the floor.
 *
 * Filmed facing the camera. Depth tracks the hands travelling down the body:
 * hands overhead (above the shoulders) read ~0, hands reaching below the hips
 * toward the toes read ~1. We measure the mean wrist height against the
 * shoulder→hip torso span so it is scale-invariant to camera distance.
 */
export const fullBodyStretch: ExerciseDefinition = {
  id: 'stretch',
  label: 'Full-Body Stretch',
  hudLabel: 'STRETCH',
  requiredKeypoints: STRETCH_REQUIRED,
  downThreshold: 0.6,
  upThreshold: 0.2,
  fullDepthThreshold: 0.72,
  minRepDurationMs: 800,
  metricLabels: ['Depth reached', 'Balance', 'Tempo consistency'],
  coachingTip: 'Reach all the way up, then fold down past your hips for the full stretch.',
  cues: ['Reach up!', 'Fold down', 'Breathe out', 'Nice stretch'],

  analyze(pose: Pose): FrameAnalysis {
    const visibility = meanScore(pose, STRETCH_REQUIRED);

    const leftShoulder = kp(pose, 'leftShoulder');
    const rightShoulder = kp(pose, 'rightShoulder');
    const leftWrist = kp(pose, 'leftWrist');
    const rightWrist = kp(pose, 'rightWrist');

    if (
      leftShoulder.score < MIN_KEYPOINT_SCORE ||
      rightShoulder.score < MIN_KEYPOINT_SCORE ||
      leftWrist.score < MIN_KEYPOINT_SCORE ||
      rightWrist.score < MIN_KEYPOINT_SCORE
    ) {
      return { depth: null, alignment: 0, visibility };
    }

    const shoulderMid = weightedMidpoint(leftShoulder, rightShoulder);
    const hipMid = weightedMidpoint(kp(pose, 'leftHip'), kp(pose, 'rightHip'));
    const wristMid = midpoint(leftWrist, rightWrist);

    const torso = Math.abs(hipMid.y - shoulderMid.y);
    if (torso < 0.02) return { depth: null, alignment: 0, visibility };

    // Wrist position measured downward from the shoulder line, in torso units.
    // Hands one torso-length above the shoulders → -1 (mapped to depth 0);
    // hands down at hip level → +1 (mapped to depth 1).
    const drop = (wristMid.y - shoulderMid.y) / torso;
    const depth = normalize(drop, -1, 1);

    // Balance: shoulders should stay roughly level through the reach and fold.
    const shoulderSkew = Math.abs(leftShoulder.y - rightShoulder.y) / torso;
    const alignment = 1 - normalize(shoulderSkew, 0, 0.3);

    return { depth, alignment, visibility };
  },
};

/* ------------------------------------------------------------------ *
 * Pro exercise library
 *
 * Each follows the same contract as the staples above: `analyze` returns a 0..1
 * `depth` (0 at the top of the movement, 1 at full range) plus a secondary
 * alignment channel and a visibility score over the joints it measures. All are
 * derived from the same 17 COCO keypoints, so they need no model change.
 * ------------------------------------------------------------------ */

const LUNGE_REQUIRED = [
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
] as const;

/**
 * Lunge: the *front* knee bends toward 90°. Filmed side-on; we measure whichever
 * leg is more visible, exactly like the squat.
 */
export const lunge: ExerciseDefinition = {
  id: 'lunge',
  label: 'Lunges',
  hudLabel: 'LUNGE',
  requiredKeypoints: LUNGE_REQUIRED,
  downThreshold: 0.66,
  upThreshold: 0.28,
  fullDepthThreshold: 0.74,
  minRepDurationMs: 500,
  metricLabels: ['Lunge depth', 'Torso upright', 'Tempo consistency'],
  coachingTip: 'Drop the back knee toward the floor and keep your chest tall.',
  cues: ['Deep lunge!', 'Chest up', 'Drive through the heel', 'Control the descent'],

  analyze(pose: Pose): FrameAnalysis {
    const side = betterSide(
      pose,
      ['leftHip', 'leftKnee', 'leftAnkle'],
      ['rightHip', 'rightKnee', 'rightAnkle'],
    );
    const visibility = meanScore(pose, side);
    const [hipName, kneeName, ankleName] = side;
    const hip = kp(pose, hipName);
    const knee = kp(pose, kneeName);
    const ankle = kp(pose, ankleName);

    if (
      hip.score < MIN_KEYPOINT_SCORE ||
      knee.score < MIN_KEYPOINT_SCORE ||
      ankle.score < MIN_KEYPOINT_SCORE
    ) {
      return { depth: null, alignment: 0, visibility };
    }

    const kneeAngle = angleAt(hip, knee, ankle);
    const depth = kneeAngle === null ? null : normalize(kneeAngle, 168, 85);

    const shoulderMid = weightedMidpoint(kp(pose, 'leftShoulder'), kp(pose, 'rightShoulder'));
    const hipMid = weightedMidpoint(kp(pose, 'leftHip'), kp(pose, 'rightHip'));
    const torsoTilt = tiltFromHorizontal(shoulderMid, hipMid);
    const alignment = normalize(torsoTilt, 50, 88);

    return { depth, alignment, visibility };
  },
};

const SITUP_REQUIRED = [
  'leftShoulder',
  'rightShoulder',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
] as const;

/**
 * Sit-up: the torso rises from the floor. Depth is the shoulder→hip→knee angle —
 * flat on the floor the torso is roughly in line with the legs (~150°+), sitting
 * up folds it toward ~70°. Filmed side-on.
 */
export const situp: ExerciseDefinition = {
  id: 'situp',
  label: 'Sit-Ups',
  hudLabel: 'SIT-UP',
  requiredKeypoints: SITUP_REQUIRED,
  downThreshold: 0.6,
  upThreshold: 0.25,
  fullDepthThreshold: 0.7,
  minRepDurationMs: 500,
  metricLabels: ['Range of motion', 'Symmetry', 'Tempo consistency'],
  coachingTip: 'Curl all the way up until your chest nears your knees.',
  cues: ['All the way up!', 'Control the way down', 'Breathe out on the crunch', 'Steady tempo'],

  analyze(pose: Pose): FrameAnalysis {
    const visibility = meanScore(pose, SITUP_REQUIRED);
    const shoulderMid = weightedMidpoint(kp(pose, 'leftShoulder'), kp(pose, 'rightShoulder'));
    const hipMid = weightedMidpoint(kp(pose, 'leftHip'), kp(pose, 'rightHip'));
    const kneeMid = weightedMidpoint(kp(pose, 'leftKnee'), kp(pose, 'rightKnee'));

    const torsoAngle = angleAt(shoulderMid, hipMid, kneeMid);
    const depth = torsoAngle === null ? null : normalize(torsoAngle, 150, 70);

    // Symmetry: the two shoulders should rise level. A tilt reads as a twist.
    const shoulderSkew = Math.abs(
      kp(pose, 'leftShoulder').y - kp(pose, 'rightShoulder').y,
    );
    const alignment = 1 - normalize(shoulderSkew, 0, 0.2);

    return { depth, alignment, visibility };
  },
};

const BRIDGE_REQUIRED = [
  'leftShoulder',
  'rightShoulder',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
] as const;

/**
 * Glute bridge: hips lift off the floor. Depth is hip extension — the
 * shoulder→hip→knee line straightens toward 180° at the top of the bridge and
 * bends when the hips are down. Filmed side-on.
 */
export const gluteBridge: ExerciseDefinition = {
  id: 'glute-bridge',
  label: 'Glute Bridges',
  hudLabel: 'BRIDGE',
  requiredKeypoints: BRIDGE_REQUIRED,
  downThreshold: 0.6,
  upThreshold: 0.25,
  fullDepthThreshold: 0.72,
  minRepDurationMs: 500,
  metricLabels: ['Hip extension', 'Symmetry', 'Tempo consistency'],
  coachingTip: 'Squeeze at the top until your body forms a straight line.',
  cues: ['Squeeze the top!', 'Slow and controlled', 'Drive through heels', 'Hold a beat'],

  analyze(pose: Pose): FrameAnalysis {
    const visibility = meanScore(pose, BRIDGE_REQUIRED);
    const shoulderMid = weightedMidpoint(kp(pose, 'leftShoulder'), kp(pose, 'rightShoulder'));
    const hipMid = weightedMidpoint(kp(pose, 'leftHip'), kp(pose, 'rightHip'));
    const kneeMid = weightedMidpoint(kp(pose, 'leftKnee'), kp(pose, 'rightKnee'));

    const hipAngle = angleAt(shoulderMid, hipMid, kneeMid);
    // ~120° hips-down → straight ~178° at the top of the bridge.
    const depth = hipAngle === null ? null : normalize(hipAngle, 120, 178);

    const hipSkew = Math.abs(kp(pose, 'leftHip').y - kp(pose, 'rightHip').y);
    const alignment = 1 - normalize(hipSkew, 0, 0.2);

    return { depth, alignment, visibility };
  },
};

const PIKE_REQUIRED = [
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
] as const;

/**
 * Pike push-up: like a push-up but hips piked high, loading the shoulders. Depth
 * is elbow flexion, same as a push-up but with a tighter angle band since the
 * head travels a shorter arc. Filmed side-on.
 */
export const pikePush: ExerciseDefinition = {
  id: 'pike-push',
  label: 'Pike Push-Ups',
  hudLabel: 'PIKE',
  requiredKeypoints: PIKE_REQUIRED,
  downThreshold: 0.7,
  upThreshold: 0.3,
  fullDepthThreshold: 0.78,
  minRepDurationMs: 450,
  metricLabels: ['Range of motion', 'Hip pike', 'Tempo consistency'],
  coachingTip: 'Keep your hips high and lower the crown of your head toward the floor.',
  cues: ['Hips high!', 'Lower with control', 'Push through the shoulders', 'Nice depth'],

  analyze(pose: Pose): FrameAnalysis {
    const side = betterSide(
      pose,
      ['leftShoulder', 'leftElbow', 'leftWrist'],
      ['rightShoulder', 'rightElbow', 'rightWrist'],
    );
    const visibility = meanScore(pose, side);
    const [shoulderName, elbowName, wristName] = side;
    const shoulder = kp(pose, shoulderName);
    const elbow = kp(pose, elbowName);
    const wrist = kp(pose, wristName);

    if (
      shoulder.score < MIN_KEYPOINT_SCORE ||
      elbow.score < MIN_KEYPOINT_SCORE ||
      wrist.score < MIN_KEYPOINT_SCORE
    ) {
      return { depth: null, alignment: 0, visibility };
    }

    const elbowAngle = angleAt(shoulder, elbow, wrist);
    const depth = elbowAngle === null ? null : normalize(elbowAngle, 165, 85);

    // Pike quality: the hips should sit high, so the shoulder→hip line tilts
    // steeply. Reuse tilt-from-horizontal as a proxy for "hips up".
    const shoulderMid = weightedMidpoint(kp(pose, 'leftShoulder'), kp(pose, 'rightShoulder'));
    const hipMid = weightedMidpoint(kp(pose, 'leftHip'), kp(pose, 'rightHip'));
    const pikeTilt = tiltFromHorizontal(shoulderMid, hipMid);
    const alignment = normalize(pikeTilt, 25, 70);

    return { depth, alignment, visibility };
  },
};

const HIGH_KNEES_REQUIRED = [
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
] as const;

/**
 * High knees: a standing cardio drill, filmed facing the camera. One "rep" is a
 * knee driven up to hip height. Depth is how high the higher knee rises toward
 * the hip line, measured against torso length so it's scale-invariant.
 */
export const highKnees: ExerciseDefinition = {
  id: 'high-knees',
  label: 'High Knees',
  hudLabel: 'KNEES',
  requiredKeypoints: HIGH_KNEES_REQUIRED,
  downThreshold: 0.55,
  upThreshold: 0.22,
  fullDepthThreshold: 0.68,
  minRepDurationMs: 350,
  metricLabels: ['Knee height', 'Balance', 'Tempo consistency'],
  coachingTip: 'Drive each knee up to hip height and keep a quick, even rhythm.',
  cues: ['Knees up!', 'Quick feet', 'Stay tall', 'Keep the pace'],

  analyze(pose: Pose): FrameAnalysis {
    const visibility = meanScore(pose, HIGH_KNEES_REQUIRED);
    const hipMid = weightedMidpoint(kp(pose, 'leftHip'), kp(pose, 'rightHip'));
    const shoulderMid = weightedMidpoint(kp(pose, 'leftShoulder'), kp(pose, 'rightShoulder'));

    const leftKnee = kp(pose, 'leftKnee');
    const rightKnee = kp(pose, 'rightKnee');
    if (leftKnee.score < MIN_KEYPOINT_SCORE && rightKnee.score < MIN_KEYPOINT_SCORE) {
      return { depth: null, alignment: 0, visibility };
    }

    const torso = Math.abs(hipMid.y - shoulderMid.y);
    if (torso < 0.02) return { depth: null, alignment: 0, visibility };

    // The higher of the two knees (smaller y). Height above the hip in torso
    // units: 0 at rest, ~1 when the knee reaches hip level.
    const higherKneeY = Math.min(leftKnee.y, rightKnee.y);
    const raise = (hipMid.y - higherKneeY) / torso;
    const depth = clamp(raise, 0, 1);

    // Balance: shoulders stay level through the drill.
    const shoulderSkew = Math.abs(kp(pose, 'leftShoulder').y - kp(pose, 'rightShoulder').y) / torso;
    const alignment = 1 - normalize(shoulderSkew, 0, 0.3);

    return { depth, alignment, visibility };
  },
};

const JACK_REQUIRED = [
  'leftShoulder',
  'rightShoulder',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
] as const;

/**
 * Jumping jack: arms sweep up overhead as legs spread. Filmed facing the camera.
 * Depth tracks the hands rising above the shoulders — hands down at the sides
 * read ~0, hands overhead read ~1 — measured in torso units for scale-invariance.
 */
export const jumpingJack: ExerciseDefinition = {
  id: 'jumping-jack',
  label: 'Jumping Jacks',
  hudLabel: 'JACKS',
  requiredKeypoints: JACK_REQUIRED,
  downThreshold: 0.6,
  upThreshold: 0.25,
  fullDepthThreshold: 0.72,
  minRepDurationMs: 350,
  metricLabels: ['Arm range', 'Symmetry', 'Tempo consistency'],
  coachingTip: 'Clap your hands fully overhead and keep both arms even.',
  cues: ['Reach overhead!', 'Both arms even', 'Quick rhythm', 'Full range'],

  analyze(pose: Pose): FrameAnalysis {
    const visibility = meanScore(pose, JACK_REQUIRED);
    const leftShoulder = kp(pose, 'leftShoulder');
    const rightShoulder = kp(pose, 'rightShoulder');
    const leftWrist = kp(pose, 'leftWrist');
    const rightWrist = kp(pose, 'rightWrist');

    if (
      leftShoulder.score < MIN_KEYPOINT_SCORE ||
      rightShoulder.score < MIN_KEYPOINT_SCORE ||
      leftWrist.score < MIN_KEYPOINT_SCORE ||
      rightWrist.score < MIN_KEYPOINT_SCORE
    ) {
      return { depth: null, alignment: 0, visibility };
    }

    const shoulderMid = weightedMidpoint(leftShoulder, rightShoulder);
    const hipMid = weightedMidpoint(kp(pose, 'leftHip'), kp(pose, 'rightHip'));
    const wristMid = midpoint(leftWrist, rightWrist);

    const torso = Math.abs(hipMid.y - shoulderMid.y);
    if (torso < 0.02) return { depth: null, alignment: 0, visibility };

    // Hands above the shoulder line, in torso units: 0 at shoulder height,
    // ~1 a torso-length overhead.
    const raise = (shoulderMid.y - wristMid.y) / torso;
    const depth = clamp(raise, 0, 1);

    // Symmetry: both wrists at the same height.
    const wristSkew = Math.abs(leftWrist.y - rightWrist.y) / torso;
    const alignment = 1 - normalize(wristSkew, 0, 0.33);

    return { depth, alignment, visibility };
  },
};

export const EXERCISES: Record<ExerciseId, ExerciseDefinition> = {
  push: pushUp,
  squat,
  shoulder: shoulderRolls,
  stretch: fullBodyStretch,
  lunge,
  situp,
  'glute-bridge': gluteBridge,
  'pike-push': pikePush,
  'high-knees': highKnees,
  'jumping-jack': jumpingJack,
};

export function getExercise(id: ExerciseId): ExerciseDefinition {
  return EXERCISES[id];
}
