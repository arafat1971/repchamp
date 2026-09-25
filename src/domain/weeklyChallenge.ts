/**
 * Weekly challenge — a rotating, time-boxed goal that pulls athletes back each
 * week and gives them something fresh to share.
 *
 * Deterministic by design: the challenge is chosen from the ISO week number, so
 * **every athlete sees the same challenge in the same week** with no server —
 * and it rotates automatically when the week rolls over. Progress is the athlete's
 * best relevant set *this week*, and the countdown is the days left until the
 * week resets. Pure and unit-tested; the UI only renders what this returns.
 *
 * The challenges use free exercises (push/squat) on purpose — this is a
 * retention + re-share loop, so it must be open to everyone, Pro or not.
 */

import { dayKey } from '@/domain/progression';
import type { ExerciseId } from '@/vision/exercises';

export interface WeeklyChallengeDef {
  id: string;
  exercise: ExerciseId;
  /** Total reps to accumulate across the week to complete it. */
  target: number;
  title: string;
  blurb: string;
  emoji: string;
}

/** The rotating pool. One is active per ISO week, chosen by week number. */
export const WEEKLY_CHALLENGES: readonly WeeklyChallengeDef[] = [
  {
    id: 'push-200',
    exercise: 'push',
    target: 200,
    title: '200 Push-Ups',
    blurb: '200 push-ups by the end of the week.',
    emoji: '💪',
  },
  {
    id: 'squat-300',
    exercise: 'squat',
    target: 300,
    title: '300 Squats',
    blurb: '300 squats by the end of the week.',
    emoji: '🦵',
  },
  {
    id: 'push-150-fast',
    exercise: 'push',
    target: 150,
    title: '150 Push-Ups',
    blurb: 'A shorter target you can finish early.',
    emoji: '⚡',
  },
  {
    id: 'squat-250',
    exercise: 'squat',
    target: 250,
    title: '250 Squats',
    blurb: '250 squats by Sunday night.',
    emoji: '🔥',
  },
];

/** The ISO-8601 week number for a date (1–53), matching `currentWeekKey`. */
export function isoWeekNumber(date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** ISO week key like `2026-W30` — shared by local weekly XP and the leaderboard. */
export function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * The `YYYY-MM-DD` day keys of the ISO week containing `date`.
 *
 * `WeeklyChallengeCard` built this itself, walking back to Monday with
 * `getDay() || 7` and adding seven days — a third implementation of a week
 * boundary that `isoWeekKey` already defined, sitting alongside the
 * `selectWeekSessions` filter that uses the real thing.
 *
 * The two agreed: comparing them over 800 consecutive base dates, across year
 * ends and DST edges, produced no disagreement. That is the argument for
 * consolidating rather than against it — they matched by coincidence of two
 * correct implementations, and nothing held them together. Derived from
 * `isoWeekKey` here, a day is in this week exactly when the leaderboard, the
 * weekly XP total and the league all say it is.
 *
 * Note this is the *calendar* week, which resets on Monday. The couple tracker
 * deliberately uses a rolling last-7-days window instead (see `lastNDayKeys`
 * and the reasoning in `coupleTracker`) — that is a different concept, not a
 * fourth copy of this one, and must not be folded in here.
 */
export function currentWeekDayKeys(date = new Date()): Set<string> {
  const week = isoWeekKey(date);
  const keys = new Set<string>();

  /* Walk out from `date` rather than computing Monday: the ISO week key is the
     authority on membership, so asking it directly cannot disagree with it.
     Seven days either side is more than the span of any week, and the key
     check discards everything outside. */
  for (let offset = -7; offset <= 7; offset++) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
    if (isoWeekKey(d) === week) keys.add(dayKey(d));
  }

  return keys;
}

/** This week's challenge — the same for everyone, rotating by week number. */
export function currentWeeklyChallenge(date = new Date()): WeeklyChallengeDef {
  const idx = isoWeekNumber(date) % WEEKLY_CHALLENGES.length;
  return WEEKLY_CHALLENGES[idx]!;
}

/** Whole days left until the week resets (Monday 00:00). Always 1–7. */
export function daysLeftInWeek(date = new Date()): number {
  const dayNum = date.getDay() || 7; // Mon=1 … Sun=7
  return 8 - dayNum; // Mon→7, Sun→1
}

export interface WeeklyChallengeProgress {
  def: WeeklyChallengeDef;
  /** Reps accumulated toward the target this week. */
  reps: number;
  /** 0–1 fraction of the target reached. */
  percent: number;
  /** True once the target is met. */
  complete: boolean;
  /** Whole days remaining this week. */
  daysLeft: number;
}

/**
 * Evaluate the athlete's progress against this week's challenge.
 *
 * @param sessions  Session summaries with `day` (YYYY-MM-DD), `exercise`, `reps`.
 * @param weekDays  The set of day-keys that belong to the current week.
 */
export function weeklyChallengeProgress(
  sessions: readonly { day: string; exercise: ExerciseId; reps: number }[],
  weekDays: ReadonlySet<string>,
  date = new Date(),
): WeeklyChallengeProgress {
  const def = currentWeeklyChallenge(date);
  const reps = sessions
    .filter((s) => s.exercise === def.exercise && weekDays.has(s.day))
    .reduce((sum, s) => sum + s.reps, 0);
  const percent = def.target > 0 ? Math.min(1, reps / def.target) : 0;
  return {
    def,
    reps,
    percent,
    complete: reps >= def.target,
    daysLeft: daysLeftInWeek(date),
  };
}
