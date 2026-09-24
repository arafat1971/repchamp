/**
 * How fast an AI partner races *this* athlete.
 *
 * Every AI partner used to run at a fixed pace — 36 to 92 reps a minute — and
 * a real duel on the Pixel 7a showed what that means for a normal athlete:
 * 5 push-ups against 12, a loss every time, however well they moved. A rival
 * you can never beat is not a rival, it is a treadmill.
 *
 * So a bot now races from the athlete's own recent pace, pushed a little
 * harder than it: close enough to win with a good set, not a gift. The
 * partners keep their characters — the gentlest runs at your pace, the
 * toughest about a fifth faster — and none ever runs faster than its own
 * listed pace, so a strong athlete still meets a real ceiling on each one.
 *
 * Pure: the session reads the athlete's history once at kick-off and hands the
 * result to `OpponentPacer`, which stays a pure function of elapsed time.
 */

import type { ExerciseId } from '@/vision/exercises';

/** Recent sessions of the same movement that set the athlete's pace. */
export const PACE_SAMPLE = 5;

/** A set shorter than this says more about the clock than the athlete. */
const MIN_SAMPLE_SEC = 10;

/** Pace for an athlete with no history in this movement: gentle, not trivial. */
export const NEWCOMER_RPM = 18;

/** Below this it stops feeling like a race at all. */
export const FLOOR_RPM = 12;

/**
 * The listed-pace range across the AI roster, used to place each partner
 * between "your pace" and "a fifth faster". Values outside are clamped.
 */
const EASIEST_RPM = 44;
const HARDEST_RPM = 92;
const MAX_PUSH = 0.2;

export interface PaceSample {
  exercise: ExerciseId;
  reps: number;
  durationSec: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * The athlete's recent reps per minute in this movement, or null with no
 * usable history. Newest first, as the profile stores them. Median rather than
 * mean, so one great or one abandoned set does not swing the next race.
 */
export function athletePace(sessions: readonly PaceSample[], exercise: ExerciseId): number | null {
  const rates: number[] = [];
  for (const s of sessions) {
    if (s.exercise !== exercise || s.reps <= 0 || s.durationSec < MIN_SAMPLE_SEC) continue;
    rates.push((s.reps / s.durationSec) * 60);
    if (rates.length >= PACE_SAMPLE) break;
  }
  return rates.length ? median(rates) : null;
}

/** How much harder than the athlete this partner pushes, 0 to `MAX_PUSH`. */
function pushFor(listedRpm: number): number {
  const t = (listedRpm - EASIEST_RPM) / (HARDEST_RPM - EASIEST_RPM);
  return Math.min(1, Math.max(0, t)) * MAX_PUSH;
}

/** The pace this partner races this athlete at, in reps per minute. */
export function matchedPace(
  listedRpm: number,
  sessions: readonly PaceSample[],
  exercise: ExerciseId,
): number {
  const mine = athletePace(sessions, exercise) ?? NEWCOMER_RPM;
  const paced = mine * (1 + pushFor(listedRpm));
  return Math.max(FLOOR_RPM, Math.min(listedRpm, paced));
}
