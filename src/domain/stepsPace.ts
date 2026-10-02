/**
 * Step pacing — whether today's steps are on track for the time of day, and
 * what it would take to get back on it.
 *
 * Same idea as `hydrationPace`: the goal spread evenly over the waking day
 * gives a "where you should be by now" line. Behind it, the gap is turned into
 * the thing a person can actually do — a walk of so many minutes — rather
 * than a bare number of steps.
 *
 * Pure and clock-injected.
 */

import { PACE_END_HOUR, PACE_START_HOUR } from '@/domain/hydrationPace';

/** A brisk walk, steps per minute. */
export const WALK_STEPS_PER_MIN = 100;
/** Within this many steps of the line counts as on pace. */
export const STEPS_TOLERANCE = 400;
/** Average stride, for the distance estimate. */
const STRIDE_M = 0.75;
/** Rough energy per step for an average adult. */
const KCAL_PER_STEP = 0.04;

export type StepsPaceStatus = 'done' | 'ahead' | 'on' | 'behind' | 'early';

export interface StepsPace {
  status: StepsPaceStatus;
  expectedSteps: number;
  /** 0–1, for the marker on the track. */
  expectedFraction: number;
  behindSteps: number;
  /** Minutes of brisk walking that close the gap, rounded up to 5. */
  walkMin: number;
  line: string;
}

export function stepsPace(steps: number, goal: number, now: Date): StepsPace {
  const g = Math.max(1, goal);
  const start = PACE_START_HOUR * 60;
  const end = PACE_END_HOUR * 60;
  const t = now.getHours() * 60 + now.getMinutes();
  const fraction = Math.max(0, Math.min(1, (t - start) / (end - start)));
  const expectedSteps = Math.round(g * fraction);
  const base = { expectedSteps, expectedFraction: fraction };

  if (steps >= g) {
    return { ...base, status: 'done', behindSteps: 0, walkMin: 0, line: 'Goal reached — every step now is a bonus' };
  }
  if (t < start && steps < STEPS_TOLERANCE) {
    return { ...base, status: 'early', behindSteps: 0, walkMin: 0, line: 'A morning walk sets the day up' };
  }
  const gap = expectedSteps - steps;
  if (gap > STEPS_TOLERANCE) {
    const walkMin = Math.max(5, Math.ceil(gap / WALK_STEPS_PER_MIN / 5) * 5);
    return {
      ...base,
      status: 'behind',
      behindSteps: gap,
      walkMin,
      line: `${formatCount(gap)} behind pace — a ${walkMin}-min walk catches up`,
    };
  }
  if (gap < -STEPS_TOLERANCE) {
    return { ...base, status: 'ahead', behindSteps: 0, walkMin: 0, line: `Ahead of pace by ${formatCount(-gap)}` };
  }
  return { ...base, status: 'on', behindSteps: 0, walkMin: 0, line: 'Right on pace — keep moving' };
}

/** Distance and energy for a step count — estimates, and labelled as such. */
export function stepsExtras(steps: number): { km: number; kcal: number } {
  return {
    km: Math.round(((steps * STRIDE_M) / 1000) * 10) / 10,
    kcal: Math.round(steps * KCAL_PER_STEP),
  };
}

function formatCount(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
