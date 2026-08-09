/**
 * What to restore when someone signs in to an account that already exists.
 *
 * Signing in with Google can mean two different things, and the app was
 * treating them the same. A brand-new athlete is creating an account and their
 * onboarding answers are the truth. Someone coming back — new phone, reinstall,
 * or a second device — already has a username, a photo and XP on the server,
 * and typing a fresh username during onboarding should not overwrite them.
 *
 * Pure, so the rule is testable without Firebase or a store.
 */

export interface CloudSnapshot {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  totalXp: number;
  /** Millisecond stamp of first profile create; absent on older records. */
  createdAt?: number;
}

export interface LocalSnapshot {
  username: string;
  avatarUri: string | null;
  totalXp: number;
}

export type AccountRestore =
  | { kind: 'new-account' }
  | {
      kind: 'returning';
      username: string;
      displayName: string;
      avatarUrl: string | null;
      /** True when the cloud account has progress this device does not. */
      hasProgress: boolean;
    };

/**
 * Decide whether this sign-in is a return.
 *
 * The test is whether the cloud profile carries a **username** — that is the one
 * field onboarding always sets and never leaves blank, so its presence means a
 * profile was completed at some point. XP alone is not enough: a returning
 * athlete may have signed up, never trained, and still expect their handle back.
 */
export function planAccountRestore(
  cloud: CloudSnapshot | null,
  local: LocalSnapshot,
): AccountRestore {
  if (!cloud || !cloud.username.trim()) return { kind: 'new-account' };

  return {
    kind: 'returning',
    username: cloud.username,
    displayName: cloud.displayName || cloud.username,
    avatarUrl: cloud.avatarUrl,
    /* Only claim progress when the cloud is genuinely ahead. A device that has
       trained more than the server — offline sets not yet pushed — is not
       "restoring" anything, and telling that athlete their progress is back
       would be both wrong and alarming. */
    hasProgress: cloud.totalXp > 0 && cloud.totalXp >= local.totalXp,
  };
}

/**
 * The line shown after a successful sign-in.
 *
 * Sign-in used to advance the screen with no acknowledgement at all, which on a
 * slow connection is indistinguishable from a tap that did nothing. Naming what
 * happened — and whose account it was — is the difference between "it worked"
 * and "I think it worked".
 */
export function confirmationFor(restore: AccountRestore, email?: string | null): string {
  if (restore.kind === 'new-account') {
    return email ? `Signed in as ${email}` : 'Signed in';
  }
  return restore.hasProgress
    ? `Welcome back, ${restore.displayName} — your progress is here`
    : `Welcome back, ${restore.displayName}`;
}
