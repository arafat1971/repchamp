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

/**
 * Free reps a non-Pro athlete may do, lifetime, before the wall.
 *
 * Raised from 5 to 50 on 2026-09-13. At 5 the wall landed on the *second*
 * session: onboarding's last tap drops the athlete straight into a practice set
 * (`app/onboarding.tsx`), and five reps is about twenty seconds of push-ups, so
 * they met the pitch having never finished a routine, seen a form report or
 * started a streak. That is a paywall placed before the core value, which is
 * the same reasoning that removed the wall entirely on 2026-08-06.
 *
 * 50 buys several complete sessions first. The wall still exists — this tunes
 * where it falls, it does not retreat from it. Everything downstream (the
 * countdown, the warning, the tests) reads this constant, so moving the number
 * is the whole change.
 */
export const FREE_REP_LIMIT = 50;

/**
 * Master switch — **on** as of 2026-09-20.
 *
 * History, because this decision has now turned over six times and no note
 * about it should be trusted over the constant itself: shipped (`4ef36a4`),
 * removed 2026-08-06 (gating the core hurts retention), held back 2026-08-31
 * (`ab0cd21`) while a Play rejection appeal was open, turned on 2026-08-31
 * (`81a4d5c`) once review cleared, allowance raised 5 → 50 on 2026-09-13
 * (`db6201c`), stood down the same day (`def3995`), and on again here.
 *
 * The standing argument *against* is real and unchanged: an athlete who cannot
 * build a routine never subscribes and never invites a partner, so a wall that
 * lands before the habit forms costs more than the conversions it buys. What
 * makes this turn different from 2026-08-06 is where the wall now falls and
 * what the athlete meets when it does:
 *
 *  - **50 reps, not 5.** At 5 the wall landed on the second session, because
 *    onboarding's last tap drops straight into a practice set. 50 buys several
 *    complete sessions, a first streak and a form report first.
 *  - **The form report is no longer a blind redirect.** A free athlete now sees
 *    their real score with the detail locked, so the paywall arrives after
 *    proof the measurement is real rather than before it.
 *  - **The refusal is measured.** `paywall_dismissed`, `purchase_cancelled` and
 *    `purchase_failed` all fire with a source, so if the wall does suppress
 *    training the funnel will show it instead of it being argued about.
 *
 * That last point is the substantive change. The previous two reversals were
 * decided on reasoning alone, because the decline half of the funnel did not
 * exist. It does now, and `rep-limit` is its own source — so this can be judged
 * on what athletes actually do rather than turned over a seventh time.
 *
 * Setting this back to `false` remains the whole of the retreat: nothing else
 * needs editing, and no app code calls the rules directly around it.
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
  return evaluateHardWallRule(input);
}

/**
 * The wall's rules, with the master switch left out.
 *
 * Split out so the behaviour stays under test while `HARD_WALL_ENABLED` is
 * false. Without this the suite would only be able to assert "nothing is ever
 * walled", and the rules would sit unverified until someone flipped the flag
 * back on — which is exactly when a regression would be most expensive.
 *
 * Call `evaluateHardWall` in app code; this is for tests and for callers that
 * genuinely need the rule regardless of the switch.
 */
export function evaluateHardWallRule(input: HardWallInput): WallDecision {
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
  return repsRemainingRule(input);
}

/** `repsRemaining` without the master switch. See `evaluateHardWallRule`. */
export function repsRemainingRule(input: HardWallInput): number {
  if (input.isPro || input.isCoupleMode || !input.billingReady) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, FREE_REP_LIMIT - input.repsSoFar);
}

/**
 * How many reps out the "nearly gone" warning starts.
 *
 * Widened from 2 to 8 on 2026-09-13, alongside the move to a 50-rep allowance.
 * Two reps was a fifth of the old budget and read as a real heads-up; against
 * 50 it is the last 4%, firing only after the athlete has already done 48 and
 * far too late to act on. Eight keeps the warning something you can still
 * finish a set around.
 */
export const NEARING_WALL_REPS = 8;

/**
 * Whether to warn that the allowance is nearly gone.
 *
 * A wall that arrives with no warning reads as a crash. This lets the session
 * say "8 reps left" while there is still room to decide, rather than after.
 */
export function isNearingWall(input: HardWallInput): boolean {
  const left = repsRemaining(input);
  return Number.isFinite(left) && left > 0 && left <= NEARING_WALL_REPS;
}
