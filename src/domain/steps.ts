/**
 * Today's step count.
 *
 * Unlike water, steps are not logged — the phone already knows. So there is no
 * store and no append-only log here: the pedometer is asked for today's total
 * and that answer is the truth. What this module owns is the *shape* of that
 * answer, including the shapes that mean "we cannot tell you".
 *
 * ## Why this is iOS-only
 *
 * `Pedometer.getStepCountAsync(start, end)` — "how many steps since midnight?"
 * — is iOS-only. Android exposes `watchStepCount`, which counts from the
 * moment you subscribe, and neither platform delivers updates in the
 * background. So on Android the honest answer to "how many steps today?" is
 * not a smaller number, it is *no number*: a count that silently starts at
 * zero every time the app opens would read as a daily total and undercount by
 * however long the phone was in a pocket.
 *
 * Showing nothing is the right failure. A wrong number in a health context is
 * worse than an absent one, and an athlete cannot tell a partial count from a
 * lazy day.
 */

/** Why there is no step count to show. */
export type StepsUnavailableReason =
  /** This platform cannot answer "steps today" — Android, web. */
  | 'unsupported'
  /** The athlete has not granted motion access, or declined it. */
  | 'denied'
  /** Hardware without a step counter, or a simulator. */
  | 'no-sensor'
  /** Asked, but the read failed. Transient; worth retrying. */
  | 'error';

export type StepsState =
  | { status: 'loading' }
  | { status: 'ready'; steps: number; goal: number }
  | { status: 'unavailable'; reason: StepsUnavailableReason };

export const DEFAULT_STEP_GOAL = 8000;
export const MIN_STEP_GOAL = 2000;
export const MAX_STEP_GOAL = 30000;
const STEP_GOAL_STEP = 1000;

/**
 * Ceiling on a day's steps.
 *
 * Also duplicated in `firestore.rules` alongside the water ceiling, for the
 * same reason and with the same drift test. 200k is far past a human day
 * (the record is ~120k) but well short of a value that would render as
 * nonsense on a partner's card.
 */
export const MAX_DAILY_STEPS = 200000;

/** A step count we are willing to believe, or null. */
export function sanitizeSteps(steps: number): number | null {
  if (!Number.isFinite(steps)) return null;
  const rounded = Math.round(steps);
  if (rounded < 0 || rounded > MAX_DAILY_STEPS) return null;
  return rounded;
}

export function sanitizeStepGoal(goal: number): number {
  if (!Number.isFinite(goal)) return DEFAULT_STEP_GOAL;
  const rounded = Math.round(goal);
  return Math.min(MAX_STEP_GOAL, Math.max(MIN_STEP_GOAL, rounded));
}

/** The next goal up or down, a thousand at a time, clamped to the band. */
export function stepStepGoal(goal: number, direction: 1 | -1): number {
  return sanitizeStepGoal(sanitizeStepGoal(goal) + direction * STEP_GOAL_STEP);
}

export interface StepsProgress {
  steps: number;
  goal: number;
  /** 0–100, already clamped. */
  percent: number;
  remaining: number;
  met: boolean;
}

export function stepsProgress(steps: number, goal: number): StepsProgress {
  const safeGoal = sanitizeStepGoal(goal);
  const safeSteps = sanitizeSteps(steps) ?? 0;
  return {
    steps: safeSteps,
    goal: safeGoal,
    percent: Math.min(100, Math.round((safeSteps / safeGoal) * 100)),
    remaining: Math.max(0, safeGoal - safeSteps),
    met: safeSteps >= safeGoal,
  };
}

/** "8,432" — grouped, because five digits are unreadable otherwise. */
export function formatSteps(steps: number): string {
  const safe = sanitizeSteps(steps) ?? 0;
  return safe.toLocaleString('en-US');
}

/**
 * What to tell the athlete when there is no count.
 *
 * Each line names the actual situation rather than hedging. "Not available on
 * Android" is a fact an athlete can act on (or stop wondering about); "steps
 * unavailable" invites them to go looking for a setting that will not help.
 */
export function stepsUnavailableCopy(reason: StepsUnavailableReason): string {
  switch (reason) {
    case 'unsupported':
      return 'Step counting is iPhone-only for now.';
    case 'denied':
      return 'Allow motion access to count your steps.';
    case 'no-sensor':
      return 'This device has no step counter.';
    case 'error':
      return 'Could not read your steps just now.';
  }
}

/** True when the athlete could fix this themselves by granting access. */
export function isFixableByAthlete(reason: StepsUnavailableReason): boolean {
  return reason === 'denied';
}
