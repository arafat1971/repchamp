import type { ExerciseDefinition } from './exercises';
import { OneEuroFilter, clamp } from './geometry';
import type { Pose } from './keypoints';

/** A completed repetition, with the quality signals gathered during it. */
export interface RepRecord {
  index: number;
  /** Deepest point reached, 0..1. */
  peakDepth: number;
  /** True when `peakDepth` cleared the exercise's full-depth threshold. */
  fullDepth: boolean;
  /** Wall-clock duration of the rep, ms. */
  durationMs: number;
  /** Mean alignment quality sampled across the rep, 0..1. */
  alignment: number;
  completedAt: number;
}

export type RepPhase = 'up' | 'down';

export interface RepCounterState {
  reps: number;
  phase: RepPhase;
  /** Smoothed depth of the current frame, 0..1. */
  depth: number;
  /** True while the required joints are visible with usable confidence. */
  tracking: boolean;
  /**
   * Mean confidence of the joints this exercise measures — the exact value the
   * `tracking` decision is made on. Surfaced so the on-device trace can show
   * why tracking dropped rather than leaving it to be inferred.
   */
  visibility: number;
}

export interface RepCounterUpdate extends RepCounterState {
  /** Set on the single frame where a rep completed, otherwise null. */
  completedRep: RepRecord | null;
}

/** Below this mean confidence we stop counting rather than guess. */
const TRACKING_VISIBILITY_FLOOR = 0.35;
/**
 * How long confidence must stay low before the athlete is told they are out of
 * frame.
 *
 * Measured on-device, keypoint confidence reliably collapses at the bottom of
 * every push-up — the body is foreshortened and close to the floor there — then
 * recovers at the top. Without this grace period the HUD flashes "step back
 * into frame" once per rep, while the counter is in fact tracking fine.
 */
const TRACKING_GRACE_MS = 700;
/** A "rep" longer than this is someone resting mid-position, not a slow rep. */
const MAX_REP_DURATION_MS = 12_000;

/**
 * Counts repetitions from a stream of poses using hysteresis on movement depth.
 *
 * The two thresholds must be crossed in order — down past `downThreshold`, then
 * back up past `upThreshold` — before a rep is booked. A single threshold would
 * double-count every time the smoothed signal dithered across it at the bottom
 * of a rep, which is exactly where the signal is noisiest.
 *
 * Deliberately framework-free and synchronous so it can be unit-tested against
 * recorded pose sequences without a camera. See `repCounter.test.ts`.
 */
export class RepCounter {
  private readonly filter: OneEuroFilter;
  private phase: RepPhase = 'up';
  private reps = 0;
  private depth = 0;
  private tracking = false;
  private visibility = 0;
  /** Timestamp of the first frame in the current run of unusable frames. */
  private unusableSince: number | null = null;

  /** Accumulators for the rep currently in progress. */
  private repStartedAt: number | null = null;
  private peakDepth = 0;
  private alignmentSum = 0;
  private alignmentSamples = 0;

  private readonly records: RepRecord[] = [];

  constructor(private readonly exercise: ExerciseDefinition) {
    this.filter = new OneEuroFilter();
  }

  get state(): RepCounterState {
    return {
      reps: this.reps,
      phase: this.phase,
      depth: this.depth,
      tracking: this.tracking,
      visibility: this.visibility,
    };
  }

  /** Completed reps in order. Safe to read at any time; the array is copied. */
  get history(): RepRecord[] {
    return [...this.records];
  }

  /**
   * Feed one inference result. Returns the updated state, with `completedRep`
   * set on the frame that closes a repetition.
   */
  push(pose: Pose): RepCounterUpdate {
    const analysis = this.exercise.analyze(pose);
    this.visibility = analysis.visibility;
    const usable = analysis.depth !== null && analysis.visibility >= TRACKING_VISIBILITY_FLOOR;

    if (!usable) {
      // Hold the last depth rather than snapping to 0 — a dropped frame or two
      // shouldn't look like the athlete teleported to the top of the movement.
      this.unusableSince ??= pose.timestamp;
      if (pose.timestamp - this.unusableSince >= TRACKING_GRACE_MS) this.tracking = false;
      return { ...this.state, completedRep: null };
    }

    this.unusableSince = null;
    this.tracking = true;
    this.depth = clamp(this.filter.filter(analysis.depth as number, pose.timestamp), 0, 1);

    if (this.phase === 'up') {
      if (this.depth >= this.exercise.downThreshold) {
        this.phase = 'down';
        this.repStartedAt = pose.timestamp;
        this.peakDepth = this.depth;
        this.alignmentSum = analysis.alignment;
        this.alignmentSamples = 1;
      }
      return { ...this.state, completedRep: null };
    }

    // phase === 'down'
    this.peakDepth = Math.max(this.peakDepth, this.depth);
    this.alignmentSum += analysis.alignment;
    this.alignmentSamples += 1;

    if (this.depth > this.exercise.upThreshold) {
      return { ...this.state, completedRep: null };
    }

    // Returned to the top — decide whether this counts.
    const startedAt = this.repStartedAt ?? pose.timestamp;
    const durationMs = pose.timestamp - startedAt;
    this.phase = 'up';

    if (durationMs < this.exercise.minRepDurationMs || durationMs > MAX_REP_DURATION_MS) {
      this.resetRepAccumulators();
      return { ...this.state, completedRep: null };
    }

    this.reps += 1;
    const record: RepRecord = {
      index: this.reps,
      peakDepth: this.peakDepth,
      fullDepth: this.peakDepth >= this.exercise.fullDepthThreshold,
      durationMs,
      alignment: this.alignmentSamples > 0 ? this.alignmentSum / this.alignmentSamples : 0,
      completedAt: pose.timestamp,
    };
    this.records.push(record);
    this.resetRepAccumulators();

    return { ...this.state, completedRep: record };
  }

  private resetRepAccumulators(): void {
    this.repStartedAt = null;
    this.peakDepth = 0;
    this.alignmentSum = 0;
    this.alignmentSamples = 0;
  }

  reset(): void {
    this.filter.reset();
    this.phase = 'up';
    this.reps = 0;
    this.depth = 0;
    this.tracking = false;
    this.visibility = 0;
    this.unusableSince = null;
    this.records.length = 0;
    this.resetRepAccumulators();
  }
}
