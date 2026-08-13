/**
 * Deciding whether a username change may go ahead.
 *
 * Onboarding's rule — "free, or we could not check" — is deliberately lenient,
 * because blocking there traps an offline athlete on a step with no way past
 * it. A rename is the opposite situation: the athlete already has a working
 * handle, so the safe answer when the network is unclear is to change nothing
 * and say so. Guessing here risks either a duplicate handle or a silent no-op,
 * and a silent no-op is the worse of the two: the athlete believes they are
 * `@arafat` and everyone else still sees the old name.
 *
 * `upsertProfile` cannot be used for this on its own. On collision it quietly
 * falls back to the existing handle, which is right for a background sync and
 * wrong for a deliberate rename — the athlete asked a question and deserves an
 * answer.
 */

import {
  isValidUsername,
  normalizeUsername,
  usernameError as usernameValidationError,
} from '@/domain/input';

/* Declared here rather than imported from the service layer: this module is
   pure decision logic, and pulling in `userService` would drag Firebase into
   every test that touches it. `userService` produces these values; this
   structurally identical type keeps the domain free of that dependency. */
export type UsernameAvailability = 'free' | 'taken' | 'unknown';

export type RenamePlan =
  /** Safe to write. `username` is normalised and ready for Firestore. */
  | { kind: 'ok'; username: string }
  /** Nothing to do — the athlete retyped the name they already have. */
  | { kind: 'unchanged' }
  /** Refused, with a line to show. */
  | { kind: 'rejected'; reason: string };

/**
 * Whether `next` may replace `current`.
 *
 * Split from the screen so the rules are testable without a Firestore double,
 * and so the copy for each refusal lives in one place.
 */
export function planRename(
  current: string,
  next: string,
  availability: UsernameAvailability,
): RenamePlan {
  const name = normalizeUsername(next);

  const shapeError = usernameValidationError(name);
  if (shapeError) return { kind: 'rejected', reason: shapeError };
  if (!isValidUsername(name)) return { kind: 'rejected', reason: 'Pick a username.' };

  /* Compared after normalising: `@Arafat` and `@arafat` are the same handle, and
     telling someone that is clearer than a write that appears to succeed and
     changes nothing visible. */
  if (name === normalizeUsername(current)) return { kind: 'unchanged' };

  if (availability === 'taken') {
    return { kind: 'rejected', reason: `@${name} is already taken. Try another.` };
  }

  /* The lookup itself failed. Not "free" — the whole point of this screen is
     that the athlete has something to lose. */
  if (availability === 'unknown') {
    return {
      kind: 'rejected',
      reason: "Couldn't check that name — you may be offline. Try again in a moment.",
    };
  }

  return { kind: 'ok', username: name };
}

/** The line shown after a successful rename. Names the handle, so it is proof. */
export function renameConfirmation(username: string): string {
  return `You're now @${username}`;
}
