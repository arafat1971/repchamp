/**
 * Today's step count.
 *
 * Unlike water, steps are not logged — the phone already knows. So there is no
 * store and no append-only log here: the pedometer is asked for today's total
 * and that answer is the truth. What this module owns is the *shape* of that
 * answer, including the shapes that mean "we cannot tell you".
 *
 * ## Both platforms count, by different routes
 *
 * iOS answers "how many steps since midnight?" directly via
 * `Pedometer.getStepCountAsync`.
 *
 * Android has no such call, and this module previously concluded the platform
 * therefore could not answer — because `expo-sensors`' `watchStepCount` only
 * reports deltas while subscribed, which would undercount by however long the
 * phone sat in a pocket. That was wrong about the platform. The hardware
 * sensor underneath, `TYPE_STEP_COUNTER`, counts continuously whether or not
 * any app is listening and survives the app being closed; what it lacks is a
 * day boundary, which `domain/stepBaseline` supplies. See
 * `plugins/withStepCounter.js`.
 *
 * The principle that produced the wrong conclusion still holds and still
 * governs every branch here: a wrong number in a health context is worse than
 * an absent one, because an athlete cannot tell a partial count from a lazy
 * day. Hence `starting` rather than a zero, and `partial` on a post-reboot
 * figure rather than presenting it as the day's total.
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
  | 'error'
  /**
   * The day has only just been anchored and there is no count yet.
   *
   * Android's counter is cumulative since boot, so the first reading of a day
   * establishes a baseline rather than producing a total. A 0 here would read
   * as "you have not moved today" when the truth is "we started measuring a
   * moment ago" — see `domain/stepBaseline`.
   */
  | 'starting';

export type StepsState =
  | { status: 'loading' }
  | {
      status: 'ready';
      steps: number;
      goal: number;
      /**
       * True when the figure understates the day.
       *
       * Only after a mid-day reboot on Android: the hardware counter resets
       * and the earlier steps are unrecoverable, so the count is real but
       * incomplete. The card says so rather than presenting it as a total.
       */
      partial?: boolean;
    }
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
      /* Web, and Android builds predating the step-counter plugin. Named as
         "this device" rather than a platform, because on Android it means an
         old build rather than a permanent limitation. */
      return 'Step counting isn’t available on this device.';
    case 'denied':
      return 'Allow motion access to count your steps.';
    case 'no-sensor':
      return 'This device has no step counter.';
    case 'error':
      return 'Could not read your steps just now.';
    case 'starting':
      return 'Counting your steps from now.';
  }
}

/** True when the athlete could fix this themselves by granting access. */
export function isFixableByAthlete(reason: StepsUnavailableReason): boolean {
  return reason === 'denied';
}
