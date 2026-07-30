/**
 * Presence + invite labeling — pure helpers for "who's active" and inbox copy.
 *
 * `lastActiveAt` is a client-written millisecond stamp on `users/{uid}`. Friends
 * with a stamp inside the window count as online; Home's activity pill uses the
 * same rule. Invite kinds ride on duel docs so the inbox can distinguish duel /
 * train / compete without a second collection.
 */

/** How long after a heartbeat an athlete still counts as active. */
export const ACTIVE_WINDOW_MS = 15 * 60 * 1000;

/** Challenge flavors stored on pending duel docs (`kind`). */
export type InviteKind = 'duel' | 'train' | 'compete';

/** True when `lastActiveAt` falls inside the active window ending at `now`. */
export function isRecentlyActive(
  lastActiveAt: number | null | undefined,
  now = Date.now(),
  windowMs = ACTIVE_WINDOW_MS,
): boolean {
  if (lastActiveAt == null || !Number.isFinite(lastActiveAt)) return false;
  return lastActiveAt > now - windowMs && lastActiveAt <= now + 60_000;
}

/** Inbox / chip copy for a pending invite. */
export function invitePresentation(kind: InviteKind | null | undefined, cooperative?: boolean): {
  verb: string;
  chip: string;
} {
  const resolved: InviteKind =
    kind === 'train' || kind === 'compete' || kind === 'duel'
      ? kind
      : cooperative
        ? 'train'
        : 'duel';

  switch (resolved) {
    case 'train':
      return { verb: 'Invited you to train together', chip: 'Train together' };
    case 'compete':
      return { verb: 'Challenged you on this week’s board', chip: 'Compete' };
    default:
      return { verb: 'Challenged you to a duel', chip: 'Duel' };
  }
}

/** Coerce a raw Firestore string into a known invite kind. */
export function parseInviteKind(raw: unknown): InviteKind {
  if (raw === 'train' || raw === 'compete' || raw === 'duel') return raw;
  return 'duel';
}
