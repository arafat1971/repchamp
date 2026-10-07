import {
  AFTER_PAYWALL_STEP,
  BUILD_STEP,
  FLOW,
  LAST_BAR_STEP,
  LAST_STEP,
  PRICE_WHY_STEP,
  REMINDERS_STEP,
  afterSignInStep,
  barPercent,
  isShown,
  nextStep,
  previousStep,
  resumeStep,
  stepIndex,
  type FlowAnswers,
} from '../onboardingNav';

const NONE: FlowAnswers = { circle: null, styles: [] };
const PARTNER: FlowAnswers = { circle: 'partner', styles: [] };
const YOGA: FlowAnswers = { circle: null, styles: ['yoga'] };

describe('the flow list', () => {
  it('has no duplicate screens, so an id always means one place', () => {
    expect(new Set(FLOW).size).toBe(FLOW.length);
  });

  it('asks for the price explanation before the price, and the account before both', () => {
    expect(stepIndex('sign-in')).toBeLessThan(stepIndex('price-why'));
    expect(stepIndex('price-why')).toBeLessThan(stepIndex('paywall'));
  });

  it('keeps the personal asks (name, photo) after the easy questions', () => {
    expect(stepIndex('goal')).toBeLessThan(stepIndex('username'));
    expect(stepIndex('train-with')).toBeLessThan(stepIndex('username'));
    expect(stepIndex('when')).toBeLessThan(stepIndex('username'));
  });
});

describe('which screens an athlete sees', () => {
  it('shows a pitch only to someone whose answer makes it relevant', () => {
    expect(isShown('couple-pitch', PARTNER)).toBe(true);
    expect(isShown('couple-pitch', NONE)).toBe(false);
    expect(isShown('friends-pitch', PARTNER)).toBe(false);
    expect(isShown('coach-pitch', { circle: 'coach', styles: [] })).toBe(true);
    expect(isShown('yoga-pitch', YOGA)).toBe(true);
    expect(isShown('yoga-pitch', NONE)).toBe(false);
  });

  it('shows every other screen to everyone', () => {
    expect(isShown('welcome')).toBe(true);
    expect(isShown('paywall', NONE)).toBe(true);
  });
});

describe('nextStep / previousStep', () => {
  it('steps over the pitches that do not apply', () => {
    expect(nextStep(stepIndex('train-with'), NONE)).toBe(stepIndex('styles'));
    expect(previousStep(stepIndex('styles'), NONE)).toBe(stepIndex('train-with'));
  });

  it('lands on the pitch that does apply, and comes back through it', () => {
    expect(nextStep(stepIndex('train-with'), PARTNER)).toBe(stepIndex('couple-pitch'));
    expect(nextStep(stepIndex('couple-pitch'), PARTNER)).toBe(stepIndex('styles'));
    expect(previousStep(stepIndex('styles'), PARTNER)).toBe(stepIndex('couple-pitch'));
  });

  it('shows the yoga screen only after yoga was picked', () => {
    expect(nextStep(stepIndex('styles'), YOGA)).toBe(stepIndex('yoga-pitch'));
    expect(nextStep(stepIndex('styles'), NONE)).toBe(stepIndex('experience'));
  });

  it('never goes below the welcome screen or past the last one', () => {
    expect(previousStep(0)).toBe(0);
    expect(previousStep(1)).toBe(0);
    expect(nextStep(LAST_STEP)).toBe(LAST_STEP);
  });
});

describe('barPercent', () => {
  it('starts at 0 and fills exactly on the last bar step', () => {
    expect(barPercent(0)).toBe(0);
    expect(barPercent(LAST_BAR_STEP)).toBe(100);
    expect(barPercent(LAST_BAR_STEP, PARTNER)).toBe(100);
  });

  it('only ever increases, and never counts a hidden screen', () => {
    for (const answers of [NONE, PARTNER, YOGA]) {
      let prev = -1;
      for (let s = 0; s <= LAST_BAR_STEP; s += 1) {
        const p = barPercent(s, answers);
        expect(p).toBeGreaterThanOrEqual(prev);
        prev = p;
      }
    }
    // The couple pitch is hidden without a partner answer, so reaching it moves nothing.
    expect(barPercent(stepIndex('couple-pitch'), NONE)).toBe(
      barPercent(stepIndex('train-with'), NONE),
    );
  });

  it('clamps beyond the bar rather than extrapolating', () => {
    expect(barPercent(99)).toBe(100);
    expect(barPercent(-3)).toBe(0);
  });
});

describe('resumeStep', () => {
  it('resumes mid-questionnaire where the athlete was', () => {
    expect(resumeStep(stepIndex('goal'))).toBe(stepIndex('goal'));
    expect(resumeStep(stepIndex('blocker'))).toBe(stepIndex('blocker'));
  });

  it('never resumes on a screen that is not shown', () => {
    expect(resumeStep(stepIndex('couple-pitch'), NONE)).toBe(stepIndex('styles'));
    expect(resumeStep(stepIndex('couple-pitch'), PARTNER)).toBe(stepIndex('couple-pitch'));
  });

  it('re-enters at reminders from the build screen onward, one tap from sign-in', () => {
    expect(resumeStep(BUILD_STEP)).toBe(REMINDERS_STEP);
    expect(resumeStep(stepIndex('paywall'))).toBe(REMINDERS_STEP);
    expect(resumeStep(LAST_STEP)).toBe(REMINDERS_STEP);
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
  });

  it('shows everyone else why the price is what it is before showing the price', () => {
    expect(afterSignInStep(false)).toBe(PRICE_WHY_STEP);
  });
});
