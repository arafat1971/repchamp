import type { SessionSummary } from '@/state/profileStore';

/**
 * Grouping for the history screen.
 *
 * Every session has been recorded since the app shipped — date, exercise, reps,
 * form score, outcome — and none of it was ever shown back. This turns that
 * store into something an athlete can look at.
 *
 * Pure and unit-tested, like the rest of `domain/`: the screen renders what this
 * returns and makes no decisions of its own.
 */

export interface HistoryDay {
  /** `YYYY-MM-DD`, the key sessions are already stamped with. */
  day: string;
  /** Newest first within the day. */
  sessions: SessionSummary[];
  totalReps: number;
  totalXp: number;
  /** Null when no session in the day carried a form score. */
  averageForm: number | null;
}

export interface HistorySummary {
  totalSessions: number;
  totalReps: number;
  /** Distinct days trained, not sessions — two sets in a day count once. */
  daysTrained: number;
  bestDayReps: number;
  averageForm: number | null;
}

/**
 * Group sessions into days, newest first.
 *
 * Sorting is by `completedAt` rather than `day` so two sets in one day keep
 * their real order; `day` alone would leave them in insertion order, which is
 * whatever the store happened to append.
 */
export function groupSessionsByDay(sessions: readonly SessionSummary[]): HistoryDay[] {
  const byDay = new Map<string, SessionSummary[]>();

  for (const session of sessions) {
    const existing = byDay.get(session.day);
    if (existing) existing.push(session);
    else byDay.set(session.day, [session]);
  }

  const days: HistoryDay[] = [];
  for (const [day, group] of byDay) {
    const ordered = [...group].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    days.push({
      day,
      sessions: ordered,
      totalReps: ordered.reduce((sum, s) => sum + s.reps, 0),
      totalXp: ordered.reduce((sum, s) => sum + s.xp, 0),
      averageForm: meanForm(ordered),
    });
  }

  return days.sort((a, b) => b.day.localeCompare(a.day));
}

/** Headline numbers for the top of the screen. */
export function summariseHistory(sessions: readonly SessionSummary[]): HistorySummary {
  const days = groupSessionsByDay(sessions);
  return {
    totalSessions: sessions.length,
    totalReps: sessions.reduce((sum, s) => sum + s.reps, 0),
    daysTrained: days.length,
    bestDayReps: days.reduce((best, d) => Math.max(best, d.totalReps), 0),
    averageForm: meanForm(sessions),
  };
}

/**
 * Mean form score across sessions that have one.
 *
 * A session can carry `formScore: 0` — a set where nothing scored, which is a
 * real result and not a missing value. Only sessions with no score at all are
 * excluded, so a genuinely bad set still drags the average down as it should.
 */
function meanForm(sessions: readonly SessionSummary[]): number | null {
  const scored = sessions.filter((s) => typeof s.formScore === 'number');
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((sum, s) => sum + s.formScore, 0) / scored.length);
}

/**
 * "Today", "Yesterday", or a written date.
 *
 * Takes `today` rather than reading the clock so the caller stays testable and
 * the label cannot change mid-render.
 */
export function labelForDay(day: string, today: string): string {
  if (day === today) return 'Today';

  /* Formatted from local parts, not `toISOString`. A `YYYY-MM-DD` string parses
     as local midnight, and `toISOString` then converts to UTC — so anywhere east
     of Greenwich that lands on the previous day and "Yesterday" never matches.
     The failing case was 2026-07-31 against 2026-08-01, which is also where
     naive month arithmetic goes wrong. */
  const yesterday = new Date(`${today}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const y = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(
    yesterday.getDate(),
  ).padStart(2, '0')}`;
  if (day === y) return 'Yesterday';

  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day;

  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
