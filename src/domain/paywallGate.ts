/**
 * Paywall gate — the single decision for "can this athlete keep training free?"
 *
 * RepChamp uses a **hard rep wall**: a non-Pro athlete gets a tiny free taste —
 * `FREE_REP_LIMIT` push-ups, lifetime — and is then hard-walled until they
 * subscribe. The wall applies both *before* a session (can't start once the
 * allowance is spent) and *during* one (the session is cut off the instant the
 * running total crosses the limit).
 *
 * Two rules stay sacred so growth survives:
 *  - **Couple mode is never walled.** Pairing/inviting a partner and together
 *    sets are the viral loop; someone was invited to reach them.
 *  - **The wall only engages when billing is actually configured** (enforced at
 *    the call site) — a user who literally cannot subscribe is never locked out.
 *
 * Kept pure and unit-tested so the gate reads the same everywhere.
 */

/** Free push-ups a non-Pro athlete may do, lifetime, before the hard wall. */
export const FREE_REP_LIMIT = 5;

export interface PaywallGateInput {
  /** RevenueCat entitlement truth. Pro is never walled. */
  isPro: boolean;
  /**
   * Lifetime free-exercise reps already banked (from history) plus any reps in
   * the current live session. This is what the free allowance counts against.
   */
  repsSoFar: number;
  /**
   * Whether this is couple mode (a together set). Always allowed — the viral loop.
   */
  isCoupleMode?: boolean;
}

export type PaywallDecision =
  | { allowed: true }
  | { allowed: false; reason: 'rep-limit' };

/**
 * Decide whether an athlete may keep training right now.
 *
 * Allowed when: Pro, OR couple mode, OR still under the free rep allowance.
 * Otherwise the hard wall applies.
 */
export function evaluatePaywallGate(input: PaywallGateInput): PaywallDecision {
  if (input.isPro) return { allowed: true };
  if (input.isCoupleMode) return { allowed: true };
  if (input.repsSoFar < FREE_REP_LIMIT) return { allowed: true };
  return { allowed: false, reason: 'rep-limit' };
}

/** `true` when the wall is up — the athlete must subscribe to continue. */
export function isWalled(input: PaywallGateInput): boolean {
  return !evaluatePaywallGate(input).allowed;
}

/** Reps still remaining before the wall (0 once spent). Pro/couple are unbounded. */
export function repsRemaining(input: PaywallGateInput): number {
  if (input.isPro || input.isCoupleMode) return Number.POSITIVE_INFINITY;
  return Math.max(0, FREE_REP_LIMIT - input.repsSoFar);
}
