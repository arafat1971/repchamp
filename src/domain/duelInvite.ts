/**
 * QR invites for duels.
 *
 * The couple flow already proved the shape: show a code on one phone, scan it
 * with the other, both land in the same live session. This is the same idea
 * for a 1v1 duel, and deliberately reuses `APP_SCHEME` and the same link
 * conventions so a scanner only has to understand one family of URLs.
 *
 * Two links, two jobs, exactly as in `couple.ts`:
 *
 * - the `repchamp://` deep link is what the QR encodes, because a phone's
 *   native camera offers to open an installed app straight from a custom
 *   scheme with no associated-domain setup;
 * - the https link is what gets shared as text, because it still means
 *   something to someone who does not have the app yet.
 */

import { APP_SCHEME } from '@/domain/couple';
import { WEB_BASE } from '@/lib/urls';

/**
 * Firestore auto-ids are 20 characters of `A-Za-z0-9`. Validating the shape
 * keeps a scan of some unrelated QR code from being sent to Firestore as if it
 * were a duel — the read would fail anyway, but failing here is faster and the
 * error can say something true.
 */
const DUEL_ID_RE = /^[A-Za-z0-9]{20}$/;

export function isDuelId(value: string): boolean {
  return DUEL_ID_RE.test(value);
}

/** The deep link a duel QR encodes. Opens the installed app straight to join. */
export function duelInviteDeepLink(duelId: string): string {
  return `${APP_SCHEME}://duel/join?id=${encodeURIComponent(duelId)}`;
}

/**
 * The shareable https link, for a text message rather than a QR.
 *
 * The path matches the app route (`app/duel/join.tsx`) and the deep link above,
 * exactly as `/couple/join` does. It used to be a bare `/duel`, which no route
 * answered — expo-router maps paths onto the filesystem and `app/duel/` has no
 * index — so a verified App Link would have opened the app onto nothing.
 */
export function duelInviteLink(duelId: string): string {
  return `${WEB_BASE}/duel/join?id=${encodeURIComponent(duelId)}`;
}

/**
 * Pull a duel id out of whatever was scanned or pasted.
 *
 * Tolerant like `parseInviteCode`: accepts either link form, a bare id, or an
 * id embedded in a longer share blurb. Anything that does not contain a
 * well-formed id returns null rather than a guess — joining the wrong duel is
 * worse than reporting a bad code.
 */
export function parseDuelInvite(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fromQuery = /[?&]id=([^&#\s]+)/.exec(trimmed);
  if (fromQuery) {
    const id = decodeURIComponent(fromQuery[1] as string);
    return isDuelId(id) ? id : null;
  }

  if (isDuelId(trimmed)) return trimmed;

  // A pasted blurb: "join my duel aB3xY9…". Take the first token that has the
  // right shape rather than the first token, so surrounding words are ignored.
  const tokens = trimmed.match(/[A-Za-z0-9]{20}/g) ?? [];
  for (const token of tokens) {
    if (isDuelId(token)) return token;
  }
  return null;
}

/**
 * Whether a duel is still open to whoever scans its code.
 *
 * Mirrors the Firestore rule exactly: a duel is joinable only while it is
 * `pending` with no specific target. The moment someone takes the guest seat
 * it goes `active`, and a second scanner must be told the race already
 * started rather than being sent into a transaction that will reject them.
 */
export function isJoinableByQr(duel: {
  status: string;
  targetUid: string | null;
  hostUid: string;
  guestUid: string | null;
}): boolean {
  return duel.status === 'pending' && duel.targetUid === null && duel.guestUid === null;
}

/** True when this athlete is the one who published the code. */
export function isOwnDuelInvite(duel: { hostUid: string }, uid: string): boolean {
  return duel.hostUid === uid;
}
