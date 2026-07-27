import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

import { PRO_ENTITLEMENT } from '@/domain/pro';

/**
 * RevenueCat wire — the I/O layer over the purchases SDK.
 *
 * Following the pattern of every other service here: no-ops when unconfigured
 * (placeholder API keys), so the paywall and gates can be wired unconditionally
 * and the app runs fine on a build with no billing set up. `isPurchasesConfigured`
 * is the seam the UI branches on when it needs to show "billing not connected".
 *
 * Entitlement truth is RevenueCat's `customerInfo.entitlements.active[PRO]` — we
 * never persist a "user is pro" flag locally, because that's exactly what gets
 * out of sync with a lapsed or refunded subscription. The store subscribes to
 * the live customer info instead.
 */

function apiKey(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { revenueCatApple?: string; revenueCatGoogle?: string }
    | undefined;
  const key = Platform.OS === 'ios' ? extra?.revenueCatApple : extra?.revenueCatGoogle;
  // Treat blanks and the template placeholders as "not set up"; otherwise trust
  // the key and let the RevenueCat SDK be the judge of validity. (A public SDK
  // key is `appl_`/`goog_`; a secret `sk_` key belongs on a backend, not the
  // client — if one is configured, offerings simply won't fetch, which the
  // paywall already handles by showing no plans.)
  if (!key || key.trim().length === 0 || key.includes('placeholder')) return undefined;
  return key;
}

let configured = false;

export function isPurchasesConfigured(): boolean {
  return apiKey() != null;
}

/**
 * Configure the SDK once, tied to the athlete's uid so entitlements follow them
 * across devices and reinstalls. Safe to call repeatedly; only the first
 * configures, later calls just re-identify. No-ops without a key.
 */
export async function configurePurchases(uid: string | null): Promise<void> {
  const key = apiKey();
  if (!key) return;

  try {
    if (!configured) {
      Purchases.configure({ apiKey: key, appUserID: uid ?? undefined });
      configured = true;
    } else if (uid) {
      await Purchases.logIn(uid);
    }
  } catch {
    // A misconfigured key shouldn't crash the app; gates simply stay on "free".
  }
}

/** Read Pro-ness from a customer-info snapshot. The one definition of "is pro". */
export function isProFromInfo(info: CustomerInfo | null): boolean {
  return info?.entitlements.active[PRO_ENTITLEMENT] != null;
}

/** Current entitlement, fetched fresh. False when unconfigured or on error. */
export async function fetchIsPro(): Promise<boolean> {
  if (!isPurchasesConfigured()) return false;
  try {
    return isProFromInfo(await Purchases.getCustomerInfo());
  } catch {
    return false;
  }
}

/** Subscribe to live entitlement changes; returns an unsubscribe. */
export function watchCustomerInfo(onChange: (isPro: boolean) => void): () => void {
  if (!isPurchasesConfigured()) {
    onChange(false);
    return () => {};
  }
  const listener = (info: CustomerInfo) => onChange(isProFromInfo(info));
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
}

/** The current default offering's packages (annual/monthly/…), or [] if none. */
export async function fetchOffering(): Promise<PurchasesOffering | null> {
  if (!isPurchasesConfigured()) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
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

/** Restore prior purchases (Apple requires this control on the paywall). */
export async function restore(): Promise<PurchaseResult> {
  if (!isPurchasesConfigured()) {
    return { ok: false, isPro: false, cancelled: false, message: 'Billing is not set up yet.' };
  }
  try {
    const info = await Purchases.restorePurchases();
    return { ok: true, isPro: isProFromInfo(info), cancelled: false };
  } catch (error) {
    return {
      ok: false,
      isPro: false,
      cancelled: false,
      message: error instanceof Error ? error.message : 'Nothing to restore.',
    };
  }
}
