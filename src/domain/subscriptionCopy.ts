import type { PurchasesPackage } from 'react-native-purchases';

/**
 * Store-driven subscription copy — trial length and prices come from the
 * RevenueCat / Play product, never hardcoded euros or “3 days free”.
 */

/** True when the package has a $0 intro (App Store) or a Google free phase. */
export function hasFreeTrial(pkg: PurchasesPackage): boolean {
  const intro = pkg.product.introPrice;
  if (intro != null && intro.price === 0) return true;
  return pkg.product.defaultOption?.freePhase != null;
}

/** Human period from intro / free-phase, e.g. "7 days" or "1 week". */
export function trialPeriodLabel(pkg: PurchasesPackage): string | null {
  const intro = pkg.product.introPrice;
  if (intro != null && intro.price === 0) {
    return formatUnitCount(intro.periodNumberOfUnits, intro.periodUnit);
  }
  const free = pkg.product.defaultOption?.freePhase;
  if (free?.billingPeriod) {
    return formatUnitCount(free.billingPeriod.value, free.billingPeriod.unit);
  }
  return null;
}

/** Approximate trial length in days for timeline copy (e.g. reminder day). */
export function trialLengthDays(pkg: PurchasesPackage): number | null {
  const intro = pkg.product.introPrice;
  if (intro != null && intro.price === 0) {
    return unitsToDays(intro.periodNumberOfUnits, intro.periodUnit);
  }
  const free = pkg.product.defaultOption?.freePhase;
  if (free?.billingPeriod) {
    return unitsToDays(free.billingPeriod.value, String(free.billingPeriod.unit));
  }
  return null;
}

/** Ribbon like "7 DAYS FREE" when a trial exists. */
export function trialRibbon(pkg: PurchasesPackage): string | null {
  const label = trialPeriodLabel(pkg);
  if (!label) return null;
  return `${label.toUpperCase()} FREE`;
}

/** Primary CTA — trial when offered, otherwise Subscribe / Unlock. */
export function subscribeCtaLabel(pkg: PurchasesPackage): string {
  if (hasFreeTrial(pkg)) return 'Start free trial';
  if (pkg.packageType === 'LIFETIME') return 'Unlock forever';
  return 'Subscribe';
}

/** Friendly plan title from package type. */
export function planTitle(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case 'ANNUAL':
      return 'Yearly';
    case 'MONTHLY':
      return 'Monthly';
    case 'LIFETIME':
      return 'Lifetime';
    case 'WEEKLY':
      return 'Weekly';
    default:
      return pkg.product.title || 'RepChamp Pro';
  }
}

/** Billing cadence suffix, e.g. "/year". */
export function billingPeriodSuffix(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case 'ANNUAL':
      return '/year';
    case 'MONTHLY':
      return '/month';
    case 'WEEKLY':
      return '/week';
    default:
      return '';
  }
}

/**
 * Clear renew / trial disclosure for the selected plan (Play / App Store policy).
 */
export function renewDisclosure(pkg: PurchasesPackage): string {
  const price = `${pkg.product.priceString}${billingPeriodSuffix(pkg)}`;
  const trial = trialPeriodLabel(pkg);
  if (trial && hasFreeTrial(pkg)) {
    return `${trial} free, then ${price}. Cancel anytime in Google Play or App Store settings.`;
  }
  return `${price}. Auto-renews until cancelled. Manage in Google Play or App Store settings.`;
}

function formatUnitCount(count: number, unitRaw: string): string {
  const unit = normalizeUnit(unitRaw);
  const n = Math.max(1, count || 1);
  if (unit === 'day') return n === 1 ? '1 day' : `${n} days`;
  if (unit === 'week') return n === 1 ? '1 week' : `${n} weeks`;
  if (unit === 'month') return n === 1 ? '1 month' : `${n} months`;
  if (unit === 'year') return n === 1 ? '1 year' : `${n} years`;
  return `${n} ${unit}`;
}

function unitsToDays(count: number, unitRaw: string): number {
  const n = Math.max(1, count || 1);
  const unit = normalizeUnit(unitRaw);
  if (unit === 'day') return n;
  if (unit === 'week') return n * 7;
  if (unit === 'month') return n * 30;
  if (unit === 'year') return n * 365;
  return n;
}

function normalizeUnit(unitRaw: string): string {
  const u = String(unitRaw).toLowerCase();
  if (u.startsWith('day')) return 'day';
  if (u.startsWith('week')) return 'week';
  if (u.startsWith('month')) return 'month';
  if (u.startsWith('year')) return 'year';
  return u;
}
