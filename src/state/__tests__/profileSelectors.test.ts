import {
  selectBestStreak,
  selectDaysTrainedThisWeek,
  selectDuelsWon,
  selectPairingBonusActive,
  selectTotalReps,
  selectWeekSessions,
  selectWeeklyXp,
  selectWinRate,
} from '../profileStore';
import type { SessionSummary } from '../profileStore';

function session(partial: Partial<SessionSummary> & Pick<SessionSummary, 'day' | 'xp'>): SessionSummary {
  return {
    id: partial.id ?? `s-${partial.day}-${partial.xp}`,
    exercise: partial.exercise ?? 'push',
    mode: partial.mode ?? 'practice',
    reps: partial.reps ?? 10,
    opponentReps: partial.opponentReps ?? null,
    opponentId: partial.opponentId ?? null,
    target: partial.target ?? null,
    won: partial.won ?? false,
    drew: partial.drew,
    xp: partial.xp,
    formScore: partial.formScore ?? 80,
    durationSec: partial.durationSec ?? 60,
    completedAt: partial.completedAt ?? `${partial.day}T12:00:00.000Z`,
    day: partial.day,
  };
}

describe('selectWeekSessions / selectWeeklyXp', () => {
  it('includes only sessions in the current ISO week', () => {
    // Week of 2026-07-13 (Mon) … 2026-07-19 (Sun) is W29.
    const now = new Date(2026, 6, 15);
    const state = {
      sessions: [
        session({ day: '2026-07-14', xp: 100 }),
        session({ day: '2026-07-12', xp: 50 }), // prior Sunday — previous ISO week
        session({ day: '2026-07-20', xp: 25 }), // next Monday
      ],
    };
    expect(selectWeekSessions(state, now).map((s) => s.day)).toEqual(['2026-07-14']);
    expect(selectWeeklyXp(state, now)).toBe(100);
  });
});

describe('selectWinRate', () => {
  it('excludes draws from the denominator', () => {
    const state = {
      sessions: [
        session({ day: '2026-07-14', xp: 10, mode: 'versus', won: true }),
        session({ day: '2026-07-15', xp: 10, mode: 'versus', won: false, drew: true }),
        session({ day: '2026-07-16', xp: 10, mode: 'versus', won: false }),
      ],
    };
    // 1 win / 2 decided = 50%
    expect(selectWinRate(state)).toBe(50);
  });
});

describe('selectTotalReps / selectDuelsWon', () => {
  it('sums reps across every mode', () => {
    const state = {
      sessions: [
        session({ day: '2026-07-14', xp: 10, reps: 12 }),
        session({ day: '2026-07-15', xp: 10, reps: 8, mode: 'versus' }),
      ],
    };
    expect(selectTotalReps(state)).toBe(20);
  });

  it('counts won duels only — `won` on a practice row means nothing', () => {
    const state = {
      sessions: [
        session({ day: '2026-07-14', xp: 10, mode: 'versus', won: true }),
        session({ day: '2026-07-15', xp: 10, mode: 'versus', won: false }),
        session({ day: '2026-07-16', xp: 10, mode: 'practice', won: true }),
      ],
    };
    expect(selectDuelsWon(state)).toBe(1);
  });

  it('returns 0 rather than NaN on an empty history', () => {
    expect(selectTotalReps({ sessions: [] })).toBe(0);
    expect(selectDuelsWon({ sessions: [] })).toBe(0);
    expect(selectWinRate({ sessions: [] })).toBe(0);
  });
});

/*
 * The rest-day rule is the part worth pinning. `selectBestStreak` keeps a run
 * alive across a single missed day, matching `calculateStreak` — if the two
 * ever disagree, the profile shows a "best" lower than the streak the athlete
 * is currently on, which reads as a bug in their own history.
 */
describe('selectBestStreak', () => {
  const days = (...list: string[]) => ({
    sessions: list.map((day) => session({ day, xp: 10 })),
  });

  it('counts consecutive days', () => {
    expect(selectBestStreak(days('2026-07-28', '2026-07-29', '2026-07-30'))).toBe(3);
  });

  it('survives one rest day but breaks on two', () => {
    expect(selectBestStreak(days('2026-07-28', '2026-07-30'))).toBe(2);
    expect(selectBestStreak(days('2026-07-28', '2026-07-31'))).toBe(1);
  });

  it('reports the longest run, not the most recent', () => {
    expect(
      selectBestStreak(
        days('2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-20', '2026-07-21'),
      ),
    ).toBe(4);
  });

  it('counts two sets on one day once, whatever order they arrive in', () => {
    expect(selectBestStreak(days('2026-07-29', '2026-07-28', '2026-07-28'))).toBe(2);
  });

  it('is 0 with no history', () => {
    expect(selectBestStreak({ sessions: [] })).toBe(0);
  });
});

describe('selectDaysTrainedThisWeek', () => {
  it('counts distinct days rather than sessions', () => {
    const now = new Date(2026, 6, 15);
    const state = {
      sessions: [
        session({ day: '2026-07-14', xp: 10 }),
        session({ day: '2026-07-14', xp: 10 }),
        session({ day: '2026-07-15', xp: 10 }),
      ],
    };
    expect(selectDaysTrainedThisWeek(state, now)).toBe(2);
  });
});

describe('selectPairingBonusActive', () => {
  it('expires exactly at the deadline, not after it', () => {
    const now = 1_000_000;
    expect(selectPairingBonusActive({ pairingBonusUntil: now + 1 }, now)).toBe(true);
    expect(selectPairingBonusActive({ pairingBonusUntil: now }, now)).toBe(false);
    expect(selectPairingBonusActive({ pairingBonusUntil: 0 }, now)).toBe(false);
  });
});
