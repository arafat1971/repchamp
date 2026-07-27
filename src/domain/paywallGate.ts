/**
 * Paywall gate — freemium: free to build the habit, Pro sells depth.
 *
 * The old model hard-walled everyone after a few free reps. That's anti-habit
 * and anti-viral: a user who can't build a routine never becomes a subscriber,
 * and never invites a partner. The apps that actually earn (Strava, Ladder,
 * Peloton) let you *use* the core free, then convert you on depth and a trial.
 *
 * So the rule now:
 *  - **Core training is free, forever.** Push-ups and squats, solo or versus,
 *    couple mode — all free. This is what builds the daily habit and powers the
 *    couple/duel invite loop (the growth engine).
 *  - **Pro sells depth**, gated at the point of desire (not a wall on entry):
 *    the full exercise library, multi-week programmes, saved history and
 *    advanced stats. The paywall is a trial pitch shown when a free user reaches
 *    for one of these — never before they've felt a single rep counted.
 *
 * This file stays pure and unit-tested so the gate reads the same everywhere.
 * `isPro` is the RevenueCat truth from `proStore`, never a cached local flag.
 */

import { isExerciseFree } from '@/domain/pro';
import type { ExerciseId } from '@/vision/exercises';

/**
 * Can this athlete START this workout right now, free?
 *
 * Yes for any free exercise (push/squat) in any mode, and yes for couple mode
 * regardless. A Pro-only exercise is the one thing that prompts the paywall — and
 * even then only for a non-Pro user. Nothing here ever hard-walls the core app.
 */
export function canStartWorkout(input: {
  isPro: boolean;
  exercise: ExerciseId;
  isCoupleMode?: boolean;
}): boolean {
  if (input.isPro) return true;
  if (input.isCoupleMode) return true;
  return isExerciseFree(input.exercise);
}

/** Whether starting this workout should instead surface the Pro trial pitch. */
export function shouldPromptUpgrade(input: {
  isPro: boolean;
  exercise: ExerciseId;
  isCoupleMode?: boolean;
}): boolean {
  return !canStartWorkout(input);
}
