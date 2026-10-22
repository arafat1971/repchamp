import {
  benefitsFor,
  cleanPlanKey,
  exitOffer,
  paywallHeadline,
  planKeyOf,
  resolvePlan,
  sixWeekClimb,
} from '@/domain/onboardingPaywall';

describe('plan keys', () => {
  it('maps store package types', () => {
    expect(planKeyOf('ANNUAL')).toBe('year');
    expect(planKeyOf('MONTHLY')).toBe('month');
    expect(planKeyOf('WEEKLY')).toBe('week');
    expect(planKeyOf('LIFETIME')).toBeNull();
  });

  it('cleans a saved key, defaulting to yearly', () => {
    expect(cleanPlanKey('week')).toBe('week');
    expect(cleanPlanKey('month')).toBe('month');
    expect(cleanPlanKey('nonsense')).toBe('year');
    expect(cleanPlanKey(undefined)).toBe('year');
  });
});

describe('resolvePlan', () => {
  it('keeps the wanted plan when the store has it', () => {
    expect(resolvePlan('week', ['year', 'month', 'week'])).toBe('week');
  });
  it('falls back to yearly, then whatever exists', () => {
    expect(resolvePlan('week', ['year', 'month'])).toBe('year');
    expect(resolvePlan('year', ['month'])).toBe('month');
    expect(resolvePlan('year', [])).toBeNull();
  });
});

describe('exitOffer', () => {
  it('offers the smallest real commitment below the selected one', () => {
    expect(exitOffer('year', ['year', 'month', 'week'])).toBe('week');
    expect(exitOffer('year', ['year', 'month'])).toBe('month');
    expect(exitOffer('month', ['year', 'month', 'week'])).toBe('week');
  });
  it('offers nothing when the smallest is already selected', () => {
    expect(exitOffer('week', ['year', 'month', 'week'])).toBeNull();
    expect(exitOffer('month', ['year', 'month'])).toBeNull();
    expect(exitOffer('year', ['year'])).toBeNull();
  });
});

describe('benefitsFor', () => {
  it('leads with the answer to their blocker', () => {
    expect(benefitsFor('form')[0]?.title).toBe('Form checked on every rep');
    expect(benefitsFor('time')[0]?.title).toBe('Two minutes, no gear');
  });
  it('always gives three', () => {
    expect(benefitsFor(null)).toHaveLength(3);
    expect(benefitsFor('motivation')).toHaveLength(3);
  });
});

describe('sixWeekClimb', () => {
  it('starts at their first-week target and climbs', () => {
    const c = sixWeekClimb(4, null);
    expect(c).toHaveLength(6);
    expect(c[0]).toBe(100);
    for (let i = 1; i < c.length; i += 1) expect(c[i]!).toBeGreaterThan(c[i - 1]!);
    expect(c.every((n) => n % 5 === 0)).toBe(true);
  });
});

describe('paywallHeadline', () => {
  it('uses their handle when there is one', () => {
    expect(paywallHeadline('ada')).toBe('@ada, your plan\nis ready');
    expect(paywallHeadline('  ')).toBe('Your plan\nis ready');
  });
});
