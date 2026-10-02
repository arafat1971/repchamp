import {
  AFTER_PAYWALL_STEP,
  BUILD_STEP,
  LAST_BAR_STEP,
  PAYWALL_STEP,
  REMINDERS_STEP,
  afterSignInStep,
  barPercent,
  nextStep,
  previousStep,
  resumeStep,
} from '../onboardingNav';

describe('nextStep / previousStep', () => {
  it('steps over the two screens that are never shown', () => {
    expect(nextStep(11)).toBe(14);
    expect(previousStep(14)).toBe(11);
    expect(nextStep(5)).toBe(6);
    expect(previousStep(6)).toBe(5);
  });

  it('never goes below the welcome screen or past the offer', () => {
    expect(previousStep(0)).toBe(0);
    expect(previousStep(1)).toBe(0);
    expect(nextStep(26)).toBe(26);
  });
});

describe('barPercent', () => {
  it('starts at 0 and fills exactly on the last bar step', () => {
    expect(barPercent(0)).toBe(0);
    expect(barPercent(LAST_BAR_STEP)).toBe(100);
  });

  it('only ever increases, and never counts a skipped screen', () => {
    let prev = -1;
    for (let s = 0; s <= LAST_BAR_STEP; s += 1) {
      const p = barPercent(s);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    // 12 and 13 are skipped, so reaching 14 moves the bar only by 14's own share.
    expect(barPercent(13)).toBe(barPercent(11));
  });

  it('clamps beyond the bar rather than extrapolating', () => {
    expect(barPercent(99)).toBe(100);
    expect(barPercent(-3)).toBe(0);
  });
});

describe('resumeStep', () => {
  it('resumes mid-questionnaire where the athlete was', () => {
    expect(resumeStep(5)).toBe(5);
    expect(resumeStep(10)).toBe(10);
  });

  it('never resumes on a screen that is not shown', () => {
    expect(resumeStep(12)).toBe(14);
    expect(resumeStep(13)).toBe(14);
  });

  it('re-enters at reminders from the build screen onward, one tap from sign-in', () => {
    expect(resumeStep(BUILD_STEP)).toBe(REMINDERS_STEP);
    expect(resumeStep(PAYWALL_STEP)).toBe(REMINDERS_STEP);
    expect(resumeStep(26)).toBe(REMINDERS_STEP);
  });

  it('falls back to the welcome screen for nonsense', () => {
    expect(resumeStep(0)).toBe(0);
    expect(resumeStep(-4)).toBe(0);
    expect(resumeStep(Number.NaN)).toBe(0);
  });
});

describe('afterSignInStep', () => {
  it('does not offer the paywall to someone who is already Pro', () => {
    expect(afterSignInStep(true)).toBe(AFTER_PAYWALL_STEP);
    expect(afterSignInStep(false)).toBe(PAYWALL_STEP);
  });
});
