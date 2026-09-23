/**
 * What a scanned RepChamp QR code is for.
 *
 * The app shows three kinds of code — a couple invite, a duel lobby and, now,
 * a friend card — and each used to need its own scanner, opened from its own
 * screen. Pointing the couple scanner at a duel code did nothing at all, which
 * reads as "the camera is broken" rather than "wrong door". One classifier
 * lets a single scanner accept anything the app prints and send it to the
 * route that already knows how to handle it.
 *
 * Classification is by *shape and path*, never by trying each parser in turn:
 * `parseInviteCode` matches any `?code=`, and a bare 6-character token could in
 * principle be a username, so the link's path decides first and the bare-value
 * fallbacks only apply when there is no path to read.
 */

import { APP_SCHEME, normalizePairCode, parseInviteCode } from '@/domain/couple';
import { isDuelId, parseDuelInvite } from '@/domain/duelInvite';
import { isValidUsername, normalizeUsername } from '@/domain/input';
import { WEB_BASE } from '@/lib/urls';

export type ScanTarget =
  | { kind: 'couple'; code: string }
  | { kind: 'duel'; id: string }
  | { kind: 'friend'; username: string };

/** The deep link a friend QR encodes — opens the installed app on add-friend. */
export function friendInviteDeepLink(username: string): string {
  return `${APP_SCHEME}://modal/add-friend?u=${encodeURIComponent(normalizeUsername(username))}`;
}

function friend(raw: string): ScanTarget | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null; // A malformed `%` escape — not a code we printed.
  }
  const username = normalizeUsername(decoded);
  return isValidUsername(username) ? { kind: 'friend', username } : null;
}

/**
 * Classify a scan, or null for anything that is not ours.
 *
 * Null is the common case — a scanner sees menus, parcels and Wi-Fi codes —
 * and the caller keeps scanning rather than complaining about each one.
 */
export function classifyScan(input: string): ScanTarget | null {
  const raw = input.trim();
  if (!raw) return null;

  // Any URL must be ours before its path means anything: `/@name` is a
  // profile on half the web, and `/duel/join` is not a claim only we can make.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    const ours = raw.startsWith(`${APP_SCHEME}://`) || raw.startsWith(`${WEB_BASE}/`);
    if (!ours) return null;

    // The path says what the code is for.
    if (/\/duel\/join\b/.test(raw)) {
      const id = parseDuelInvite(raw);
      return id ? { kind: 'duel', id } : null;
    }
    if (/\/couple\/join\b/.test(raw)) {
      const code = parseInviteCode(raw);
      return code ? { kind: 'couple', code } : null;
    }
    const addFriend = /\/add-friend\?(?:[^#]*&)?u=([^&#]+)/.exec(raw);
    if (addFriend) return friend(addFriend[1] as string);
    // The web friend link, `https://repchamp.web.app/@name`.
    const webHandle = /^https?:\/\/[^/]+\/@([^/?#]+)/.exec(raw);
    if (webHandle) return friend(webHandle[1] as string);
    return null;
  }

  // Bare values, as typed or printed under a code.
  if (isDuelId(raw)) return { kind: 'duel', id: raw };
  // Exactly six characters and nothing else. A bare username needs its `@`,
  // otherwise "sam123" would be read as a pair code.
  if (/^[A-Za-z0-9]{6}$/.test(raw)) return { kind: 'couple', code: normalizePairCode(raw) };
  if (raw.startsWith('@')) return friend(raw);
  return null;
}

/**
 * Where a scanned code lands: the route that already owns its flow.
 *
 * Shared by every scanner, so the couple scanner handed a duel code sends it
 * to the same place the universal scanner — or a phone camera — would.
 */
export function landingHref(
  target: ScanTarget,
):
  | { pathname: '/couple/join'; params: { code: string } }
  | { pathname: '/duel/join'; params: { id: string } }
  | { pathname: '/modal/add-friend'; params: { u: string } } {
  if (target.kind === 'couple') return { pathname: '/couple/join', params: { code: target.code } };
  if (target.kind === 'duel') return { pathname: '/duel/join', params: { id: target.id } };
  return { pathname: '/modal/add-friend', params: { u: target.username } };
}
