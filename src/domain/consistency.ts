/**
 * What an athlete's consistency means *today*, for the Profile card.
 *
 * Built on the same rules the rest of the app already uses — `calculateStreak`
 * (a single rest day keeps a streak alive, two break it) and the ISO week — so
 * this card can never disagree with Home about the streak. It adds no new rule;
 * it reads the existing ones and says what to do about them.
 *
 * Everything here is derived from real sessions. A line is only produced when
 * the data backs it, so there is no invented urgency: "at risk" is shown only
 * when missing today would actually break the streak.
 */

import { calculateStreak, dayKey } from '@/domain/progression';
import { currentWeekDayKeys } from '@/domain/weeklyChallenge';

/** Streak lengths worth marking, in order. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365] as const;

export type StreakState =
  /** Never trained, or the streak has ended. */
  | 'start'
  /** Trained today. */
  | 'safe'
  /** Trained yesterday, today still open — a rest day is allowed. */
  | 'open'
  /** Yesterday and today both empty: training today is what keeps it. */
  | 'at-risk';

export interface Consistency {
  streak: number;
  state: StreakState;
  trainedToday: boolean;
  headline: string;
  line: string;
  /** Next streak milestone and how far along the streak is toward it. */
  milestone: { target: number; daysToGo: number; fraction: number } | null;
  daysThisWeek: number;
  goal: number;
  /** Distinct training days in the last 28, and as a share of 28. */
  last28: { days: number; pct: number };
  /** The weekday trained most often over the last 12 weeks, once there is enough to say. */
  favouriteDay: string | null;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
/** Fewer training days than this and a "favourite" weekday is just noise. */
const MIN_DAYS_FOR_FAVOURITE = 6;

function shift(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return dayKey(d);
}

export function nextMilestone(streak: number): number | null {
  return STREAK_MILESTONES.find((m) => m > streak) ?? null;
}

export function consistencyFor(
  trainedDays: readonly string[],
  goal: number,
  now: Date = new Date(),
): Consistency {
  const days = new Set(trainedDays);
  const today = dayKey(now);
  const yesterday = shift(today, -1);
  const streak = calculateStreak([...days], today);
  const trainedToday = days.has(today);

  const state: StreakState =
    streak === 0 ? 'start' : trainedToday ? 'safe' : days.has(yesterday) ? 'open' : 'at-risk';

  const target = nextMilestone(streak);
  const previous = [...STREAK_MILESTONES].reverse().find((m) => m <= streak) ?? 0;
  const milestone =
    target === null
      ? null
      : {
          target,
          daysToGo: target - streak,
          fraction: Math.max(0.04, Math.min(1, (streak - previous) / (target - previous))),
        };

  const copy = {
    start: {
      headline: 'Start a streak',
      line: 'Train today and day one is on the board.',
    },
    safe: {
      headline: `${streak}-day streak`,
      line: 'Done for today — your streak is safe.',
    },
    open: {
      headline: `${streak}-day streak`,
      line: 'Rest days are allowed. One set today keeps it climbing.',
    },
    'at-risk': {
      headline: `${streak}-day streak`,
      line: 'A set today keeps your streak alive.',
    },
  }[state];

  const weekDays = currentWeekDayKeys(now);
  const daysThisWeek = [...weekDays].filter((d) => days.has(d)).length;

  let last28Days = 0;
  for (let i = 0; i < 28; i += 1) if (days.has(shift(today, -i))) last28Days += 1;

  const counts = new Array<number>(7).fill(0);
  let inWindow = 0;
  for (let i = 0; i < 84; i += 1) {
    const d = shift(today, -i);
    if (days.has(d)) {
      const dow = new Date(`${d}T12:00:00`).getDay();
      counts[dow] = (counts[dow] ?? 0) + 1;
      inWindow += 1;
    }
  }
  let favouriteDay: string | null = null;
  if (inWindow >= MIN_DAYS_FOR_FAVOURITE) {
    const top = Math.max(...counts);
    const at = counts.indexOf(top);
    /* A tie is not a favourite. Say nothing rather than pick arbitrarily. */
    if (counts.filter((c) => c === top).length === 1) favouriteDay = WEEKDAYS[at] ?? null;
  }

  return {
    streak,
    state,
    trainedToday,
    headline: copy.headline,
    line: copy.line,
    milestone,
    daysThisWeek,
    goal,
    last28: { days: last28Days, pct: Math.round((last28Days / 28) * 100) },
    favouriteDay,
  };
}
