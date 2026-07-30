import type { SessionSummary } from '@/state/profileStore';
import type { ExerciseId } from '@/vision/exercises';

export type ExerciseHomeStats = {
  todayBest: number;
  lastBest: number;
  delta: number;
};

/**
 * Today’s best vs the most recent prior-day best for one movement.
 * Powers the interactive Quick Start tiles.
 */
export function exerciseHomeStats(
  sessions: readonly SessionSummary[],
  exercise: ExerciseId,
  today: string,
): ExerciseHomeStats {
  const forExercise = sessions.filter((s) => s.exercise === exercise);
  const todayBest = forExercise
    .filter((s) => s.day === today)
    .reduce((best, s) => Math.max(best, s.reps), 0);

  const priorDays = [
    ...new Set(forExercise.filter((s) => s.day < today).map((s) => s.day)),
  ].sort();
  const lastDay = priorDays[priorDays.length - 1];
  const lastBest = lastDay
    ? forExercise.filter((s) => s.day === lastDay).reduce((best, s) => Math.max(best, s.reps), 0)
    : 0;

  return {
    todayBest,
    lastBest,
    delta: todayBest - lastBest,
  };
}
