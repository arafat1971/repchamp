import {
  commitmentLine,
  granularPrice,
  monthlyEquivalent,
  priceAnchor,
  savingsPercent,
  type PlanPrice,
} from '../paywallFraming';

const annual = (price = 24.99): PlanPrice => ({ price, weeks: 52, symbol: '£' });
const monthly = (price = 4.99): PlanPrice => ({ price, weeks: 4.345, symbol: '£' });
const weekly = (price = 1.99): PlanPrice => ({ price, weeks: 1, symbol: '£' });

describe('granularPrice', () => {
  it('goes down to a daily figure when the weekly price supports it', () => {
    // £4.99/month is ~£1.15/week, ~£0.16/day — too small, so it stays weekly.
    expect(granularPrice(monthly())).toBe('£1.15 a week');
  });

  it('uses a daily figure on a dearer plan', () => {
    // £1.99/week is £0.28/day, comfortably above the 20p floor.
    expect(granularPrice(weekly())).toBe('£0.28 a day');
  });

  /* Below about 20p a day the number reads as a gimmick rather than a real
     comparison, so the weekly figure is the floor. */
  it('does not descend into sub-20p-a-day territory', () => {
    expect(granularPrice(annual())).toBe('£0.48 a week');
  });

  it('returns nothing for a plan with no price', () => {
    expect(granularPrice({ price: 0, weeks: 52, symbol: '£' })).toBeNull();
  });
});

describe('savingsPercent', () => {
  it('anchors on the dearest real alternative', () => {
    // annual £0.48/wk vs weekly £1.99/wk = 76% saved.
    expect(savingsPercent(annual(), [monthly(), weekly()])).toBe(76);
  });

  /* Never fabricate a discount. A "SAVE 0%" badge is worse than no badge, and
     claiming a saving against a plan nobody offers is a dark pattern. */
  it('claims nothing when the annual plan is not actually cheaper', () => {
    expect(savingsPercent(annual(200), [monthly()])).toBeNull();
  });

  it('claims nothing when there is no alternative to compare against', () => {
    expect(savingsPercent(annual(), [])).toBeNull();
  });

  it('ignores alternatives with no price rather than treating them as free', () => {
    const broken: PlanPrice = { price: 0, weeks: 4.345, symbol: '£' };
    expect(savingsPercent(annual(), [broken, weekly()])).toBe(76);
  });
});

describe('priceAnchor', () => {
  it('compares a cheap annual plan to a coffee', () => {
    expect(priceAnchor(annual())).toBe('Less than a coffee a month');
  });

  it('scales the comparison with the price', () => {
    expect(priceAnchor(monthly())).toBe('About one coffee a month');
    expect(priceAnchor(weekly())).toBe('Less than a gym day-pass a month');
  });

  /* An inflated comparison invites the athlete to argue with the claim instead
     of considering the offer, so an expensive plan gets no anchor at all. */
  it('says nothing rather than overreaching on an expensive plan', () => {
    expect(priceAnchor({ price: 40, weeks: 1, symbol: '£' })).toBeNull();
  });
});

describe('commitmentLine', () => {
  it('leads with the trial when there is one', () => {
    const line = commitmentLine(true, '7 days');
    expect(line).toContain('7 days free');
    expect(line).toContain('No charge until it ends');
  });

  /* Never imply a trial that does not exist — the store treats that as a
     misrepresentation, and the athlete finds out at the worst moment. */
  it('promises no trial when the plan has none', () => {
    const line = commitmentLine(false);
    expect(line).not.toMatch(/free.*trial|trial/i);
    expect(line).toContain('Cancel anytime');
  });

  it('does not claim a trial when the label is missing', () => {
    expect(commitmentLine(true, null)).toBe(
      'Cancel anytime · Keep the free staples either way',
    );
  });
});

/*
 * The monthly-equivalent headline.
 *
 * "$60" and "$10" are not the same unit, so an annual plan reads as the
 * expensive one unless the athlete divides it themselves. Most will not. Both
 * plans in the same unit is the whole point — and the real charge stays
 * attached, because finding out about $60 at the store sheet instead of here is
 * what produces refunds and one-star reviews.
 */
describe('monthlyEquivalent', () => {
  const yearly = { price: 60, weeks: 52, symbol: '$' };

  it('leads with the monthly rate and keeps the real charge', () => {
    const m = monthlyEquivalent(yearly, '$60.00', 'ANNUAL');
    expect(m?.perMonth).toBe('$5');
    expect(m?.billedAs).toBe('paid $60.00 annually');
  });

  /* A clean rate should not be shown rounder than it is, nor padded: "$5" beats
     "$5.00", but £2.08 must keep its pennies. */
  it('formats a clean rate cleanly and a messy one precisely', () => {
    expect(monthlyEquivalent(yearly, '$60', 'ANNUAL')?.perMonth).toBe('$5');
    expect(
      monthlyEquivalent({ price: 24.99, weeks: 52, symbol: '£' }, '£24.99', 'ANNUAL')?.perMonth,
    ).toBe('£2.08');
  });

  /* A monthly plan already is its own rate; restating it would print the same
     number twice. */
  it('says nothing for a plan already billed monthly', () => {
    expect(monthlyEquivalent({ price: 10, weeks: 4.345, symbol: '$' }, '$10', 'MONTHLY')).toBeNull();
  });

  it('says nothing for a weekly plan', () => {
    expect(monthlyEquivalent({ price: 3, weeks: 1, symbol: '$' }, '$3', 'WEEKLY')).toBeNull();
  });

  it('says nothing when there is no usable price', () => {
    expect(monthlyEquivalent({ price: 0, weeks: 52, symbol: '$' }, '$0', 'ANNUAL')).toBeNull();
    expect(monthlyEquivalent({ price: 60, weeks: 0, symbol: '$' }, '$60', 'ANNUAL')).toBeNull();
  });

  /* The currency symbol comes off the real localised price, so a euro or yen
     store is not silently shown dollars. */
  it('carries the store’s own currency', () => {
    expect(monthlyEquivalent({ price: 60, weeks: 52, symbol: '€' }, '€60', 'ANNUAL')?.perMonth)
      .toBe('€5');
  });

  /* A six-month plan is a real RevenueCat package type; it must not be
     described as annual. */
  it('names a non-annual cadence honestly', () => {
    const m = monthlyEquivalent({ price: 36, weeks: 26, symbol: '$' }, '$36', 'SIX_MONTH');
    expect(m?.perMonth).toBe('$6');
    expect(m?.billedAs).toBe('paid $36 every 6 months');
  });
});
