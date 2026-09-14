/**
 * The retention signal on the settle paths.
 *
 * `domain/retention.ts` already proves the *decisions* — what a given history
 * does to a streak, what counts as league movement. What it cannot prove is
 * that the decisions are reached with the right inputs, which is exactly where
 * the settle paths went wrong: they banked a real training day and emitted
 * nothing at all.
 *
 * So these tests are about ordering and coverage, not arithmetic. The one that
 * matters most is `emits nothing when called after the write` — the failure
 * mode is silent, produces no error, and looks identical in the data to a day
 * nobody trained.
 */

import { track } from '@/lib/analytics';
import { useProfileStore } from '@/state/profileStore';
import { dayKey } from '@/domain/progression';
import {
  emitRetention,
  recordSessionWithRetention,
  retentionSnapshot,
} from '../recordSessionWithRetention';

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));

const trackMock = track as jest.MockedFunction<typeof track>;

/** A day `n` days before today, as `YYYY-MM-DD`. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayKey(d);
}

/** Seed the store with training days, as `recordSession` would have left them. */
function seedDays(days: readonly string[]): void {
  useProfileStore.setState({
    sessions: days.map((day, i) => ({
      id: `seed-${i}`,
      completedAt: `${day}T12:00:00.000Z`,
      day,
      exercise: 'push' as const,
      mode: 'practice' as const,
      reps: 10,
      opponentReps: null,
      opponentId: null,
      target: null,
      won: false,
      drew: false,
      xp: 10,
      formScore: 100,
      durationSec: 60,
    })),
  });
}

const SET = {
  exercise: 'push' as const,
  mode: 'versus' as const,
  reps: 12,
  opponentReps: 9,
  opponentId: 'rival',
  target: null,
  won: true,
  drew: false,
  xp: 40,
  formScore: 95,
  durationSec: 60,
};

beforeEach(() => {
  trackMock.mockClear();
  useProfileStore.setState({ sessions: [], totalXp: 0 });
});

describe('recordSessionWithRetention', () => {
  it('reports a continued streak for a duel banked today', () => {
    seedDays([daysAgo(2), daysAgo(1)]);

    recordSessionWithRetention(SET);

    expect(trackMock).toHaveBeenCalledWith('streak_continued', {
      length: 3,
      previous: 2,
    });
  });

  it('stays silent on a second set the same day', () => {
    // Three sets in an evening are one day of retention, not three.
    seedDays([daysAgo(1), dayKey()]);

    recordSessionWithRetention(SET);

    expect(trackMock).not.toHaveBeenCalledWith(
      'streak_continued',
      expect.anything(),
    );
    expect(trackMock).not.toHaveBeenCalledWith('streak_broken', expect.anything());
  });

  it('reports a break when the athlete returns after a gap', () => {
    seedDays([daysAgo(40), daysAgo(39)]);

    recordSessionWithRetention(SET);

    expect(trackMock).toHaveBeenCalledWith(
      'streak_broken',
      expect.objectContaining({ length: 1 }),
    );
  });

  it('emits nothing for a zero-rep set, which is not a training day', () => {
    seedDays([daysAgo(1)]);

    recordSessionWithRetention({ ...SET, reps: 0, xp: 0, won: false });

    expect(trackMock).not.toHaveBeenCalled();
  });

  it('still returns the stored summary, so it drops in for recordSession', () => {
    const summary = recordSessionWithRetention(SET);

    expect(summary.reps).toBe(12);
    expect(summary.day).toBe(dayKey());
    expect(useProfileStore.getState().sessions).toHaveLength(1);
  });
});

describe('retentionSnapshot + emitRetention — the settle-path pair', () => {
  it('reports the day when the snapshot is taken before the write', () => {
    seedDays([daysAgo(2), daysAgo(1)]);

    // Exactly what the three settle callbacks now do.
    const before = retentionSnapshot();
    useProfileStore.getState().recordSession(SET);
    emitRetention(before.days, before.league);

    expect(trackMock).toHaveBeenCalledWith('streak_continued', {
      length: 3,
      previous: 2,
    });
  });

  it('emits nothing when the snapshot is taken after the write', () => {
    /* The regression this whole change is about. Reading state after
       `recordSession` compares the new state with itself: today is already in
       the history, so the outcome is `same-day` and the day vanishes from the
       data. It throws nothing and looks exactly like a quiet day. */
    seedDays([daysAgo(2), daysAgo(1)]);

    useProfileStore.getState().recordSession(SET);
    const after = retentionSnapshot();
    emitRetention(after.days, after.league);

    expect(trackMock).not.toHaveBeenCalled();
  });
});
