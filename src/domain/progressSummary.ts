/**
 * The shape of an athlete's training over time, for the Profile progress
 * section: this week against last, and a twelve-week consistency grid.
 *
 * Weeks are ISO weeks via `isoWeekKey`, the same boundary the streak, weekly
 * XP and league use, so "this week" means one thing across the app.
 */

import { dayKey, weekdayLetter } from '@/domain/progression';
import { currentWeekDayKeys, isoWeekKey } from '@/domain/weeklyChallenge';

export interface RepSession {
  day: string;
  reps: number;
}

function repsByDay(sessions: readonly RepSession[]): Map<string, number> {
  const by = new Map<string, number>();
  for (const s of sessions) {
    if (s.reps > 0) by.set(s.day, (by.get(s.day) ?? 0) + s.reps);
  }
  return by;
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y as number, (m as number) - 1, d as number, 12);
}

export interface WeekComparison {
  thisWeek: number;
  lastWeek: number;
  /**
   * Whole-number change against last week, or null when there is no fair
   * comparison: nothing last week (any number is "infinitely" better), or a
   * week so small a percentage would be noise.
   */
  deltaPct: number | null;
  /** Reps per day, Monday to Sunday of this week. */
  days: number[];
  labels: string[];
  /** Index of today in `days`. */
  todayIndex: number;
}

/** Below this many reps last week, a percentage says more about noise than progress. */
const MIN_BASELINE = 10;

export function weekComparison(sessions: readonly RepSession[], now: Date = new Date()): WeekComparison {
  const by = repsByDay(sessions);
  const thisKey = isoWeekKey(now);
  const lastKey = isoWeekKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 12));

  let thisWeek = 0;
  let lastWeek = 0;
  for (const [day, reps] of by) {
    const key = isoWeekKey(parseDay(day));
    if (key === thisKey) thisWeek += reps;
    else if (key === lastKey) lastWeek += reps;
  }

  const week = [...currentWeekDayKeys(now)].sort();
  const today = dayKey(now);
  return {
    thisWeek,
    lastWeek,
    deltaPct: lastWeek >= MIN_BASELINE ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null,
    days: week.map((d) => by.get(d) ?? 0),
    labels: week.map(weekdayLetter),
    todayIndex: Math.max(0, week.indexOf(today)),
  };
}

export interface GridCell {
  day: string;
  reps: number;
  /** 0 = rest, 1–4 = quartiles of this athlete's own training days. */
  level: 0 | 1 | 2 | 3 | 4;
  isFuture: boolean;
}

/**
 * The last `weeks` ISO weeks as columns of seven days, oldest first.
 *
 * Shade is relative to the athlete's own days — quartiles of their non-zero
 * totals — so a beginner's best day is as dark as an athlete's, and the grid
 * shows consistency rather than rewarding volume alone.
 */
export function consistencyGrid(
  sessions: readonly RepSession[],
  now: Date = new Date(),
  weeks = 12,
): GridCell[][] {
  const by = repsByDay(sessions);
  const today = dayKey(now);
  const monday = [...currentWeekDayKeys(now)].sort()[0] as string;
  const start = parseDay(monday);
  start.setDate(start.getDate() - (weeks - 1) * 7);

  const days: string[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12);
    days.push(dayKey(d));
  }

  const totals = days.map((d) => by.get(d) ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
  const q = (p: number) => totals[Math.floor(p * (totals.length - 1))] ?? 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const levelOf = (reps: number): GridCell['level'] => {
    if (reps <= 0) return 0;
    if (reps <= (cuts[0] as number)) return 1;
    if (reps <= (cuts[1] as number)) return 2;
    if (reps <= (cuts[2] as number)) return 3;
    return 4;
  };

  const grid: GridCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    grid.push(
      days.slice(w * 7, w * 7 + 7).map((day) => {
        const reps = by.get(day) ?? 0;
        return { day, reps, level: levelOf(reps), isFuture: day > today };
      }),
    );
  }
  return grid;
}
