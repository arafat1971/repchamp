/**
 * The water wall, asked from anywhere a glass can be logged: Home's pour
 * button and the widget's quick-drink route. One place, so neither entry
 * point can drift into letting glasses through the other refuses.
 */

import { isWaterWalled } from '@/domain/hardPaywall';
import { isPurchasesConfigured } from '@/services/purchases';
import { selectLifetimeLogs, useHydrationStore } from '@/state/hydrationStore';
import { useProStore } from '@/state/proStore';
import { selectPairingBonusActive, useProfileStore } from '@/state/profileStore';

/** Whether the next glass should open the paywall instead of logging. */
export function waterWalledNow(): boolean {
  const pro = useProStore.getState();
  return isWaterWalled({
    isPro: pro.isPro || selectPairingBonusActive(useProfileStore.getState()),
    proReady: pro.ready,
    billingReady: isPurchasesConfigured(),
    logsSoFar: selectLifetimeLogs(useHydrationStore.getState()),
  });
}

/** Paywall params for a walled glass. */
export const WATER_PAYWALL = { pathname: '/modal/paywall', params: { source: 'water' } } as const;
