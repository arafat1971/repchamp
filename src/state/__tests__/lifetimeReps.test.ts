/**
 * Lifetime reps must survive the 500-session history cap.
 *
 * `selectTotalReps` used to be the sum of `sessions`, which is truncated to the
 * newest 500. Past that, Profile's Reps stat stalled and then shrank as old
 * sessions rolled off — and the free-rep wall reads the same number, so a
 * shrinking total would also have handed allowance back.
 */
import { selectTotalReps, useProfileStore } from '../profileStore';

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

beforeEach(() => {
  useProfileStore.getState().reset();
});

describe('lifetime reps', () => {
  it('keeps counting after the history cap drops old sessions', () => {
    for (let i = 0; i < 520; i++) useProfileStore.getState().recordSession(input);
    const state = useProfileStore.getState();
    expect(state.sessions).toHaveLength(500);
    expect(selectTotalReps(state)).toBe(5200);
  });

  it('never goes below the visible history', () => {
    expect(selectTotalReps({ sessions: [{ reps: 7 }, { reps: 3 }] as never, lifetimeReps: 0 })).toBe(10);
  });

  it('seeds an account that predates the counter from its history', () => {
    useProfileStore.setState({ sessions: [{ reps: 40 }] as never, lifetimeReps: undefined as never });
    useProfileStore.getState().recordSession(input);
    expect(selectTotalReps(useProfileStore.getState())).toBe(50);
  });

  it('does not count an empty set', () => {
    useProfileStore.getState().recordSession({ ...input, reps: 0 });
    expect(selectTotalReps(useProfileStore.getState())).toBe(0);
  });
});
