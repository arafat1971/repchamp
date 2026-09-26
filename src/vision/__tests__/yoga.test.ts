import { GestureDetector, raisedHands } from '../gestures';
import type { Keypoint, Pose } from '../keypoints';
import {
  HoldTracker,
  OUT_OF_FRAME_CUE,
  SWITCH_SIDE_CUE,
  YOGA_FLOWS,
  YOGA_POSES,
  flowMinutes,
  flowScore,
  getFlow,
  holdMilestone,
  singlePoseFlow,
  mirrorFigure,
  readPose,
  targetScore,
  type Figure,
} from '../yoga';

/** A pose built from a reference stick figure (100×100 box → 0..1). */
function figurePose(f: Figure, overrides: Partial<Record<keyof Figure, readonly [number, number] | null>> = {}): Pose {
  const at = (k: keyof Figure): Keypoint => {
    const p = k in overrides ? overrides[k] : f[k];
    return p ? { x: p[0] / 100, y: p[1] / 100, score: 0.9 } : { x: 0, y: 0, score: 0 };
  };
  const head = at('head');
  return {
    timestamp: 0,
    keypoints: [head, head, head, head, head, at('ls'), at('rs'), at('le'), at('re'), at('lw'), at('rw'), at('lh'), at('rh'), at('lk'), at('rk'), at('la'), at('ra')],
  };
}

const mirrored = mirrorFigure;

describe('readPose', () => {
  it.each(Object.values(YOGA_POSES).map((p) => [p.id, p] as const))(
    '%s: its own reference figure is a match',
    (_id, pose) => {
      const reading = readPose(figurePose(pose.figure), pose);
      expect(reading.match).not.toBeNull();
      expect(reading.match!).toBeGreaterThanOrEqual(0.8);
    },
  );

  it('mountain is not tree', () => {
    const r = readPose(figurePose(YOGA_POSES.mountain.figure), YOGA_POSES.tree);
    expect(r.match!).toBeLessThan(0.6);
  });

  it('an asymmetric pose reads either way round and reports the side', () => {
    const w2 = YOGA_POSES.warrior2;
    const a = readPose(figurePose(w2.figure), w2);
    const b = readPose(figurePose(mirrored(w2.figure)), w2);
    expect(a.match!).toBeGreaterThanOrEqual(0.8);
    expect(b.match!).toBeGreaterThanOrEqual(0.8);
    expect(a.side).not.toBe(b.side);
  });

  it('pinning the other side rejects the same side twice', () => {
    const w2 = YOGA_POSES.warrior2;
    const first = readPose(figurePose(w2.figure), w2);
    const other = first.side === 'left' ? 'right' : 'left';
    const pinned = readPose(figurePose(w2.figure), w2, other);
    expect(pinned.match!).toBeLessThan(0.6);
    expect(pinned.cue).toBe(SWITCH_SIDE_CUE);
    expect(readPose(figurePose(mirrored(w2.figure)), w2, other).match!).toBeGreaterThanOrEqual(0.8);
  });

  it('asks you to step back when too little is visible', () => {
    const f = YOGA_POSES.warrior2.figure;
    const r = readPose(figurePose(f, { lk: null, rk: null, la: null, ra: null, lh: null, rh: null }), YOGA_POSES.warrior2);
    expect(r.match).toBeNull();
    expect(r.cue).toBe(OUT_OF_FRAME_CUE);
  });

  it('names the fix that matters: a shallow front knee in Warrior II', () => {
    const f = YOGA_POSES.warrior2.figure;
    // Front knee almost straight.
    const r = readPose(figurePose(f, { lk: [36, 73] }), YOGA_POSES.warrior2, 'left');
    expect(r.cue).toBe('Bend deeper into your front knee');
  });
});

describe('targetScore', () => {
  it('is full inside the tolerance and falls off beyond it', () => {
    expect(targetScore(100, 100, 10)).toBe(1);
    expect(targetScore(110, 100, 10)).toBe(1);
    expect(targetScore(127.5, 100, 10)).toBeCloseTo(0.5);
    expect(targetScore(160, 100, 10)).toBe(0);
  });
});

describe('HoldTracker', () => {
  it('only banks time once in the pose, and finishes at the target', () => {
    const h = new HoldTracker(2000);
    let u = h.push(0.3, 0);
    for (let t = 100; t <= 1000; t += 100) u = h.push(0.3, t);
    expect(u.inPose).toBe(false);
    expect(u.heldMs).toBe(0);
    for (let t = 1100; t <= 4000 && !u.done; t += 100) u = h.push(0.95, t);
    expect(u.done).toBe(true);
    expect(h.summary().alignment).toBeGreaterThan(0.8);
  });

  it('a brief wobble does not drop you out', () => {
    const h = new HoldTracker(10_000);
    let t = 0;
    for (; t <= 1000; t += 100) h.push(0.95, t);
    for (let i = 0; i < 4; i++, t += 100) h.push(0.2, t);
    const u = h.push(0.95, t);
    expect(u.inPose).toBe(true);
  });

  it('a long fall does', () => {
    const h = new HoldTracker(10_000);
    let t = 0;
    for (; t <= 1000; t += 100) h.push(0.95, t);
    let u = h.push(0.1, t);
    for (let i = 0; i < 25; i++) u = h.push(0.1, (t += 100));
    expect(u.inPose).toBe(false);
  });

  it('does not bank a stall or a pause', () => {
    const h = new HoldTracker(60_000);
    h.push(0.95, 0);
    h.push(0.95, 100);
    h.push(0.95, 10_000); // app was backgrounded
    expect(h.summary().heldMs).toBeLessThanOrEqual(350);
    h.resume();
    h.push(0.95, 50_000);
    expect(h.summary().heldMs).toBeLessThanOrEqual(350);
  });
});

describe('flows', () => {
  it('every flow step names a real pose and has a sensible hold', () => {
    for (const flow of YOGA_FLOWS) {
      expect(flow.steps.length).toBeGreaterThan(3);
      for (const s of flow.steps) {
        expect(YOGA_POSES[s.pose]).toBeDefined();
        expect(s.holdSec).toBeGreaterThanOrEqual(10);
      }
      expect(flowMinutes(flow)).toBeGreaterThan(0);
    }
  });

  it('the score weighs alignment by how much was actually held', () => {
    const full = [{ pose: 'tree' as const, heldMs: 30_000, targetMs: 30_000, alignment: 0.9, skipped: false }];
    expect(flowScore(full)).toBe(90);
    const half = [...full, { pose: 'boat' as const, heldMs: 0, targetMs: 30_000, alignment: 0, skipped: true }];
    expect(flowScore(half)).toBe(45);
    expect(flowScore([])).toBe(0);
  });
});

describe('gestures', () => {
  const mountain = YOGA_POSES.mountain.figure;
  const oneUpFixed = figurePose(mountain, { re: [60, 14], rw: [61, 2] });
  const bothUp = figurePose(mountain, { le: [40, 14], lw: [39, 2], re: [60, 14], rw: [61, 2] });

  it('reads one hand, both hands, and hands down', () => {
    expect(raisedHands(oneUpFixed)).toBe('one-hand');
    expect(raisedHands(bothUp)).toBe('both-hands');
    expect(raisedHands(figurePose(mountain))).toBeNull();
  });

  it('does not read Tree (both arms up) as one hand, or Triangle as anything', () => {
    expect(raisedHands(figurePose(YOGA_POSES.tree.figure))).toBe('both-hands');
    expect(raisedHands(figurePose(YOGA_POSES.triangle.figure))).toBeNull();
  });

  it('fires once after a hold, and again only after the hand comes down', () => {
    const g = new GestureDetector(900, 300, 1500);
    const fired: (string | null)[] = [];
    let t = 0;
    for (; t <= 1200; t += 100) fired.push(g.push(oneUpFixed, t));
    expect(fired.filter(Boolean)).toEqual(['one-hand']);
    // Still up: nothing more.
    for (; t <= 4000; t += 100) expect(g.push(oneUpFixed, t)).toBeNull();
    // Down, then up again.
    for (let i = 0; i < 5; i++, t += 100) g.push(figurePose(mountain), t);
    const again: (string | null)[] = [];
    for (let i = 0; i < 12; i++, t += 100) again.push(g.push(oneUpFixed, t));
    expect(again.filter(Boolean)).toEqual(['one-hand']);
  });

  it('a quick wave does not fire, and suppression blocks it', () => {
    const g = new GestureDetector(900);
    let t = 0;
    for (; t < 500; t += 100) expect(g.push(oneUpFixed, t)).toBeNull();
    g.push(figurePose(mountain), t);
    const s = new GestureDetector(900);
    for (t = 0; t <= 2000; t += 100) expect(s.push(oneUpFixed, t, true)).toBeNull();
  });
});

describe('single-pose practice', () => {
  it('practises a one-sided pose on both sides, a symmetric one once', () => {
    const tree = singlePoseFlow('tree');
    expect(tree.steps).toHaveLength(2);
    expect(tree.steps[1]!.switchSide).toBe(true);
    expect(singlePoseFlow('mountain').steps).toHaveLength(1);
  });

  it('resolves pose flow ids and rejects unknown ones', () => {
    expect(getFlow('pose:boat')?.title).toBe('Boat');
    expect(getFlow('pose:nope')).toBeUndefined();
    expect(getFlow('power')?.title).toBe('Advanced power flow');
  });
});

describe('holdMilestone', () => {
  const none = { half: false, end: false };
  it('says halfway on a long hold, then the last three seconds', () => {
    expect(holdMilestone(5000, 30_000, none)).toBeNull();
    expect(holdMilestone(15_000, 30_000, none)).toBe('half');
    expect(holdMilestone(15_000, 30_000, { half: true, end: false })).toBeNull();
    expect(holdMilestone(27_000, 30_000, { half: true, end: false })).toBe('end');
    expect(holdMilestone(30_000, 30_000, { half: true, end: false })).toBeNull();
  });
  it('skips halfway on a short hold', () => {
    expect(holdMilestone(8000, 15_000, none)).toBeNull();
    expect(holdMilestone(12_000, 15_000, none)).toBe('end');
  });
});
