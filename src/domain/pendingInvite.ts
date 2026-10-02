/**
 * An invite link opened before onboarding is done.
 *
 * A partner's couple or duel link, or a friend's `@handle` link, is the app's
 * growth loop — and the three landing screens all sit outside the tabs, where
 * the onboarding gate lives. An athlete who had not finished onboarding either
 * joined with the placeholder profile ("Champion") or, for a friend link, lost
 * the link entirely once the tab gate bounced them to onboarding. The link is
 * parked here and replayed when onboarding finishes.
 *
 * Only an allowlist of internal routes with string params is ever stored or
 * replayed, so a stored value can never steer navigation somewhere unexpected.
 */

export const PENDING_INVITE_KEY = 'onboarding.pendingInvite';
const MAX_AGE_MS = 7 * 86_400_000;

const ALLOWED_PATHS = ['/couple/join', '/duel/join', '/modal/add-friend'] as const;
type AllowedPath = (typeof ALLOWED_PATHS)[number];

export interface PendingInvite {
  pathname: AllowedPath;
  params: Record<string, string>;
}

export function serializeInvite(invite: PendingInvite, now: number): string {
  return JSON.stringify({ ...invite, savedAt: now });
}

export function parseInvite(raw: string | null | undefined, now: number): PendingInvite | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return null;
    if (typeof o.savedAt !== 'number' || now - o.savedAt > MAX_AGE_MS) return null;
    if (!ALLOWED_PATHS.includes(o.pathname as AllowedPath)) return null;
    const params: Record<string, string> = {};
    if (o.params && typeof o.params === 'object') {
      for (const [k, v] of Object.entries(o.params as Record<string, unknown>)) {
        if (typeof v === 'string' && v.length <= 200 && /^[a-zA-Z_]{1,20}$/.test(k)) params[k] = v;
      }
    }
    return { pathname: o.pathname as AllowedPath, params };
  } catch {
    return null;
  }
}
