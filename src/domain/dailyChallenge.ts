/**
 * The daily challenge — one definition, read by everything that shows it.
 *
 * The challenge was declared three times: `DAILY_EXERCISE`/`DAILY_TARGET` on
 * Home, `FAB_DAILY_EXERCISE`/`FAB_DAILY_TARGET` in the tab layout (whose
 * comment already conceded "Mirrors app/(tabs)/index.tsx and
 * app/modal/daily.tsx"), and a bare `DAILY_TARGET = 25` in the modal. Each of
 * the three then recomputed today's best set with its own filter/reduce.
 *
 * Three copies of one rule is three chances to disagree. Changing the target in
 * one place leaves the hero saying 25/25 cleared while the FAB still offers the
 * challenge as open — the athlete is told two contradictory things about the
 * same goal on the same screen, and neither is obviously the wrong one.
 *
 * ## Why the XP figure lives here too
 *
 * The modal advertises "+300 XP REWARD" as a literal. That happens to be true:
 * `xpForSession('solo', true)` returns exactly 300, and the challenge starts a
 * solo session. But it is true by coincidence of two numbers matching, not by
 * construction — change the solo payout and the hero keeps advertising 300
 * while the app pays something else.
 *
 * `challengeXpReward` derives it from `xpForSession` instead, so the promise
 * cannot drift from what is actually granted. A displayed reward that the app
 * does not pay is the failure `progressProof` exists to refuse: an athlete who
 * is told 300 and receives 80 learns to discount every number the app shows
 * them afterwards.
 *
 * Pure and dependency-free past `progression`, like the rest of `domain/`: the
 * rule is testable without a store, a screen, or a clock.
 */

import { xpForSession } from '@/domain/progression';
import type { ExerciseId } from '@/vision/exercises';

/**
 * The featured movement and target.
 *
 * Push-ups at 25 is what all three call sites already carried; this changes
 * nothing about the challenge, only where the numbers are written down.
 */
export const DAILY_CHALLENGE_EXERCISE: ExerciseId = 'push';
export const DAILY_CHALLENGE_TARGET = 25;

/**
 * XP for clearing it, derived rather than typed.
 *
 * The challenge launches `mode: 'solo'` with the target as the goal, so
 * clearing it is a won solo session. Reading the payout from the same function
 * that grants it means the advertised number is the paid number by
 * construction.
 */
export function challengeXpReward(): number {
  return xpForSession('solo', true);
}

export interface DailyChallengeProgress {
  exercise: ExerciseId;
  target: number;
  /** Best single set of the challenge movement today — 0 before any attempt. */
  best: number;
  /** Reps still needed; 0 once cleared. */
  remaining: number;
  /** 0–100, for `ProgressBar`. Clamped, so a 40-rep set on a 25 target is 100. */
  percent: number;
  /** True once the target is met. */
  cleared: boolean;
}

/**
 * Where the athlete stands against today's challenge.
 *
 * Best single set rather than the day's total, which is what all three call
 * sites already computed and what the challenge asks for — "beat 25 push-ups"
 * is one set of 25, not five sets of five. Stated here so the rule stops being
 * re-derived by each caller.
 *
 * Takes `today` as a day key rather than reading the clock, so the caller stays
 * timezone-consistent with `dayKey()` and the result is provable in a test.
 */
export function dailyChallengeProgress(
  sessions: readonly { day: string; exercise: ExerciseId; reps: number }[],
  today: string,
): DailyChallengeProgress {
  const best = sessions
    .filter((s) => s.day === today && s.exercise === DAILY_CHALLENGE_EXERCISE)
    .reduce((max, s) => Math.max(max, s.reps), 0);

  const cleared = best >= DAILY_CHALLENGE_TARGET;

  return {
    exercise: DAILY_CHALLENGE_EXERCISE,
    target: DAILY_CHALLENGE_TARGET,
    best,
    remaining: Math.max(0, DAILY_CHALLENGE_TARGET - best),
    percent: Math.min(100, Math.round((best / DAILY_CHALLENGE_TARGET) * 100)),
    cleared,
  };
}
