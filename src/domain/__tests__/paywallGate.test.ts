import { canStartWorkout, shouldPromptUpgrade } from '@/domain/paywallGate';

describe('canStartWorkout — freemium, habit-first', () => {
  it('lets any athlete train the free staples for free (push/squat)', () => {
    expect(canStartWorkout({ isPro: false, exercise: 'push' })).toBe(true);
    expect(canStartWorkout({ isPro: false, exercise: 'squat' })).toBe(true);
  });

  it('never walls couple mode, whatever the exercise', () => {
    expect(canStartWorkout({ isPro: false, exercise: 'lunge', isCoupleMode: true })).toBe(true);
  });

  it('gates a Pro-only exercise for free users', () => {
    expect(canStartWorkout({ isPro: false, exercise: 'lunge' })).toBe(false);
  });

  it('lets Pro users do everything', () => {
    expect(canStartWorkout({ isPro: true, exercise: 'lunge' })).toBe(true);
    expect(canStartWorkout({ isPro: true, exercise: 'push' })).toBe(true);
  });
});

describe('shouldPromptUpgrade', () => {
  it('prompts only when a free user reaches for a Pro exercise', () => {
    expect(shouldPromptUpgrade({ isPro: false, exercise: 'lunge' })).toBe(true);
    expect(shouldPromptUpgrade({ isPro: false, exercise: 'push' })).toBe(false);
    expect(shouldPromptUpgrade({ isPro: true, exercise: 'lunge' })).toBe(false);
    expect(shouldPromptUpgrade({ isPro: false, exercise: 'lunge', isCoupleMode: true })).toBe(false);
  });
});
