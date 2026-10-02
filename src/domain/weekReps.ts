/**
 * This calendar week's reps, one bar per day, Monday to Sunday.
 *
 * Built on `weekStrip`'s notion of the week, so the bars, the "days trained"
 * count and the league all agree on which days belong to "this week".
 */

import { weekStrip, type WeekCell } from '@/domain/weekStrip';

export interface WeekRepsDay extends WeekCell {
  reps: number;
}

export interface WeekReps {
  days: WeekRepsDay[];
  total: number;
  /** The tallest bar — what the chart scales against. Never 0. */
  peak: number;
  /** Reps in the week before this one, for the "vs last week" line. */
  lastWeekTotal: number;
}

interface RepSession {
  day: string;
  reps: number;
}

export function weekReps(sessions: readonly RepSession[], now: Date = new Date()): WeekReps {
  const perDay = new Map<string, number>();
  for (const s of sessions) perDay.set(s.day, (perDay.get(s.day) ?? 0) + s.reps);

  const days = weekStrip([...perDay.keys()], now).map((cell) => ({
    ...cell,
    reps: perDay.get(cell.day) ?? 0,
  }));
  const total = days.reduce((acc, d) => acc + d.reps, 0);

  const lastWeekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const lastWeekTotal = weekStrip([], lastWeekEnd).reduce((acc, c) => acc + (perDay.get(c.day) ?? 0), 0);

  return { days, total, peak: Math.max(1, ...days.map((d) => d.reps)), lastWeekTotal };
}
