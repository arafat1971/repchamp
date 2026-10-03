import {
  MIN_DAYS_SUBSCRIBED,
  annualUpgradeOffer,
  packageTypeForProduct,
  type AnnualUpgradeInput,
} from '../annualUpgrade';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-03T12:00:00Z');

const input = (over: Partial<AnnualUpgradeInput> = {}): AnnualUpgradeInput => ({
  active: {
    packageType: 'MONTHLY',
    periodType: 'NORMAL',
    willRenew: true,
    latestPurchaseAt: NOW - 3 * DAY,
    originalPurchaseAt: NOW - 40 * DAY,
  },
  monthly: { price: 4.99, weeks: 4.345, symbol: '£' },
  annual: { price: 24.99, weeks: 52, symbol: '£' },
  sessionsLast30Days: 12,
  history: [],
  now: NOW,
  ...over,
});

describe('annualUpgradeOffer', () => {
  it('shows the real saving to an active monthly subscriber', () => {
    const o = annualUpgradeOffer(input());
    expect(o?.headline).toBe('Save £34.89 a year');
    expect(o?.body).toContain('12 times');
    expect(o?.body).toContain('£59.88');
    expect(o?.body).toContain('£24.99');
  });

  it('stays silent when annual is not actually cheaper', () => {
    expect(annualUpgradeOffer(input({ annual: { price: 80, weeks: 52, symbol: '£' } }))).toBeNull();
  });

  it('does not pitch trials, cancelled plans or non-monthly plans', () => {
    const base = input().active!;
    expect(annualUpgradeOffer(input({ active: { ...base, periodType: 'TRIAL' } }))).toBeNull();
    expect(annualUpgradeOffer(input({ active: { ...base, willRenew: false } }))).toBeNull();
    expect(annualUpgradeOffer(input({ active: { ...base, packageType: 'ANNUAL' } }))).toBeNull();
    expect(annualUpgradeOffer(input({ active: null }))).toBeNull();
  });

  it('waits until they have been subscribed a few weeks', () => {
    const base = input().active!;
    const fresh = { ...base, originalPurchaseAt: NOW - (MIN_DAYS_SUBSCRIBED - 1) * DAY };
    expect(annualUpgradeOffer(input({ active: fresh }))).toBeNull();
  });

  it('does not pitch a saving to someone who is not training', () => {
    expect(annualUpgradeOffer(input({ sessionsLast30Days: 2 }))).toBeNull();
  });

  it('rations offers, and waits longer after a dismissal', () => {
    expect(annualUpgradeOffer(input({ history: [{ at: NOW - 10 * DAY, outcome: 'shown' }] }))).toBeNull();
    expect(annualUpgradeOffer(input({ history: [{ at: NOW - 31 * DAY, outcome: 'shown' }] }))).not.toBeNull();
    expect(annualUpgradeOffer(input({ history: [{ at: NOW - 45 * DAY, outcome: 'dismissed' }] }))).toBeNull();
    expect(annualUpgradeOffer(input({ history: [{ at: NOW - 61 * DAY, outcome: 'dismissed' }] }))).not.toBeNull();
    const three = [90, 180, 270].map((d) => ({ at: NOW - d * DAY, outcome: 'dismissed' as const }));
    expect(annualUpgradeOffer(input({ history: three }))).toBeNull();
  });
});

describe('packageTypeForProduct', () => {
  const pkgs = [
    { productId: 'pro_monthly:base', packageType: 'MONTHLY' },
    { productId: 'pro_annual:base', packageType: 'ANNUAL' },
  ];
  it('matches exact and base-plan-stripped ids', () => {
    expect(packageTypeForProduct('pro_monthly:base', pkgs)).toBe('MONTHLY');
    expect(packageTypeForProduct('pro_annual', pkgs)).toBe('ANNUAL');
    expect(packageTypeForProduct('mystery', pkgs)).toBeNull();
  });
});
