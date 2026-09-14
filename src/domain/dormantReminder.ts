/**
 * The three-days-away reminder.
 *
 * The cadence table covered two states — "has not trained today" and "the
 * shared streak dies tonight" — and both assume an athlete who is still here.
 * Someone who has been gone three days gets the evening nag on a loop, the same
 * "Time for a quick set" they got on day one, which is the wording that already
 * failed to bring them back on days one and two.
 *
 * This is a distinct slot with a distinct job: not "you have not trained
 * today", which they know, but "here is what you built, it is still here".
 *
 * ## Why this states what they have rather than what they are losing
 *
 * The obvious framing for a win-back push is loss — name the thing at stake and
 * let the discomfort do the work. This module deliberately does not, for three
 * reasons that are local to this codebase rather than matters of taste:
 *
 * 1. `buildDailyReminder` already refuses to name a streak of zero, because "an
 *    athlete who has lapsed does not need reminding that they lapsed". A day-3
 *    dormant athlete is precisely that athlete. A loss-framed push here would
 *    contradict a rule the neighbouring slot already enforces.
 *
 * 2. By day three the streak is already broken — that is what being dormant
 *    means. Copy about "the progress you are risking" would be naming something
 *    already gone, which is the fabricated claim `progressProof` returns null
 *    rather than make. Risk framing needs stakes, and manufacturing stakes is
 *    how a notification slot starts lying.
 *
 * 3. Banked reps and a best set do not decay. There is no honest sentence in
 *    which they are at risk, and an athlete who returns to find nothing was
 *    actually lost learns to disbelieve the next one.
 *
 * Same trigger, same threshold, same slot — a true fact and an open door
 * instead. The retention mechanism is identical; only the sentence differs.
 *
 * Pure and dependency-free (past `progressProof`, itself pure), for the same
 * reason as `reminderCopy`: the wording is provable without a device or a
 * notification permission.
 */

import { headlineProof } from '@/domain/progressProof';
import type { ReminderCopy } from '@/domain/reminderCopy';
import type { SessionSummary } from '@/state/profileStore';

/**
 * Days away before the dormant slot takes over from the daily reminder.
 *
 * Three is the first gap that is unambiguously a lapse rather than a rest day.
 * Two is a weekend; one is Tuesday. Firing earlier would mean telling someone
 * who took a deliberate rest day that they have gone missing, which is both
 * wrong and the exact overtraining pressure the daily slot avoids.
 */
export const DORMANT_AFTER_DAYS = 3;

/**
 * Whole days between the last recorded session and today, or null when there is
 * no history to measure from.
 *
 * Both arguments are `YYYY-MM-DD` day keys as written by `dayKey`, and the
 * arithmetic is done at UTC noon so a DST boundary inside the window cannot
 * round a 3-day gap down to 2. Null for an athlete who has never finished a
 * session: they are not dormant, they have not started, and a win-back push has
 * nothing true to say to them.
 *
 * Deliberately takes day keys rather than `Date`s so the whole decision is
 * expressible in a test without freezing a clock.
 */
export function daysSinceLastSession(
  lastDay: string | null | undefined,
  today: string,
): number | null {
  if (!lastDay) return null;

  const last = parseDayKey(lastDay);
  const now = parseDayKey(today);
  if (last === null || now === null) return null;

  const days = Math.round((now - last) / 86_400_000);
  return days < 0 ? 0 : days;
}

/** `YYYY-MM-DD` to a UTC-noon timestamp, or null when it is not a day key. */
function parseDayKey(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), 12);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Whether the dormant slot should fire, and what it says.
 *
 * Returns null — meaning "schedule nothing, leave the daily slot alone" —
 * whenever the athlete is not actually dormant, or whenever there is no honest
 * claim to make. The null cases are the point of the function as much as the
 * copy is.
 *
 * The body is `headlineProof`: the single strongest *true* thing on record. If
 * it declines to speak, so does this. An athlete with one abandoned session has
 * nothing worth being reminded of, and the correct number of notifications to
 * send them is zero rather than a generic line dressed up as a milestone.
 */
export function buildDormantReminder(input: {
  daysAway: number | null;
  sessions: readonly SessionSummary[];
  /** Streak as of today — zero for a genuinely dormant athlete, threaded for `headlineProof`. */
  streak?: number;
}): ReminderCopy | null {
  const daysAway = Number.isFinite(input.daysAway ?? NaN)
    ? Math.floor(input.daysAway as number)
    : null;

  if (daysAway === null || daysAway < DORMANT_AFTER_DAYS) return null;

  const proof = headlineProof(input.sessions, input.streak ?? 0);
  if (!proof) return null;

  return {
    /* No day count in the title. "3 days away" is a fact about their absence,
       which they already know and did not enjoy; the title is for the part
       worth unlocking the phone to read. */
    title: 'Your progress is still here',
    body: `${proof}. Pick up where you left off.`,
  };
}
