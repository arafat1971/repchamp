/**
 * Client-side input validation — shared rules for usernames, emails, passwords,
 * and codes. Keeps UI, services, and tests on one definition.
 *
 * Server rules still enforce length/type caps; this stops bad input before a
 * network round-trip and rejects clearly malicious strings early.
 */

import { safeUsernameError } from '@/domain/safety';

/** Public usernames: 3–20 chars, lowercase letters/digits/underscore. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_RE = /^[a-z0-9_]+$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  const u = normalizeUsername(raw);
  return (
    u.length >= USERNAME_MIN &&
    u.length <= USERNAME_MAX &&
    USERNAME_RE.test(u) &&
    safeUsernameError(u) == null
  );
}

export function usernameError(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (!u) return 'Pick a username.';
  if (u.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters.`;
  if (u.length > USERNAME_MAX) return `At most ${USERNAME_MAX} characters.`;
  if (!USERNAME_RE.test(u)) return 'Only letters, numbers, and underscores.';
  return safeUsernameError(u);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const e = normalizeEmail(raw);
  return e.length <= 254 && EMAIL_RE.test(e);
}

/** Firebase Auth minimum is 6; we require 8 for new accounts. */
export const PASSWORD_MIN = 8;

export function isValidPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= PASSWORD_MIN && password.length <= 128;
}

export function passwordError(password: string): string | null {
  if (!password) return 'Enter a password.';
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > 128) return 'Password is too long.';
  return null;
}

/** Display names shown on HUD / leaderboard — trim and cap. */
export const DISPLAY_NAME_MAX = 40;

export function sanitizeDisplayName(raw: string, fallback = 'Champion'): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, DISPLAY_NAME_MAX);
  return cleaned || fallback;
}
