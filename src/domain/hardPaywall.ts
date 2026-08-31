/**
 * The hard rep wall — a lifetime free allowance, then training stops.
 *
 * This is deliberately a *separate* module from `paywallGate`, which holds the
 * freemium rules (core free forever, Pro sells depth). Both now exist:
 * `paywallGate` answers "is this exercise Pro-only?", and this answers "has the
 * free allowance run out?". Keeping them apart means the freemium model is
 * still intact underneath and can be restored by flipping `HARD_WALL_ENABLED`,
 * rather than being deleted and reconstructed from git history a second time.
 *
 * Two rules from the original implementation are kept, because both protect
 * things that are worth more than the conversion this wall buys:
 *
 *  - **Couple mode is never walled.** Pairing and together-sets are the viral
 *    loop, and the person reaching them was invited by someone else. Walling a
 *    guest is walling the referrer's pitch.
 *  - **The wall only engages when billing is actually configured.** An athlete
 *    who physically cannot subscribe must never be locked out — enforced at the
 *    call site, which passes `billingReady`.
 *
 * Pure and unit-tested, so the wall reads the same in the session, the duel
 * screen and anywhere else it is consulted.
 */

/** Free reps a non-Pro athlete may do, lifetime, before the wall. */
export const FREE_REP_LIMIT = 5;

/**
 * Master switch.
 *
 * The wall was shipped once, removed on 2026-08-06, and is being restored. It
 * is behind a constant so the reversal — if it happens again — is a one-line
 * change rather than another archaeology exercise.
 */
export const HARD_WALL_ENABLED = true;

export interface HardWallInput {
  /** RevenueCat entitlement truth. Pro is never walled. */
  isPro: boolean;
  /** Lifetime reps banked, plus reps in the live session. */
  repsSoFar: number;
  /** Together-sets are never walled — the viral loop. */
  isCoupleMode?: boolean;
  /**
   * Whether a purchase could actually be made right now. False on a build with
   * no billing configured, where a wall would be a dead end with no way out.
   */
  billingReady: boolean;
}

export type WallDecision =
  | { walled: false }
  | { walled: true; reason: 'rep-limit' };

/**
 * Whether the wall is up right now.
 *
 * Order matters: every exemption is checked before the allowance, so a Pro
 * athlete, a couple session, or a build that cannot sell anything is never
 * blocked regardless of rep count.
 */
export function evaluateHardWall(input: HardWallInput): WallDecision {
  if (!HARD_WALL_ENABLED) return { walled: false };
  if (input.isPro) return { walled: false };
  if (input.isCoupleMode) return { walled: false };
  if (!input.billingReady) return { walled: false };
  if (input.repsSoFar < FREE_REP_LIMIT) return { walled: false };
  return { walled: true, reason: 'rep-limit' };
}

/** Convenience predicate for call sites that only need a boolean. */
export function isWalled(input: HardWallInput): boolean {
  return evaluateHardWall(input).walled;
}

/**
 * Reps left before the wall, for the countdown shown during a set.
 *
 * Infinite for anyone the wall does not apply to, so a caller can render "∞"
 * or simply hide the counter without special-casing each exemption.
 */
export function repsRemaining(input: HardWallInput): number {
  if (!HARD_WALL_ENABLED) return Number.POSITIVE_INFINITY;
  if (input.isPro || input.isCoupleMode || !input.billingReady) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, FREE_REP_LIMIT - input.repsSoFar);
}

/**
 * Whether to warn that the allowance is nearly gone.
 *
 * A wall that arrives with no warning reads as a crash. This lets the session
 * say "1 rep left" before it stops rather than after.
 */
export function isNearingWall(input: HardWallInput): boolean {
  const left = repsRemaining(input);
  return Number.isFinite(left) && left > 0 && left <= 2;
}
