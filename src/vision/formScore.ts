import type { ExerciseDefinition } from './exercises';
import { clamp } from './geometry';
import type { RepRecord } from './repCounter';

export interface FormMetric {
  label: string;
  /** 0..100. */
  pct: number;
}

export interface FormReport {
  /** Overall 0..100 score shown in the ring. */
  score: number;
  grade: string;
  summary: string;
  /** Range-of-motion, alignment and tempo, in the exercise's label order. */
  metrics: readonly [FormMetric, FormMetric, FormMetric];
  /** One bar per rep for the per-rep depth chart. */
  bars: readonly { height: number; fullDepth: boolean }[];
  tip: string;
  fullDepthReps: number;
  partialReps: number;
}

/**
 * Coefficient of variation of rep durations, inverted into a 0..1 consistency
 * score. A metronomic set scores near 1; wildly uneven pacing trends to 0.
 */
export function tempoConsistency(reps: readonly RepRecord[]): number {
  if (reps.length < 2) return 1;

  const durations = reps.map((r) => r.durationMs);
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  if (mean <= 0) return 0;

  const variance = durations.reduce((acc, d) => acc + (d - mean) ** 2, 0) / durations.length;
  const cv = Math.sqrt(variance) / mean;

  // CV of 0 → 1.0, CV of 0.5 (very uneven) → 0.
  return clamp(1 - cv * 2, 0, 1);
}

export function meanRangeOfMotion(reps: readonly RepRecord[]): number {
  if (reps.length === 0) return 0;
  return reps.reduce((acc, r) => acc + r.peakDepth, 0) / reps.length;
}

export function meanAlignment(reps: readonly RepRecord[]): number {
  if (reps.length === 0) return 0;
  return reps.reduce((acc, r) => acc + r.alignment, 0) / reps.length;
}

const EMPTY_REPORT_TIP = 'No reps were detected — make sure your whole body is in frame.';

/**
 * Turns a set's rep records into the report shown after a session.
 *
 * Weighting favours range of motion because it's the signal athletes can act on
 * most directly, and the one the rep counter measures most reliably.
 */
export function buildFormReport(
  exercise: ExerciseDefinition,
  reps: readonly RepRecord[],
): FormReport {
  const [romLabel, alignLabel, tempoLabel] = exercise.metricLabels;

  if (reps.length === 0) {
    return {
      score: 0,
      grade: 'No reps tracked',
      summary: 'We could not detect a full repetition.',
      metrics: [
        { label: romLabel, pct: 0 },
        { label: alignLabel, pct: 0 },
        { label: tempoLabel, pct: 0 },
      ],
      bars: [],
      tip: EMPTY_REPORT_TIP,
      fullDepthReps: 0,
      partialReps: 0,
    };
  }

  const rom = meanRangeOfMotion(reps);
  const alignment = meanAlignment(reps);
  const tempo = tempoConsistency(reps);

  /**
   * Alignment needs hips and knees in frame. When the athlete is filmed close
   * up — common when the phone is propped on the floor — those joints score
   * poorly and alignment collapses toward zero even though the movement was
   * fine. Scoring that as "bad form" punishes camera placement, not technique.
   *
   * Below this, alignment is treated as unmeasured and its weight is
   * redistributed across the two channels we *can* trust.
   */
  const ALIGNMENT_MEASURABLE = 0.25;
  const alignmentMeasured = alignment >= ALIGNMENT_MEASURABLE;

  const score = Math.round(
    clamp(
      alignmentMeasured
        ? rom * 0.5 + alignment * 0.3 + tempo * 0.2
        : rom * 0.7 + tempo * 0.3,
      0,
      1,
    ) * 100,
  );
  const fullDepthReps = reps.filter((r) => r.fullDepth).length;

  return {
    score,
    grade: score >= 92 ? 'Excellent form' : score >= 84 ? 'Solid form' : 'Good effort',
    summary:
      exercise.id === 'squat'
        ? 'Depth and control were on point.'
        : 'Clean lockouts, steady pace.',
    metrics: [
      { label: romLabel, pct: Math.round(rom * 100) },
      // Shown as "—" by the report when the joints were never visible enough
      // to judge; a hard 0% would read as a failing grade for something we
      // simply could not see.
      { label: alignLabel, pct: alignmentMeasured ? Math.round(alignment * 100) : -1 },
      { label: tempoLabel, pct: Math.round(tempo * 100) },
    ],
    // Bars are scaled so a full-depth rep fills the chart; the 40% floor keeps
    // shallow reps visible rather than collapsing them to a sliver.
    bars: reps.map((r) => ({
      height: Math.round(clamp(40 + r.peakDepth * 60, 10, 100)),
      fullDepth: r.fullDepth,
    })),
    tip: exercise.coachingTip,
    fullDepthReps,
    partialReps: reps.length - fullDepthReps,
  };
}
