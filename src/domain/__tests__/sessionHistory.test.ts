import {
  groupSessionsByDay,
  labelForDay,
  summariseHistory,
} from '../sessionHistory';
import type { SessionSummary } from '@/state/profileStore';

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: Math.random().toString(36).slice(2),
    exercise: 'push',
    mode: 'practice',
    reps: 10,
    opponentReps: null,
    opponentId: null,
    target: null,
    won: false,
    xp: 20,
    formScore: 80,
    durationSec: 20,
    completedAt: '2026-08-08T10:00:00.000Z',
    day: '2026-08-08',
    ...overrides,
  };
}

describe('groupSessionsByDay', () => {
  it('groups by day, newest day first', () => {
    const days = groupSessionsByDay([
      session({ day: '2026-08-06', completedAt: '2026-08-06T09:00:00.000Z' }),
      session({ day: '2026-08-08', completedAt: '2026-08-08T09:00:00.000Z' }),
      session({ day: '2026-08-07', completedAt: '2026-08-07T09:00:00.000Z' }),
    ]);
    expect(days.map((d) => d.day)).toEqual(['2026-08-08', '2026-08-07', '2026-08-06']);
  });

  /* Two sets in one day arrive in whatever order the store appended them, so
     the group has to sort on the timestamp rather than trust insertion. */
  it('orders sessions within a day by time, newest first', () => {
    const [day] = groupSessionsByDay([
      session({ reps: 5, completedAt: '2026-08-08T08:00:00.000Z' }),
      session({ reps: 9, completedAt: '2026-08-08T19:00:00.000Z' }),
      session({ reps: 7, completedAt: '2026-08-08T13:00:00.000Z' }),
    ]);
    expect(day!.sessions.map((s) => s.reps)).toEqual([9, 7, 5]);
  });

  it('totals reps and xp across a day', () => {
    const [day] = groupSessionsByDay([
      session({ reps: 12, xp: 30 }),
      session({ reps: 8, xp: 15, completedAt: '2026-08-08T11:00:00.000Z' }),
    ]);
    expect(day!.totalReps).toBe(20);
    expect(day!.totalXp).toBe(45);
  });

  it('returns nothing for an athlete who has never trained', () => {
    expect(groupSessionsByDay([])).toEqual([]);
  });
});

describe('summariseHistory', () => {
  it('counts days trained, not sessions', () => {
    const summary = summariseHistory([
      session({ day: '2026-08-08', completedAt: '2026-08-08T08:00:00.000Z' }),
      session({ day: '2026-08-08', completedAt: '2026-08-08T18:00:00.000Z' }),
      session({ day: '2026-08-07', completedAt: '2026-08-07T08:00:00.000Z' }),
    ]);
    expect(summary.totalSessions).toBe(3);
    expect(summary.daysTrained).toBe(2);
  });

  it('takes the best day by combined reps, not by a single set', () => {
    const summary = summariseHistory([
      session({ day: '2026-08-08', reps: 12, completedAt: '2026-08-08T08:00:00.000Z' }),
      session({ day: '2026-08-08', reps: 11, completedAt: '2026-08-08T18:00:00.000Z' }),
      session({ day: '2026-08-07', reps: 20, completedAt: '2026-08-07T08:00:00.000Z' }),
    ]);
    expect(summary.bestDayReps).toBe(23);
  });

  /* A zero form score is a real result — a set where nothing scored — so it
     must pull the average down rather than be treated as absent. */
  it('counts a zero form score rather than skipping it', () => {
    const summary = summariseHistory([
      session({ formScore: 100 }),
      session({ formScore: 0, completedAt: '2026-08-08T11:00:00.000Z' }),
    ]);
    expect(summary.averageForm).toBe(50);
  });

  it('reports no average when nothing has been scored', () => {
    expect(summariseHistory([]).averageForm).toBeNull();
  });
});

describe('labelForDay', () => {
  const today = '2026-08-08';

  it('names today and yesterday', () => {
    expect(labelForDay('2026-08-08', today)).toBe('Today');
    expect(labelForDay('2026-08-07', today)).toBe('Yesterday');
  });

  it('writes older days out', () => {
    const label = labelForDay('2026-08-01', today);
    expect(label).not.toBe('Today');
    expect(label).not.toBe('Yesterday');
    expect(label).toMatch(/Aug/);
  });

  /* Crossing a month boundary backwards is where naive date maths breaks. */
  it('handles yesterday across a month boundary', () => {
    expect(labelForDay('2026-07-31', '2026-08-01')).toBe('Yesterday');
  });

  it('returns the raw key rather than "Invalid Date" for a malformed day', () => {
    expect(labelForDay('not-a-date', today)).toBe('not-a-date');
  });
});
