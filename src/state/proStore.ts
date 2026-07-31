import { create } from 'zustand';

import { captureError } from '@/lib/crash';
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

/**
 * The uid the store was last initialised with.
 *
 * `refresh()` needs it: calling `fetchIsPro()` with no uid falls back to
 * whatever identity RevenueCat happens to already hold, which on a cold start
 * is none — so a paying subscriber got re-checked as anonymous and read back
 * as free. Kept module-level rather than in state because it is plumbing, not
 * something a component should re-render on.
 */
let activeUid: string | null = null;

export const useProStore = create<ProState>()((set) => ({
  isPro: false,
  ready: false,

  initialize: (uid) => {
    let cancelled = false;
    let unwatch: () => void = () => {};
    activeUid = uid;

    // Drop the previous account's entitlement immediately — otherwise a uid
    // switch briefly inherits the last user's Pro flag.
    set({ isPro: false, ready: false });

    // Configure first, then attach the listener. Registering before configure
    // can no-op or throw on a cold start — and the paywall may race this path.
    void (async () => {
      try {
        await configurePurchases(uid);
        if (cancelled) return;
        const pro = await fetchIsPro(uid);
        if (cancelled) return;
        set({ isPro: pro, ready: true });
        unwatch = watchCustomerInfo((next) => {
          if (!cancelled) set({ isPro: next });
        });
      } catch (error) {
        // Never leave `ready` false on a throw: the paywall blocks on it, so a
        // transient billing error used to hang that screen on its spinner for
        // the rest of the session with no way out. Resolve as not-Pro — the
        // listener and the next `refresh()` can still upgrade it later.
        captureError(error);
        if (!cancelled) set({ ready: true });
      }
    })();

    return () => {
      cancelled = true;
      unwatch();
      set({ isPro: false, ready: false });
    };
  },

  refresh: async () => {
    const pro = await fetchIsPro(activeUid);
    set({ isPro: pro });
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
