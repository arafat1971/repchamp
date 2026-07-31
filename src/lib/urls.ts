/**
 * Canonical public URLs for RepChamp.
 *
 * Hosted on Firebase Hosting (`repchamp.web.app`) so store listings, invite
 * links, and the in-app legal screen all share one stable origin. Keep these in
 * one place so a host change is a one-line edit.
 */

export const WEB_BASE = 'https://repchamp.web.app';

export const PRIVACY_URL = `${WEB_BASE}/privacy`;
export const TERMS_URL = `${WEB_BASE}/terms`;
export const SUPPORT_EMAIL = 'arafathossain455@gmail.com';

/** Google Play listing — used by web invite landing pages and share fallbacks. */
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=gg.repchamp.app';

/** Friend invite on the web (`/@username`) — opens the app or the store. */
export function friendInviteLink(username: string): string {
  return `${WEB_BASE}/@${encodeURIComponent(username.replace(/^@/, '').toLowerCase())}`;
}
