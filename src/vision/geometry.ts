import type { Keypoint } from './keypoints';

export interface Point {
  x: number;
  y: number;
}

/**
 * Interior angle at vertex `b` formed by the segments b→a and b→c, in degrees (0..180).
 *
 * This is the workhorse of rep detection: elbow angle drives push-ups, knee angle
 * drives squats. Returns `null` when either segment has zero length, which happens
 * when two joints land on the same pixel in a low-confidence frame.
 */
export function angleAt(a: Point, b: Point, c: Point): number | null {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;

  const abLen = Math.hypot(abx, aby);
  const cbLen = Math.hypot(cbx, cby);
  if (abLen === 0 || cbLen === 0) return null;

  const cos = (abx * cbx + aby * cby) / (abLen * cbLen);
  // Guard against float drift pushing |cos| just past 1, which would yield NaN.
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Angle of the segment a→b measured from horizontal, in degrees (0..90).
 * Used for torso/back alignment checks, where only the magnitude of the tilt matters.
 */
export function tiltFromHorizontal(a: Point, b: Point): number {
  return (Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * 180) / Math.PI;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Map `value` from the range [from, to] onto 0..1, clamped at both ends.
 * `from` may be greater than `to` — that simply inverts the ramp, which is what
 * we want for angles that *decrease* as the athlete descends.
 */
export function normalize(value: number, from: number, to: number): number {
  if (from === to) return 0;
  return clamp((value - from) / (to - from), 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * One Euro filter — an adaptive low-pass filter that trades jitter against lag
 * based on the signal's own velocity.
 *
 * Pose keypoints are noisy at rest and fast during a rep. A fixed smoothing
 * constant either leaves visible jitter at the top of a push-up or lags the
 * bottom of the descent enough to miscount. One Euro fixes both: it smooths
 * hard when the joint is slow, and lets fast movement through nearly unfiltered.
 *
 * @see Casiez, Roussel & Vogel (2012), "1€ Filter"
 */
export class OneEuroFilter {
  private lastValue: number | null = null;
  private lastDerivative = 0;
  private lastTimestamp: number | null = null;

  constructor(
    /** Baseline cutoff frequency (Hz). Lower = smoother but laggier at rest. */
    private readonly minCutoff = 1.0,
    /**
     * How aggressively the cutoff rises with speed.
     *
     * Tuned for a 0..1 depth signal, where a brisk rep moves at roughly 1.5–3
     * units/second. Values in the hundredths (common when filtering pixel
     * coordinates, which move by hundreds of units) leave this term negligible
     * against `minCutoff` and turn the filter into a plain low-pass.
     *
     * This was 1.0, which was still too close to that plain low-pass: the
     * cutoff barely rose during a rep, so the filter lagged the descent and
     * clipped its peak. A push-up whose true depth was 0.75 came out at 0.68
     * once the thermal throttle dropped inference to ~10Hz — under the 0.70
     * `downThreshold`, so the rep was never even *started*, let alone counted.
     * Reps went missing rather than being graded shallow.
     *
     * At 10 the same rep holds ~0.74 across 30Hz and 10Hz, for roughly 10%
     * more frame-to-frame jitter on a noisy resting signal. Deliberately fixes
     * this by making the filter track honestly rather than by loosening any
     * threshold or duration gate — those are what keep duel scores comparable.
     */
    private readonly beta = 10.0,
    /** Cutoff for the derivative estimate itself (Hz). */
    private readonly derivativeCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, timestamp: number): number {
    if (this.lastValue === null || this.lastTimestamp === null) {
      this.lastValue = value;
      this.lastTimestamp = timestamp;
      return value;
    }

    // Fall back to 60fps if timestamps are equal or go backwards (frame reorder).
    const dt = timestamp > this.lastTimestamp ? (timestamp - this.lastTimestamp) / 1000 : 1 / 60;

    const rawDerivative = (value - this.lastValue) / dt;
    const dAlpha = OneEuroFilter.alpha(this.derivativeCutoff, dt);
    const derivative = dAlpha * rawDerivative + (1 - dAlpha) * this.lastDerivative;

    const cutoff = this.minCutoff + this.beta * Math.abs(derivative);
    const alpha = OneEuroFilter.alpha(cutoff, dt);
    const filtered = alpha * value + (1 - alpha) * this.lastValue;

    this.lastValue = filtered;
    this.lastDerivative = derivative;
    this.lastTimestamp = timestamp;
    return filtered;
  }

  reset(): void {
    this.lastValue = null;
    this.lastDerivative = 0;
    this.lastTimestamp = null;
  }
}

/** Confidence-weighted average of a joint pair — used to build a virtual midline joint. */
export function weightedMidpoint(a: Keypoint, b: Keypoint): Point {
  const total = a.score + b.score;
  if (total === 0) return midpoint(a, b);
  return {
    x: (a.x * a.score + b.x * b.score) / total,
    y: (a.y * a.score + b.y * b.score) / total,
  };
}
