import { isWalled } from '@/domain/hardPaywall';

/**
 * Whether a "come and train" notification tap should land on Home (the wall)
 * rather than opening a session.
 *
 * Two inputs the first version of this check got wrong:
 *
 *  - **Pro is not known yet on a cold start.** A tap that launches the app
 *    fires before RevenueCat has answered, when `isPro` is still its
 *    fail-safe `false`. A paying subscriber past the free allowance was read
 *    as walled and sent to Home instead of their set. While entitlement is
 *    unresolved the answer is "not walled": the session screen waits for
 *    `proReady` itself and applies the wall once it knows, so deferring costs
 *    nothing and cannot mis-route a subscriber.
 *  - **The pairing bonus is Pro.** Every other wall check reads the effective
 *    state (entitlement OR active bonus); this one read the raw entitlement.
 */
export function reminderTapIsWalled(input: {
  proReady: boolean;
  isPro: boolean;
  bonusActive: boolean;
  repsSoFar: number;
  billingReady: boolean;
}): boolean {
  if (!input.proReady) return false;
  return isWalled({
    isPro: input.isPro || input.bonusActive,
    repsSoFar: input.repsSoFar,
    billingReady: input.billingReady,
  });
}
