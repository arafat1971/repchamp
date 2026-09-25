/**
 * The duo streak: days in a row both bears were filled.
 *
 * Kept from what this phone actually saw — a day counts once the partner's
 * synced total and mine both reached our goals — so the flame is a record of
 * something that happened, never an estimate. A day not yet over does not
 * break it: today counts once earned, and until then the streak runs to
 * yesterday.
 */

import { dayKey } from '@/domain/progression';

/** The day before `day`, as a key. */
export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y as number, (m as number) - 1, (d as number) - 1, 12));
}

/** Consecutive both-full days ending today, or yesterday if today is not yet earned. */
export function duoStreak(days: readonly string[], today: string): number {
  const set = new Set(days);
  let cursor = set.has(today) ? today : previousDay(today);
  let n = 0;
  while (set.has(cursor)) {
    n += 1;
    cursor = previousDay(cursor);
  }
  return n;
}

/** Add a day, keeping the list short and sorted. */
export function withDay(days: readonly string[], day: string, keep = 120): string[] {
  if (days.includes(day)) return [...days];
  return [...days, day].sort().slice(-keep);
}
