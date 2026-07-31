import type { ExerciseId } from '@/vision/exercises';

/**
 * A fixed multi-week training programme.
 *
 * Deliberately a *template* rather than a history-derived plan: everyone on a
 * programme follows the same ladder, and the athlete advances one day at a time
 * as they complete sessions. Predictable, explainable ("Week 2, Day 3: 30
 * push-ups"), and easy to reason about — a solid first version that a later pass
 * can make adaptive if the data supports it.
 *
 * Pure and framework-free so the progression maths — which day are you on, what's
 * today's target, are you done — is unit-tested without a store or a device.
 */

/** One day in a programme: the exercise and the target for that day. */
export interface ProgrammeDay {
  /** 1-based day number across the whole programme (Week 1 Day 1 = 1). */
  index: number;
  week: number;
  /** 1-based day within its week. */
  dayOfWeek: number;
  exercise: ExerciseId;
  target: number;
  /** A rest day has no target; it exists to pace the ladder. */
  rest: boolean;
}

export interface Programme {
  id: string;
  title: string;
  description: string;
  exercise: ExerciseId;
  daysPerWeek: number;
  weeks: number;
  days: ProgrammeDay[];
}

/**
 * Build a programme from a per-week list of daily targets.
 *
 * `weeklyTargets[w]` is the list of targets for week `w`; a `null` entry is a
 * rest day. Flattened into a single indexed day list so "advance one day" is just
 * an increment.
 */
function build(
  id: string,
  title: string,
  description: string,
  exercise: ExerciseId,
  weeklyTargets: readonly (readonly (number | null)[])[],
): Programme {
  const days: ProgrammeDay[] = [];
  let index = 0;
  weeklyTargets.forEach((week, w) => {
    week.forEach((target, d) => {
      index += 1;
      days.push({
        index,
        week: w + 1,
        dayOfWeek: d + 1,
        exercise,
        target: target ?? 0,
        rest: target === null,
      });
    });
  });
  const daysPerWeek = weeklyTargets[0]?.length ?? 0;
  return { id, title, description, exercise, daysPerWeek, weeks: weeklyTargets.length, days };
}

/**
 * The flagship "0 to 50 push-ups" ladder — a classic 4-week progression that
 * ramps volume with a rest day mid-week. Targets chosen to be reachable from a
 * beginner base and to feel like clear weekly progress.
 */
export const PUSHUP_LADDER = build(
  'pushup-ladder',
  '4 weeks to 50 push-ups',
  'A steady ladder that builds from your first clean reps to a 50-rep set.',
  'push',
  [
    [10, 12, null, 14, 16], // week 1
    [18, 20, null, 22, 25], // week 2
    [28, 30, null, 34, 38], // week 3
    [42, 45, null, 48, 50], // week 4
  ],
);

/** A matching squat ladder, so couples can pick either staple. */
export const SQUAT_LADDER = build(
  'squat-ladder',
  '4 weeks to 60 squats',
  'Progress from a comfortable set to 60 clean squats in four weeks.',
  'squat',
  [
    [15, 18, null, 20, 24],
    [26, 30, null, 32, 36],
    [40, 44, null, 46, 50],
    [52, 55, null, 58, 60],
  ],
);

export const PROGRAMMES: Readonly<Record<string, Programme>> = {
  [PUSHUP_LADDER.id]: PUSHUP_LADDER,
  [SQUAT_LADDER.id]: SQUAT_LADDER,
};

export function getProgramme(id: string): Programme | null {
  return PROGRAMMES[id] ?? null;
}

/**
 * The athlete's live position in a programme.
 *
 * `completedDays` is how many programme days they've finished; the current day is
 * the next unfinished one. Kept separate from the template so progress persists
 * in the profile store while the ladder stays a constant.
 */
export interface ProgrammeProgress {
  programmeId: string;
  completedDays: number;
}

export interface ProgrammeState {
  programme: Programme;
  /** The day to do next, or null once the programme is finished. */
  currentDay: ProgrammeDay | null;
  completedDays: number;
  totalDays: number;
  /** 0..1 completion across the whole programme. */
  percent: number;
  finished: boolean;
}

/** Resolve a template + progress into the live state the UI renders. */
export function programmeState(progress: ProgrammeProgress): ProgrammeState | null {
  const programme = getProgramme(progress.programmeId);
  if (!programme) return null;

  const total = programme.days.length;
  const completed = Math.max(0, Math.min(progress.completedDays, total));
  const currentDay = completed < total ? (programme.days[completed] ?? null) : null;

  return {
    programme,
    currentDay,
    completedDays: completed,
    totalDays: total,
    percent: total === 0 ? 0 : completed / total,
    finished: completed >= total,
  };
}

/**
 * Advance the programme when a session clears the current day's target.
 *
 * A rest day advances on its own (there's nothing to clear). A training day only
 * advances when `reps` meets the target — so a short set doesn't skip you ahead,
 * and the ladder stays honest. Returns the new progress (or the same object when
 * nothing changed), never mutating the input.
 */
export function advanceProgramme(
  progress: ProgrammeProgress,
  completedExercise: ExerciseId,
  reps: number,
): ProgrammeProgress {
  const state = programmeState(progress);
  if (!state || state.finished || !state.currentDay) return progress;

  const day = state.currentDay;
  if (day.rest) {
    // Rest auto-clears only on a real set (reps > 0). Explicit "Mark rest
    // complete" still uses `completeRestDay`. If this set also meets the *next*
    // training day's target, credit that day too — otherwise a qualifying
    // workout on a rest day only skipped rest and forced a redo.
    if (reps <= 0) return progress;
    let next: ProgrammeProgress = {
      ...progress,
      completedDays: progress.completedDays + 1,
    };
    const afterRest = programmeState(next);
    const training = afterRest?.currentDay;
    if (
      training &&
      !training.rest &&
      completedExercise === training.exercise &&
      reps >= training.target
    ) {
      next = { ...next, completedDays: next.completedDays + 1 };
    }
    return next;
  }
  if (completedExercise === day.exercise && reps >= day.target) {
    return { ...progress, completedDays: progress.completedDays + 1 };
  }
  return progress;
}

/** Explicit rest-day completion from the programme card (no session required). */
export function completeRestDay(progress: ProgrammeProgress): ProgrammeProgress {
  const state = programmeState(progress);
  if (!state || state.finished || !state.currentDay?.rest) return progress;
  return { ...progress, completedDays: progress.completedDays + 1 };
}
