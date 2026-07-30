import { exerciseHomeStats } from '@/domain/exerciseHomeStats';
import type { SessionSummary } from '@/state/profileStore';

function session(partial: Partial<SessionSummary> & Pick<SessionSummary, 'day' | 'reps'>): SessionSummary {
  return {
    id: 's',
    exercise: 'push',
    mode: 'practice',
    opponentReps: null,
    opponentId: null,
    target: null,
    won: false,
    xp: 40,
    formScore: 80,
    durationSec: 60,
    completedAt: '2026-07-30T12:00:00.000Z',
    ...partial,
  };
}

describe('exerciseHomeStats', () => {
  it('compares today to the previous training day', () => {
    const stats = exerciseHomeStats(
      [
        session({ day: '2026-07-28', reps: 90 }),
        session({ day: '2026-07-29', reps: 98 }),
        session({ day: '2026-07-30', reps: 110 }),
        session({ day: '2026-07-30', reps: 124 }),
      ],
      'push',
      '2026-07-30',
    );
    expect(stats.todayBest).toBe(124);
    expect(stats.lastBest).toBe(98);
    expect(stats.delta).toBe(26);
  });

  it('handles a cold start with no history', () => {
    expect(exerciseHomeStats([], 'squat', '2026-07-30')).toEqual({
      todayBest: 0,
      lastBest: 0,
      delta: 0,
    });
  });
});
