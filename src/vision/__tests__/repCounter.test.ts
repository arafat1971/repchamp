import { pushUp, shoulderRolls, fullBodyStretch, squat } from '../exercises';
import { RepCounter } from '../repCounter';
import type { Pose } from '../keypoints';
import { pushUpPose, repCycle, shoulderPose, squatPose, stretchPose } from './testPoses';

function feed(counter: RepCounter, poses: Pose[]) {
  return poses.map((pose) => counter.push(pose));
}

/** Concatenates `count` full push-up cycles back to back. */
function pushUpSet(count: number, opts: { bottom?: number; durationMs?: number } = {}) {
  const { bottom = 70, durationMs = 1200 } = opts;
  const poses: Pose[] = [];
  for (let i = 0; i < count; i++) {
    poses.push(
      ...repCycle(pushUpPose, {
        top: 170,
        bottom,
        durationMs,
        startAt: i * durationMs,
      }),
    );
  }
  return poses;
}

describe('RepCounter — push-ups', () => {
  it('counts a single clean rep', () => {
    const counter = new RepCounter(pushUp);
    const updates = feed(counter, pushUpSet(1));

    expect(counter.state.reps).toBe(1);
    expect(updates.filter((u) => u.completedRep !== null)).toHaveLength(1);
  });

  it('counts each rep in a set exactly once', () => {
    const counter = new RepCounter(pushUp);
    feed(counter, pushUpSet(8));

    expect(counter.state.reps).toBe(8);
    expect(counter.history).toHaveLength(8);
  });

  it('returns to the top phase after each rep', () => {
    const counter = new RepCounter(pushUp);
    feed(counter, pushUpSet(3));
    expect(counter.state.phase).toBe('up');
  });

  it('does not count a partial dip that never reaches depth', () => {
    const counter = new RepCounter(pushUp);
    // Only bends to 140° — nowhere near the 0.7 depth threshold.
    feed(counter, pushUpSet(5, { bottom: 140 }));
    expect(counter.state.reps).toBe(0);
  });

  it('does not double-count when the signal dithers at the bottom', () => {
    const counter = new RepCounter(pushUp);
    const poses: Pose[] = [];
    let t = 0;

    // Descend.
    for (let a = 170; a >= 75; a -= 5) poses.push(pushUpPose(a, (t += 33)));
    // Hover at the bottom, wobbling across the threshold repeatedly.
    for (let i = 0; i < 12; i++) poses.push(pushUpPose(i % 2 === 0 ? 75 : 85, (t += 33)));
    // Ascend.
    for (let a = 75; a <= 170; a += 5) poses.push(pushUpPose(a, (t += 33)));

    feed(counter, poses);
    expect(counter.state.reps).toBe(1);
  });

  it('rejects a bounce that is faster than the minimum rep duration', () => {
    const counter = new RepCounter(pushUp);
    // 150ms round trip — well under pushUp.minRepDurationMs (400ms).
    feed(counter, pushUpSet(1, { durationMs: 150 }));
    expect(counter.state.reps).toBe(0);
  });

  it('grades a shallow rep as partial and a deep rep as full depth', () => {
    const deep = new RepCounter(pushUp);
    feed(deep, pushUpSet(1, { bottom: 70 }));
    expect(deep.history[0]?.fullDepth).toBe(true);

    const shallow = new RepCounter(pushUp);
    // Peaks around 0.75 depth — past the 0.7 count threshold, short of the 0.78
    // full-depth mark, so it counts as a rep but is graded partial.
    feed(shallow, pushUpSet(1, { bottom: 95 }));
    expect(shallow.state.reps).toBe(1);
    expect(shallow.history[0]?.fullDepth).toBe(false);
  });

  it('keeps reporting tracking through a brief confidence dip', () => {
    // Confidence collapses at the bottom of a real push-up and recovers at the
    // top; the HUD must not flash "out of frame" once per rep.
    const counter = new RepCounter(pushUp);
    counter.push(pushUpPose(170, 0));

    // 300ms of unusable frames — shorter than the 700ms grace period.
    for (let t = 33; t <= 300; t += 33) counter.push(pushUpPose(120, t, 0.05));
    expect(counter.state.tracking).toBe(true);

    // Past the grace period it finally reports lost tracking.
    for (let t = 333; t <= 900; t += 33) counter.push(pushUpPose(120, t, 0.05));
    expect(counter.state.tracking).toBe(false);
  });

  it('recovers tracking as soon as confidence returns', () => {
    const counter = new RepCounter(pushUp);
    for (let t = 0; t <= 900; t += 33) counter.push(pushUpPose(120, t, 0.05));
    expect(counter.state.tracking).toBe(false);

    counter.push(pushUpPose(170, 933));
    expect(counter.state.tracking).toBe(true);
  });

  it('stops counting while the athlete is out of frame', () => {
    const counter = new RepCounter(pushUp);
    // Same motion, but every joint below the tracking confidence floor.
    const invisible = repCycle((angle, t) => pushUpPose(angle, t, 0.05), {
      top: 170,
      bottom: 70,
      durationMs: 1200,
    });

    const updates = feed(counter, invisible);
    expect(counter.state.reps).toBe(0);
    expect(updates.every((u) => u.tracking === false)).toBe(true);
  });

  it('abandons an in-progress down phase after a real tracking loss', () => {
    const counter = new RepCounter(pushUp);
    // Enter the down phase at full depth.
    counter.push(pushUpPose(170, 0));
    counter.push(pushUpPose(70, 400));
    expect(counter.state.phase).toBe('down');

    // Stay occluded past the grace window.
    for (let t = 433; t <= 1300; t += 33) counter.push(pushUpPose(70, t, 0.05));
    expect(counter.state.tracking).toBe(false);
    expect(counter.state.phase).toBe('up');

    // Returning to the top must NOT close a phantom rep.
    counter.push(pushUpPose(170, 1333));
    expect(counter.state.reps).toBe(0);
  });

  it('records duration and alignment for each completed rep', () => {
    const counter = new RepCounter(pushUp);
    feed(counter, pushUpSet(1, { durationMs: 1500 }));

    const rep = counter.history[0];
    expect(rep).toBeDefined();
    expect(rep!.index).toBe(1);
    expect(rep!.durationMs).toBeGreaterThan(400);
    // Synthetic poses use a perfectly straight plank.
    expect(rep!.alignment).toBeGreaterThan(0.9);
  });

  it('clears all state on reset', () => {
    const counter = new RepCounter(pushUp);
    feed(counter, pushUpSet(4));
    expect(counter.state.reps).toBe(4);

    counter.reset();
    expect(counter.state.reps).toBe(0);
    expect(counter.state.phase).toBe('up');
    expect(counter.history).toHaveLength(0);
  });
});

describe('RepCounter — squats', () => {
  it('counts a set of squats', () => {
    const counter = new RepCounter(squat);
    for (let i = 0; i < 5; i++) {
      feed(
        counter,
        repCycle(squatPose, { top: 175, bottom: 65, durationMs: 1400, startAt: i * 1400 }),
      );
    }
    expect(counter.state.reps).toBe(5);
  });

  it('ignores a quarter squat', () => {
    const counter = new RepCounter(squat);
    feed(counter, repCycle(squatPose, { top: 175, bottom: 145, durationMs: 1400 }));
    expect(counter.state.reps).toBe(0);
  });
});

describe('RepCounter — shoulder rolls (mobility)', () => {
  // These are the regression tests for the bug where shoulder/stretch spread
  // push-up/squat's `analyze` and therefore never counted a single rep.
  it('counts a set of full shoulder rolls', () => {
    const counter = new RepCounter(shoulderRolls);
    for (let i = 0; i < 4; i++) {
      // Hands rise from hip level (0) to shoulder level (1) and back.
      feed(
        counter,
        repCycle(shoulderPose, { top: 0, bottom: 1, durationMs: 1600, startAt: i * 1600 }),
      );
    }
    expect(counter.state.reps).toBe(4);
  });

  it('ignores a shrug that never lifts the hands', () => {
    const counter = new RepCounter(shoulderRolls);
    // Hands barely leave hip level — below the 0.6 down threshold.
    feed(counter, repCycle(shoulderPose, { top: 0, bottom: 0.3, durationMs: 1600 }));
    expect(counter.state.reps).toBe(0);
  });
});

describe('RepCounter — full-body stretch (mobility)', () => {
  it('counts a set of reach-and-fold stretches', () => {
    const counter = new RepCounter(fullBodyStretch);
    for (let i = 0; i < 3; i++) {
      // Hands sweep from overhead (-1) down to hip level (+1) and back up.
      feed(
        counter,
        repCycle(stretchPose, { top: -1, bottom: 1, durationMs: 2000, startAt: i * 2000 }),
      );
    }
    expect(counter.state.reps).toBe(3);
  });

  it('ignores a shallow reach that never folds down', () => {
    const counter = new RepCounter(fullBodyStretch);
    // Hands go from overhead to only shoulder level (drop 0 → depth 0.5),
    // short of the 0.6 down threshold.
    feed(counter, repCycle(stretchPose, { top: -1, bottom: 0, durationMs: 2000 }));
    expect(counter.state.reps).toBe(0);
  });
});
