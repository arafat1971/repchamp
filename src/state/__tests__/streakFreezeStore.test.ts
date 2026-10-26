/**
 * Streak freezes through the profile store: spent on app open, earned at
 * 7-day milestones, capped, and surfaced once as a "Streak saved" card.
 */
import { dayKey } from '@/domain/progression';
import { MAX_STREAK_FREEZES, MAX_STREAK_FREEZES_PRO, STARTER_STREAK_FREEZES, shiftDay } from '@/domain/streakFreeze';

import {
  selectBestStreak,
  selectStreak,
  selectStreakFreezes,
  setStreakFreezeCapSource,
  useProfileStore,
  type SessionSummary,
} from '../profileStore';

const input = {
  exercise: 'push' as const,
  mode: 'practice' as const,
  reps: 10,
  opponentReps: null,
  opponentId: null,
  target: null,
  won: false,
  xp: 5,
  formScore: 80,
  durationSec: 30,
};

function session(day: string): SessionSummary {
  return { ...input, id: day, completedAt: `${day}T10:00:00.000Z`, day };
}

const today = dayKey();

beforeEach(() => useProfileStore.getState().reset());

describe('streak freezes in the profile store', () => {
  it('starts every athlete with a freeze', () => {
    expect(useProfileStore.getState().streakFreezes).toBe(STARTER_STREAK_FREEZES);
  });

  it('spends a freeze to save a streak across two missed days', () => {
    // Trained 5 days ending 3 days ago → missed the last two closed days.
    const sessions = [0, 1, 2, 3, 4].map((i) => session(shiftDay(today, -3 - i)));
    useProfileStore.setState({ sessions, streakFreezes: 1, frozenDays: [] });
    expect(selectStreak(useProfileStore.getState())).toBe(0);

    expect(useProfileStore.getState().applyStreakFreezes()).toBe(1);
    const state = useProfileStore.getState();
    expect(state.streakFreezes).toBe(0);
    expect(state.frozenDays).toEqual([shiftDay(today, -1)]);
    expect(selectStreak(state)).toBe(5);
    expect(selectBestStreak(state)).toBe(5);
    expect(state.freezeSave).toEqual({ day: today, used: 1, streak: 5 });

    // Applying again spends nothing more.
    expect(useProfileStore.getState().applyStreakFreezes()).toBe(0);

    useProfileStore.getState().dismissFreezeSave();
    expect(useProfileStore.getState().freezeSave).toBeNull();
  });

  it('recording a set after a gap saves the streak first', () => {
    const sessions = [0, 1, 2].map((i) => session(shiftDay(today, -3 - i)));
    useProfileStore.setState({ sessions, streakFreezes: 1, frozenDays: [] });
    useProfileStore.getState().recordSession(input);
    expect(selectStreak(useProfileStore.getState())).toBe(4);
  });

  it('earns a freeze on reaching a 7-day streak, capped', () => {
    const sessions = [1, 2, 3, 4, 5, 6].map((i) => session(shiftDay(today, -i)));
    useProfileStore.setState({ sessions, streakFreezes: 0, frozenDays: [] });
    useProfileStore.getState().recordSession(input);
    expect(selectStreak(useProfileStore.getState())).toBe(7);
    expect(useProfileStore.getState().streakFreezes).toBe(1);

    // A second set the same day pays nothing more.
    useProfileStore.getState().recordSession(input);
    expect(useProfileStore.getState().streakFreezes).toBe(1);

    useProfileStore.setState({
      sessions: sessions.slice(0, 6),
      streakFreezes: MAX_STREAK_FREEZES,
    });
    useProfileStore.getState().recordSession(input);
    expect(useProfileStore.getState().streakFreezes).toBe(MAX_STREAK_FREEZES);
  });
});

describe('Pro cap via the registered source', () => {
  afterEach(() => setStreakFreezeCapSource(() => MAX_STREAK_FREEZES));

  it('lets Pro earn a third freeze', () => {
    setStreakFreezeCapSource(() => MAX_STREAK_FREEZES_PRO);
    const sessions = [1, 2, 3, 4, 5, 6].map((i) => session(shiftDay(today, -i)));
    useProfileStore.setState({ sessions, streakFreezes: 2, frozenDays: [] });
    useProfileStore.getState().recordSession(input);
    expect(useProfileStore.getState().streakFreezes).toBe(3);
    expect(selectStreakFreezes(useProfileStore.getState())).toBe(3);
  });
});
