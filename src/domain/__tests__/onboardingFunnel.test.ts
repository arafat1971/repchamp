import {
  ONBOARDING_STEP_COUNT,
  onboardingProgressPercent,
  onboardingStepName,
} from '../onboardingFunnel';

describe('onboardingStepName', () => {
  it('names the steps that decide whether someone stays or pays', () => {
    expect(onboardingStepName(0)).toBe('welcome');
    expect(onboardingStepName(5)).toBe('username');
    expect(onboardingStepName(20)).toBe('sign-in');
    expect(onboardingStepName(21)).toBe('paywall');
  });

  /* An unnamed step must still be measurable. Throwing here would take the app
     down inside an analytics call, which is far worse than a dull label. */
  it('falls back to a usable label rather than throwing', () => {
    expect(onboardingStepName(99)).toBe('step-99');
    expect(onboardingStepName(-1)).toBe('step--1');
  });

  it('covers every step the flow actually has', () => {
    expect(ONBOARDING_STEP_COUNT).toBe(25);
    for (let i = 0; i < ONBOARDING_STEP_COUNT; i += 1) {
      expect(onboardingStepName(i)).not.toMatch(/^step-/);
    }
  });

  it('gives every step a distinct name, so no two collapse in the funnel', () => {
    const names = Array.from({ length: ONBOARDING_STEP_COUNT }, (_, i) =>
      onboardingStepName(i),
    );
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('onboardingProgressPercent', () => {
  it('runs 0 to 100 across the flow', () => {
    expect(onboardingProgressPercent(0)).toBe(0);
    expect(onboardingProgressPercent(24)).toBe(100);
  });

  it('puts the paywall late, where it belongs', () => {
    expect(onboardingProgressPercent(21)).toBeGreaterThan(80);
  });

  /* Clamped rather than extrapolated: a stray index should not report 140%
     and quietly corrupt a funnel chart. */
  it('clamps out-of-range steps', () => {
    expect(onboardingProgressPercent(999)).toBe(100);
    expect(onboardingProgressPercent(-5)).toBe(0);
  });
});
