/**
 * The week together, as this phone saw it: each day's water for both, which
 * feeds the meadow on the widget's back hill (the week's past flowers) and
 * the Sunday wrap.
 *
 * Kept from what Home actually observed — the partner's synced total and my
 * own — so nothing here is estimated. Weeks run Monday to Sunday.
 */

import { previousDay } from '@/domain/duoStreak';

export interface DayTotals {
  them: number;
  me: number;
}

/** 0 = Monday … 6 = Sunday, for a `YYYY-MM-DD` key. */
export function weekdayIndex(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const js = new Date(y as number, (m as number) - 1, d as number, 12).getDay();
  return (js + 6) % 7;
}

/** This week's day keys, Monday first, through today. */
export function weekSoFar(today: string): string[] {
  const out = [today];
  let cursor = today;
  for (let i = weekdayIndex(today); i > 0; i--) {
    cursor = previousDay(cursor);
    out.unshift(cursor);
  }
  return out;
}

/** Most flowers one day's cluster may hold in the meadow. */
export const MEADOW_MAX = 10;

/**
 * The meadow: flowers each earlier day this week left behind, Monday first,
 * seven slots; today and days to come are 0 (today's flowers stand by the
 * bears). One flower per 250 ml either of us drank.
 */
export function meadow(history: Readonly<Record<string, DayTotals>>, today: string): number[] {
  const days = weekSoFar(today);
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const day of days) {
    if (day === today) continue;
    const t = history[day];
    if (!t) continue;
    out[weekdayIndex(day)] = Math.min(MEADOW_MAX, Math.floor((t.them + t.me) / 250));
  }
  return out;
}

export interface WeekWrap {
  mine: number;
  theirs: number;
  rainbows: number;
  days: { day: string; them: number; me: number; both: boolean }[];
}

/** Who won each day this week, and the days both bears were full. */
export function weekWrap(
  history: Readonly<Record<string, DayTotals>>,
  bothFullDays: readonly string[],
  today: string,
): WeekWrap {
  const both = new Set(bothFullDays);
  const days = weekSoFar(today).map((day) => {
    const t = history[day] ?? { them: 0, me: 0 };
    return { day, them: t.them, me: t.me, both: both.has(day) };
  });
  let mine = 0;
  let theirs = 0;
  for (const d of days) {
    if (d.me > d.them) mine += 1;
    else if (d.them > d.me) theirs += 1;
  }
  return { mine, theirs, rainbows: days.filter((d) => d.both).length, days };
}

/** The Sunday wrap line, or null on other days or an empty week. */
export function wrapLine(wrap: WeekWrap, name: string, today: string): string | null {
  if (weekdayIndex(today) !== 6) return null;
  if (wrap.mine + wrap.theirs + wrap.rainbows === 0) return null;
  return `Week wrap: you ${wrap.mine} · ${name} ${wrap.theirs} · 🌈 ${wrap.rainbows}`;
}

/** Keep the higher total seen for a day, and only the last two weeks. */
export function withTotals(
  history: Readonly<Record<string, DayTotals>>,
  day: string,
  totals: DayTotals,
  keepDays = 14,
): Record<string, DayTotals> {
  const prev = history[day];
  const next: Record<string, DayTotals> = {
    ...history,
    [day]: { them: Math.max(prev?.them ?? 0, totals.them), me: Math.max(prev?.me ?? 0, totals.me) },
  };
  const keys = Object.keys(next).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - keepDays))) delete next[k];
  return next;
}
