/**
 * The Weekly Recap's framing: which dates it covers, and how this week stands
 * against the last one.
 *
 * The recap counts the ISO week (Monday to Sunday, the same week the
 * leaderboard uses), so the date chip has to name that week too. It used to
 * print the trailing seven days, which on a Tuesday labelled two days of data
 * as a week that began last Wednesday.
 */

/** Monday 00:00 and Sunday of the week containing `now`, local time. */
export function isoWeekRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

/** A date seven days before `now`, for reading last week's sessions. */
export function aWeekBefore(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - 7);
  return d;
}

/**
 * One line on this week against last week, or null when there is nothing
 * worth saying (no reps in either).
 *
 * Progress is stated as a gain only when there is a real one; behind, it says
 * how many reps close the gap, which is a target rather than a scolding.
 */
export function compareWeeks(thisReps: number, lastReps: number): string | null {
  const now = Math.max(0, Math.round(thisReps));
  const last = Math.max(0, Math.round(lastReps));
  if (now === 0 && last === 0) return null;
  if (now === 0) return `Last week: ${last.toLocaleString()} reps. Beat it.`;
  if (last === 0) return 'Your first week on the board.';
  if (now === last) return 'Level with last week.';
  if (now > last) {
    const pct = Math.round(((now - last) / last) * 100);
    return pct >= 1 ? `Up ${pct}% on last week.` : 'Just ahead of last week.';
  }
  return `${(last - now).toLocaleString()} reps to match last week.`;
}
