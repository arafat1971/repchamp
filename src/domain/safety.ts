/**
 * Social safety — report reasons, blocks, reserved names, and client rate limits.
 *
 * Play Store UGC expectations: athletes can report and block peers; profile
 * photos and display names are user-generated content.
 */

export const REPORT_REASONS = [
  { id: 'inappropriate_avatar', label: 'Inappropriate profile photo' },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'spam', label: 'Spam or scam' },
  { id: 'impersonation', label: 'Impersonation' },
  { id: 'other', label: 'Something else' },
] as const;

export type ReportReasonId = (typeof REPORT_REASONS)[number]['id'];

export const REPORT_NOTE_MAX = 400;

/** System / brand names that must not be claimed as usernames. */
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'support',
  'help',
  'repchamp',
  'official',
  'mod',
  'moderator',
  'staff',
  'system',
  'null',
  'undefined',
]);

/**
 * Lightweight blocklist for usernames / display names.
 * Not a full moderation engine — catches obvious abuse before it ships to the
 * leaderboard. Real enforcement still needs report + review.
 */
const BLOCKED_SUBSTRINGS = [
  'nigger',
  'nigga',
  'fuck',
  'shit',
  'cunt',
  'rape',
  'pedophil',
  'childporn',
];

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.trim().toLowerCase());
}

export function containsBlockedLanguage(raw: string): boolean {
  const s = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return BLOCKED_SUBSTRINGS.some((w) => s.includes(w.replace(/[^a-z0-9]/g, '')));
}

/** Username is structurally valid AND not reserved / blocked language. */
export function isSafeUsername(raw: string): boolean {
  const u = raw.trim().toLowerCase().replace(/^@+/, '');
  if (isReservedUsername(u)) return false;
  if (containsBlockedLanguage(u)) return false;
  return true;
}

export function safeUsernameError(raw: string): string | null {
  const u = raw.trim().toLowerCase().replace(/^@+/, '');
  if (isReservedUsername(u)) return 'That username is reserved.';
  if (containsBlockedLanguage(u)) return 'Choose a different username.';
  return null;
}

/** Only HTTPS remote avatars (or empty) belong on the public cloud profile. */
export function isCloudSafeAvatarUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  return url.startsWith('https://');
}

/** Rate-limit windows used by the client before hitting Firestore. */
export const RATE_LIMITS = {
  friendAdd: { max: 20, windowMs: 60 * 60 * 1000 },
  duelInvite: { max: 30, windowMs: 60 * 60 * 1000 },
  coupleNudge: { max: 3, windowMs: 60 * 60 * 1000 },
  report: { max: 10, windowMs: 24 * 60 * 60 * 1000 },
  reportSameTarget: { max: 1, windowMs: 24 * 60 * 60 * 1000 },
} as const;

export type RateLimitKind = keyof typeof RATE_LIMITS;

/**
 * Pure check: given prior event timestamps, may another event fire at `now`?
 */
export function canPassRateLimit(
  timestamps: readonly number[],
  max: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  const recent = timestamps.filter((t) => now - t < windowMs);
  return recent.length < max;
}

/** Next timestamp list after recording an event (pruned to the window). */
export function recordRateLimitEvent(
  timestamps: readonly number[],
  windowMs: number,
  now = Date.now(),
): number[] {
  return [...timestamps.filter((t) => now - t < windowMs), now];
}
