/**
 * What survives onboarding.
 *
 * The app asks three qualifying questions and used to keep none of the
 * answers: `completeOnboarding` persisted only username, weeklyGoal and
 * avatar, so the level and blocker shaped a couple of onboarding screens and
 * were then dropped on the floor. `onboardingPlan.ts` already said the rule
 * out loud — "asking a question and then ignoring the answer is worse than not
 * asking" — but nothing enforced it, and there was no test on this function at
 * all, which is why the gap was invisible.
 */

jest.mock('@/lib/storage', () => ({
  zustandStorage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}));

import { useProfileStore } from '../profileStore';

const FRESH = useProfileStore.getState();

beforeEach(() => {
  useProfileStore.setState({
    onboarded: false,
    username: '',
    weeklyGoal: 4,
    avatarUri: null,
    fitnessLevel: null,
    blocker: null,
  });
});

describe('completeOnboarding', () => {
  it('keeps the answers the app asked for', () => {
    FRESH.completeOnboarding({
      username: 'ada',
      weeklyGoal: 5,
      avatarUri: null,
      fitnessLevel: 'returning',
      blocker: 'consistency',
    });

    const s = useProfileStore.getState();
    expect(s.fitnessLevel).toBe('returning');
    expect(s.blocker).toBe('consistency');
    expect(s.weeklyGoal).toBe(5);
    expect(s.onboarded).toBe(true);
  });

  /*
   * Both are optional so an athlete who skipped the questions — or who
   * onboarded before they were stored — lands on null rather than a stale
   * value from a previous run.
   */
  it('stores null when a question went unanswered', () => {
    useProfileStore.setState({ fitnessLevel: 'regular', blocker: 'form' });

    FRESH.completeOnboarding({ username: 'ada', weeklyGoal: 3, avatarUri: null });

    const s = useProfileStore.getState();
    expect(s.fitnessLevel).toBeNull();
    expect(s.blocker).toBeNull();
  });

  it('normalises the username rather than trusting it', () => {
    FRESH.completeOnboarding({ username: '  Ada_99  ', weeklyGoal: 4, avatarUri: null });
    expect(useProfileStore.getState().username).toBe('ada_99');
  });

  /*
   * `normalizeUsername` only trims, strips a leading @ and lowercases — it is
   * not a validator, so the fallback fires on an empty result rather than on
   * an invalid one. The screen ahead of it is what rejects bad characters.
   */
  it('falls back to champion only when nothing usable is left', () => {
    FRESH.completeOnboarding({ username: '   ', weeklyGoal: 4, avatarUri: null });
    expect(useProfileStore.getState().username).toBe('champion');

    FRESH.completeOnboarding({ username: '@Ada', weeklyGoal: 4, avatarUri: null });
    expect(useProfileStore.getState().username).toBe('ada');
  });
});
