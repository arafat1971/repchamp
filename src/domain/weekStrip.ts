/**
 * This calendar week as seven cells, Monday to Sunday, for the Home week card.
 *
 * Built on `currentWeekDayKeys`, so a day counts as "this week" exactly when
 * the weekly XP, the league and `selectDaysTrainedThisWeek` say it does — the
 * strip can never show five flames beside a "4 days" headline.
 */

import { dayKey, weekdayLetter } from '@/domain/progression';
import { currentWeekDayKeys } from '@/domain/weeklyChallenge';

export interface WeekCell {
  day: string;
  letter: string;
  trained: boolean;
  isToday: boolean;
  /** Later this week — not missed, just not yet. */
  isFuture: boolean;
}

export function weekStrip(trainedDays: Iterable<string>, now: Date = new Date()): WeekCell[] {
  const trained = new Set(trainedDays);
  const today = dayKey(now);
  return [...currentWeekDayKeys(now)].sort().map((day) => ({
    day,
    letter: weekdayLetter(day),
    trained: trained.has(day),
    isToday: day === today,
    isFuture: day > today,
  }));
}
