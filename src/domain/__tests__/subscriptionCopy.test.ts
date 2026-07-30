import {
  billingPeriodSuffix,
  hasFreeTrial,
  planTitle,
  renewDisclosure,
  subscribeCtaLabel,
  trialLengthDays,
  trialPeriodLabel,
  trialRibbon,
} from '../subscriptionCopy';
import type { PurchasesPackage } from 'react-native-purchases';

/** Minimal package stub for pure copy tests (no native Purchases runtime). */
function stubPkg(partial: {
  packageType?: string;
  priceString?: string;
  intro?: {
    price: number;
    periodNumberOfUnits: number;
    periodUnit: string;
  } | null;
  freePhase?: { value: number; unit: string } | null;
}): PurchasesPackage {
  return {
    identifier: 'test',
    packageType: (partial.packageType ?? 'ANNUAL') as PurchasesPackage['packageType'],
    product: {
      priceString: partial.priceString ?? '$34.99',
      price: 34.99,
      introPrice: partial.intro
        ? {
            price: partial.intro.price,
            priceString: '$0.00',
            cycles: 1,
            period: 'P7D',
            periodUnit: partial.intro.periodUnit,
            periodNumberOfUnits: partial.intro.periodNumberOfUnits,
          }
        : null,
      defaultOption: partial.freePhase
        ? {
            freePhase: {
              billingPeriod: {
                value: partial.freePhase.value,
                unit: partial.freePhase.unit as never,
                iso8601: 'P7D',
              },
              price: { formatted: '$0.00', amountMicros: 0, currencyCode: 'USD' },
              recurrenceMode: null,
              billingCycleCount: 1,
              offerPaymentMode: null,
            },
          }
        : null,
      title: 'Pro',
    },
  } as unknown as PurchasesPackage;
}

describe('subscriptionCopy', () => {
  it('detects App Store free intro', () => {
    const pkg = stubPkg({
      intro: { price: 0, periodNumberOfUnits: 7, periodUnit: 'DAY' },
    });
    expect(hasFreeTrial(pkg)).toBe(true);
    expect(trialPeriodLabel(pkg)).toBe('7 days');
    expect(trialLengthDays(pkg)).toBe(7);
    expect(trialRibbon(pkg)).toBe('7 DAYS FREE');
    expect(subscribeCtaLabel(pkg)).toBe('Start free trial');
  });

  it('detects Google free phase', () => {
    const pkg = stubPkg({
      intro: null,
      freePhase: { value: 3, unit: 'DAY' },
    });
    expect(hasFreeTrial(pkg)).toBe(true);
    expect(trialPeriodLabel(pkg)).toBe('3 days');
  });

  it('falls back to Subscribe without a trial', () => {
    const pkg = stubPkg({ intro: null, freePhase: null, packageType: 'MONTHLY' });
    expect(hasFreeTrial(pkg)).toBe(false);
    expect(subscribeCtaLabel(pkg)).toBe('Subscribe');
    expect(planTitle(pkg)).toBe('Monthly');
    expect(billingPeriodSuffix(pkg)).toBe('/month');
    expect(renewDisclosure(pkg)).toMatch(/\$34\.99\/month/);
  });

  it('includes trial then price in renew disclosure', () => {
    const pkg = stubPkg({
      intro: { price: 0, periodNumberOfUnits: 7, periodUnit: 'DAY' },
      priceString: '€34,99',
    });
    expect(renewDisclosure(pkg)).toMatch(/7 days free/);
    expect(renewDisclosure(pkg)).toMatch(/€34,99\/year/);
  });
});
