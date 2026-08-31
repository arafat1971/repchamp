/**
 * Re-checking the chosen handle at sign-in, immediately before the paywall.
 *
 * Onboarding checks availability on the username step and then does not claim
 * the name until the profile write fifteen screens later. Signing in is the
 * first moment there is a uid that could hold it, so it is also the last
 * useful moment to notice someone else took it in between. Left unchecked,
 * `upsertProfile` resolves the collision by renaming the athlete to
 * `handle_a1b2` — they finish onboarding as a name they never chose and were
 * never told about.
 *
 * The rule here is stricter than the username step's on purpose. That step
 * lets an unverifiable lookup through, because blocking an offline athlete on
 * a step with no way past it is worse than the rename it risks. This step has
 * a way past it: signing in just succeeded, so the athlete is demonstrably
 * online, and asking them to retry costs one tap instead of trapping them.
 *
 * `mayPassUncheckedHandle` closes the loop between the two. Being sent back
 * here is only useful if the username step then behaves differently, and its
 * leniency is meant for an athlete who has not yet been told anything — not
 * for one who was just told this exact handle could not be confirmed.
 *
 * Pure, so the rules are testable without Firebase or a store.
 */

/* Declared here rather than imported from the service layer, matching
   `renameUsername`: this module is pure decision logic, and pulling in
   `userService` would drag Firebase into every test that touches it. */
export type UsernameAvailability = 'free' | 'taken' | 'unknown';

export type HandleCheck =
  /** Carry on to the next step. */
  | { kind: 'proceed' }
  /** Send them back to the username step with this line. */
  | { kind: 'reclaim'; reason: string };

/**
 * Whether onboarding may continue past sign-in with `username` intact.
 *
 * `username` empty or `uid` null means there is nothing to verify — an athlete
 * who reached sign-in without picking a handle, or a sign-in that did not
 * produce a uid. Neither is a collision, and neither is improved by bouncing
 * them backwards, so both proceed.
 */
export function checkHandleAtSignIn(
  username: string,
  uid: string | null | undefined,
  availability: UsernameAvailability,
): HandleCheck {
  if (!username || !uid) return { kind: 'proceed' };
  if (availability === 'free') return { kind: 'proceed' };
  return {
    kind: 'reclaim',
    reason:
      availability === 'taken'
        ? `@${username} was taken while you were signing up.`
        : `Couldn't confirm @${username} is still free. Check your connection and try again.`,
  };
}

/**
 * Whether the username step may wave an unverifiable handle through.
 *
 * That step deliberately treats "we could not check" as a pass, so a bad
 * connection cannot strand someone on it. That is right the first time and
 * wrong the second: if sign-in already bounced this athlete back saying this
 * handle could not be confirmed, passing the same name again on another failed
 * lookup walks them into the silent `handle_a1b2` rename the bounce existed to
 * prevent — the same dead end, one lap later.
 *
 * So leniency is scoped to the handle it was granted for. Any *other* name
 * still passes on an unknown lookup, because the offline athlete this protects
 * has to be able to move; only re-presenting the exact name already refused is
 * blocked.
 *
 * @param username     the handle being submitted now
 * @param refusedAtSignIn the handle sign-in could not confirm, if any
 */
export function mayPassUncheckedHandle(
  username: string,
  refusedAtSignIn: string | null,
): boolean {
  if (!refusedAtSignIn) return true;
  return username.trim().toLowerCase() !== refusedAtSignIn.trim().toLowerCase();
}
