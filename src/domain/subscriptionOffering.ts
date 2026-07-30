import type { PurchasesOffering, PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';

/**
 * Prefer the dashboard “current” offering; if it is empty or unset, use any
 * offering that still has packages. Mis-marked current offerings are a common
 * reason paywalls show “no plans”.
 */
export function pickCurrentOffering(offerings: PurchasesOfferings): PurchasesOffering | null {
  if ((offerings.current?.availablePackages?.length ?? 0) > 0) {
    return offerings.current;
  }
  const withPackages = Object.values(offerings.all ?? {}).find(
    (o) => (o.availablePackages?.length ?? 0) > 0,
  );
  return withPackages ?? offerings.current ?? null;
}

/** Preferred display order: yearly first (best value), then monthly, etc. */
export function sortPackagesForPaywall(packages: PurchasesPackage[]): PurchasesPackage[] {
  const rank: Record<string, number> = {
    ANNUAL: 0,
    SIX_MONTH: 1,
    THREE_MONTH: 2,
    TWO_MONTH: 3,
    MONTHLY: 4,
    WEEKLY: 5,
    LIFETIME: 6,
    CUSTOM: 7,
    UNKNOWN: 8,
  };
  return [...packages].sort(
    (a, b) => (rank[a.packageType] ?? 9) - (rank[b.packageType] ?? 9),
  );
}
