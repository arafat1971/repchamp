import { getKeypoint } from './keypoints';
import type { Pose } from './keypoints';
import { torsoTilt } from './yoga';

/**
 * Hands-free control from the same pose stream: raise a hand and hold it.
 *
 * No extra model — MoveNet already gives the wrists and the nose, and a wrist
 * clearly above the head is an unmistakable signal from across a room. What
 * makes it usable in a yoga session is what it refuses to fire on:
 *
 * - A hand has to be held up for `holdMs`, so reaching or waving doesn't count.
 * - "One hand" means one up *and the other visibly down*. Tree and Warrior I put
 *   both arms overhead, which is never read as one hand.
 * - The torso has to be upright. Triangle has one arm straight up, but the body
 *   is tipped over sideways, so it isn't a gesture.
 * - The caller passes `suppressed` while the body matches the pose being held,
 *   so a pose that happens to look like a gesture is never interrupted.
 * - After firing, the hands must come down before anything fires again.
 */

export type Gesture = 'one-hand' | 'both-hands';

/** How far above the nose (in normalised frame height) a wrist must be. */
const ABOVE_HEAD = 0.03;
/** Torso this close to vertical counts as standing upright. */
const MIN_UPRIGHT_TILT = 62;

/** Which hands are raised in this frame, or null when it isn't a clean signal. */
export function raisedHands(pose: Pose): Gesture | null {
  const nose = getKeypoint(pose, 'nose');
  const lw = getKeypoint(pose, 'leftWrist');
  const rw = getKeypoint(pose, 'rightWrist');
  const ls = getKeypoint(pose, 'leftShoulder');
  const rs = getKeypoint(pose, 'rightShoulder');
  if (!nose || !ls || !rs) return null;

  const tilt = torsoTilt(pose);
  if (tilt !== null && tilt < MIN_UPRIGHT_TILT) return null;

  const shoulderY = (ls.y + rs.y) / 2;
  // y grows downward in image space.
  const up = (w: typeof lw) => w !== null && w.y < nose.y - ABOVE_HEAD;
  const down = (w: typeof lw) => w !== null && w.y > shoulderY;

  const leftUp = up(lw);
  const rightUp = up(rw);
  if (leftUp && rightUp) return 'both-hands';
  if (leftUp && down(rw)) return 'one-hand';
  if (rightUp && down(lw)) return 'one-hand';
  return null;
}

export class GestureDetector {
  private candidate: Gesture | null = null;
  private since = 0;
  /** Fired and waiting for the hands to come down. */
  private latched = false;
  private clearSince: number | null = null;
  private lastFired = -Infinity;

  constructor(
    private readonly holdMs = 900,
    private readonly releaseMs = 300,
    private readonly cooldownMs = 1500,
  ) {}

  /** Feed one frame; returns a gesture on the frame it completes, else null. */
  push(pose: Pose, t: number, suppressed = false): Gesture | null {
    const seen = suppressed ? null : raisedHands(pose);

    if (this.latched) {
      if (seen === null) {
        if (this.clearSince === null) this.clearSince = t;
        if (t - this.clearSince >= this.releaseMs) {
          this.latched = false;
          this.clearSince = null;
          this.candidate = null;
        }
      } else {
        this.clearSince = null;
      }
      return null;
    }

    if (seen !== this.candidate) {
      this.candidate = seen;
      this.since = t;
      return null;
    }
    if (seen === null) return null;
    if (t - this.since < this.holdMs || t - this.lastFired < this.cooldownMs) return null;

    this.latched = true;
    this.lastFired = t;
    return seen;
  }

  /** 0..1 progress of the hand currently being held, for a fill-up ring. */
  progress(t: number): number {
    if (this.latched || this.candidate === null) return 0;
    return Math.min(1, (t - this.since) / this.holdMs);
  }

  reset(): void {
    this.candidate = null;
    this.latched = false;
    this.clearSince = null;
  }
}
