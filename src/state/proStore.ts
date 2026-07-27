import { create } from 'zustand';

import {
  configurePurchases,
  fetchIsPro,
  watchCustomerInfo,
} from '@/services/purchases';
import { selectPairingBonusActive, useProfileStore } from '@/state/profileStore';

/**
 * The athlete's Pro entitlement, kept live.
 *
 * Deliberately NOT persisted: entitlement truth is RevenueCat's, and caching a
 * `isPro: true` locally is how apps end up serving Pro to lapsed subscribers.
 * The store configures the SDK on sign-in, reads the current entitlement, and
 * then follows RevenueCat's live customer-info updates (purchase, restore,
 * expiry) for the rest of the session.
 *
 * `isPro` is `false` until proven otherwise — including on any unconfigured build
 * — so gates fail safe toward "free" rather than accidentally unlocking Pro.
 */
interface ProState {
  isPro: boolean;
  /** True once the first entitlement read has resolved (avoids paywall flicker). */
  ready: boolean;
  /** Configure RevenueCat for this uid and start watching. Returns a cleanup. */
  initialize: (uid: string | null) => () => void;
  /** Force-refresh after a purchase/restore outside the listener path. */
  refresh: () => Promise<void>;
  setPro: (isPro: boolean) => void;
}

export const useProStore = create<ProState>()((set) => ({
  isPro: false,
  ready: false,

  initialize: (uid) => {
    let cancelled = false;

    void (async () => {
      await configurePurchases(uid);
      const pro = await fetchIsPro();
      if (!cancelled) set({ isPro: pro, ready: true });
    })();

    const unwatch = watchCustomerInfo((pro) => {
      if (!cancelled) set({ isPro: pro });
    });

    return () => {
      cancelled = true;
      unwatch();
    };
  },

  refresh: async () => {
    set({ isPro: await fetchIsPro() });
  },

  setPro: (isPro) => set({ isPro }),
}));

/**
 * The effective Pro state: a real RevenueCat entitlement OR an active local
 * pairing bonus. Gates should read this so the free-Pro-week reward for pairing
 * actually unlocks the paid depth. The real entitlement is authoritative — the
 * bonus only ever *adds* access, never removes it.
 */
export function useEffectivePro(): boolean {
  const isPro = useProStore((s) => s.isPro);
  const bonusActive = useProfileStore(selectPairingBonusActive);
  return isPro || bonusActive;
}

/** Convenience selector for the common "am I pro?" read (includes the bonus). */
export function useIsPro(): boolean {
  return useEffectivePro();
}
