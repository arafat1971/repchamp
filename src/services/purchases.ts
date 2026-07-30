import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

import { PRO_ENTITLEMENT } from '@/domain/pro';
import { pickCurrentOffering } from '@/domain/subscriptionOffering';
import { revenueCatApiKey } from '@/lib/config';

export { pickCurrentOffering, sortPackagesForPaywall } from '@/domain/subscriptionOffering';

/**
 * RevenueCat wire — the I/O layer over the purchases SDK.
 *
 * Concurrent configure / fetch / purchase share one chain so the paywall cannot
 * call `getOfferings` before `Purchases.configure`. Offering lookup prefers the
 * dashboard “current” package set, then any offering that still has products.
 */

function apiKey(): string | undefined {
  return revenueCatApiKey();
}

let configured = false;
let configuredUid: string | null = null;
/** Serialises configure / login so paywall fetch cannot race app bootstrap. */
let configureChain: Promise<void> = Promise.resolve();

export function isPurchasesConfigured(): boolean {
  return apiKey() != null;
}

/** True after a successful `Purchases.configure` in this process. */
export function isPurchasesSdkReady(): boolean {
  return configured;
}

/**
 * Configure the SDK once, then re-identify when uid changes.
 * Safe under concurrent callers (paywall + proStore.initialize).
 */
export async function configurePurchases(uid: string | null): Promise<void> {
  const key = apiKey();
  if (!key) return;

  const next = configureChain.then(async () => {
    try {
      if (!configured) {
        Purchases.configure({ apiKey: key, appUserID: uid ?? undefined });
        configured = true;
        configuredUid = uid;
        return;
      }
      if (uid && uid !== configuredUid) {
        await Purchases.logIn(uid);
        configuredUid = uid;
      }
    } catch {
      // A misconfigured key shouldn't crash the app; gates stay on "free".
    }
  });
  configureChain = next.catch(() => {});
  await next;
}

/** Read Pro-ness from a customer-info snapshot. The one definition of "is pro". */
export function isProFromInfo(info: CustomerInfo | null): boolean {
  return info?.entitlements.active[PRO_ENTITLEMENT] != null;
}

/** Current entitlement, fetched fresh. False when unconfigured or on error. */
export async function fetchIsPro(): Promise<boolean> {
  if (!isPurchasesConfigured()) return false;
  try {
    await configurePurchases(null);
    return isProFromInfo(await Purchases.getCustomerInfo());
  } catch {
    return false;
  }
}

/** Subscribe to live entitlement changes; returns an unsubscribe. */
export function watchCustomerInfo(onChange: (isPro: boolean) => void): () => void {
  if (!isPurchasesConfigured() || !configured) {
    onChange(false);
    return () => {};
  }
  const listener = (info: CustomerInfo) => onChange(isProFromInfo(info));
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
}

/**
 * The current (or best fallback) offering, or null when none have packages.
 * Throws on SDK / network failure so the UI can show a retry state instead of
 * a false “no plans” empty screen.
 */
export async function fetchOffering(): Promise<PurchasesOffering | null> {
  if (!isPurchasesConfigured()) return null;
  await configurePurchases(null);
  const offerings = await Purchases.getOfferings();
  return pickCurrentOffering(offerings);
}

export interface PurchaseResult {
  ok: boolean;
  isPro: boolean;
  /** True when the athlete backed out — not an error to surface. */
  cancelled: boolean;
  message?: string;
}

/** Buy a package. Reports cancellation distinctly so the UI doesn't alarm on it. */
export async function purchase(pkg: PurchasesPackage): Promise<PurchaseResult> {
  if (!isPurchasesConfigured()) {
    return { ok: false, isPro: false, cancelled: false, message: 'Billing is not set up yet.' };
  }
  try {
    await configurePurchases(null);
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { ok: true, isPro: isProFromInfo(customerInfo), cancelled: false };
  } catch (error) {
    const cancelled =
      typeof error === 'object' && error != null && 'userCancelled' in error
        ? Boolean((error as { userCancelled?: boolean }).userCancelled)
        : false;
    return {
      ok: false,
      isPro: false,
      cancelled,
      message: error instanceof Error ? error.message : 'Purchase failed.',
    };
  }
}

/** Restore prior purchases (required on paywall; also offered in Settings). */
export async function restore(): Promise<PurchaseResult> {
  if (!isPurchasesConfigured()) {
    return { ok: false, isPro: false, cancelled: false, message: 'Billing is not set up yet.' };
  }
  try {
    await configurePurchases(null);
    const info = await Purchases.restorePurchases();
    const isPro = isProFromInfo(info);
    return {
      ok: true,
      isPro,
      cancelled: false,
      message: isPro ? undefined : 'No active subscription was found for this account.',
    };
  } catch (error) {
    return {
      ok: false,
      isPro: false,
      cancelled: false,
      message: error instanceof Error ? error.message : 'Could not restore purchases.',
    };
  }
}

/**
 * Clear RevenueCat identity on logout / account delete so the next athlete on
 * this device does not inherit the previous entitlement cache.
 */
export async function resetPurchases(): Promise<void> {
  if (!isPurchasesConfigured() || !configured) return;
  try {
    await Purchases.logOut();
    configuredUid = null;
  } catch {
    // Already anonymous or SDK not ready — fine.
  }
}

/** Test-only: reset module configure state between Jest cases. */
export function __resetPurchasesForTests(): void {
  configured = false;
  configuredUid = null;
  configureChain = Promise.resolve();
}
