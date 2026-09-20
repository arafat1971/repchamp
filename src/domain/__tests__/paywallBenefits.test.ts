import {
  DEFAULT_BENEFIT_ORDER,
  orderBenefits,
  type BenefitId,
} from '@/domain/paywallBenefits';

describe('orderBenefits', () => {
  /* The point of the module: the thing the athlete was just refused is the
     thing they read first. */
  it.each([
    ['exercise-library', 'library'],
    ['duel-exercise', 'library'],
    ['programme', 'programmes'],
    ['form-report', 'reports'],
    ['form-report-teaser', 'reports'],
  ])('leads with what %s was blocked on', (source, expected) => {
    expect(orderBenefits(source)[0]).toBe(expected);
  });

  /* Browsing is not refusal. Profile and onboarding have no "thing you just
     wanted", so reordering for them would be guessing. */
  it.each(['profile', 'onboarding', undefined, null, 'something-new'])(
    'keeps the authored order for %s',
    (source) => {
      expect(orderBenefits(source)).toEqual(DEFAULT_BENEFIT_ORDER);
    },
  );

  /* The hard wall stops all training rather than one feature, so no single
     promise answers it. */
  it('does not pretend the rep wall was about one feature', () => {
    expect(orderBenefits('rep-limit')).toEqual(DEFAULT_BENEFIT_ORDER);
  });

  /* Nothing is hidden, ever. Reordering is the whole mechanism; a source that
     dropped a benefit would be showing a different offer per entry point. */
  it.each([
    'exercise-library',
    'duel-exercise',
    'programme',
    'form-report',
    'form-report-teaser',
    'profile',
    'rep-limit',
  ])('shows all four benefits from %s', (source) => {
    const order = orderBenefits(source);
    expect([...order].sort()).toEqual([...DEFAULT_BENEFIT_ORDER].sort());
    expect(new Set(order).size).toBe(4);
  });

  /* A stable sort, so the page still reads as one authored list rather than a
     different screen per source. */
  it('moves only the lead, leaving the rest in their authored order', () => {
    expect(orderBenefits('programme')).toEqual([
      'programmes',
      'library',
      'reports',
      'free-staples',
    ] satisfies BenefitId[]);
  });

  /* The reassurance that nothing was taken away only lands once the athlete
     knows what they gain — so it is never promoted to the top. */
  it('never leads with the free staples', () => {
    for (const source of [
      'exercise-library',
      'duel-exercise',
      'programme',
      'form-report',
      'form-report-teaser',
      'profile',
      'onboarding',
      'rep-limit',
    ]) {
      expect(orderBenefits(source)[0]).not.toBe('free-staples');
    }
  });
});
