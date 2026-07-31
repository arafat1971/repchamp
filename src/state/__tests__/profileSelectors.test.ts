import { selectWeekSessions, selectWeeklyXp, selectWinRate } from '../profileStore';
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
