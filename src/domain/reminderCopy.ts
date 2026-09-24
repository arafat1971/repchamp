/**
 * What the daily reminder and the weekly recap actually say.
 *
 * Both slots existed and both said nothing. The evening reminder read "Time for
 * a quick set / Two minutes of reps keeps your streak and form sharp." whether
 * the athlete was on day zero or day forty — it named the streak without ever
 * saying what it was, so the one person with most to lose was told the least.
 * The weekly recap read "See what you got done", which is an invitation to go
 * and look rather than a fact worth waking up to.
 *
 * Neither of these is a new notification. The cadence table in
 * `lib/notifications.ts` is deliberately strict and this does not touch it —
 * same two slots, same frequency, different words.
 *
 * Pure and dependency-free (past `progressProof`, which is itself pure) so the
 * wording is testable without a device or a notification permission — the same
 * reason `inviteNotification` is factored out this way.
 */

import { headlineProof } from '@/domain/progressProof';
import type { SessionSummary } from '@/state/profileStore';

export interface ReminderCopy {
  title: string;
  body: string;
}

/**
 * A streak is only worth naming once it is worth protecting.
 *
 * Below this the number is discouraging rather than motivating — "Day 1 — don't
 * break it now" is a demand made of someone who has done one set, and a
 * two-day streak broadcast as an achievement is the same fabricated praise
 * `progressProof` exists to refuse.
 */
export const STREAK_WORTH_NAMING = 3;

/**
 * The evening "you have not trained today" reminder.
 *
 * The streak case leads with the number in the title, because on Android the
 * title is what survives a collapsed shade — a body that says "day 12" is the
 * half that gets truncated. It states what is at stake and stops; no urgency
 * language, since this fires every evening and a daily emergency is not
 * credible.
 *
 * Deliberately says nothing about a streak of zero. An athlete who has lapsed
 * does not need reminding that they lapsed.
 *
 * ## Why `daysAway` matters to the wording
 *
 * A streak survives one rest day: `calculateStreak` walks back from today and
 * tolerates a single gap. So an athlete who last trained two days ago still has
 * a non-zero streak — and this slot used to tell them "one set today and the
 * streak holds", which is the complacent line it sends on an ordinary evening.
 * It was false precisely when it mattered most: the grace day is already spent,
 * so the streak does not hold, it dies at midnight unless they train now.
 *
 * The one athlete with something genuinely urgent at stake was the one told
 * there was no hurry. `daysAway` lets the last night of a streak say so. It is
 * optional because the caller has not always computed it, and absent it the
 * copy is exactly what it always was.
 */
export function buildDailyReminder(input: {
  streak: number;
  /** Whole days since the last recorded session; null or absent when unknown. */
  daysAway?: number | null;
}): ReminderCopy {
  const streak = Number.isFinite(input.streak) ? Math.floor(input.streak) : 0;
  const daysAway = Number.isFinite(input.daysAway ?? NaN)
    ? Math.floor(input.daysAway as number)
    : null;

  /* The grace day is spent: they trained two days ago, missed yesterday, and
     have not trained today. Tonight is the last night this streak exists. */
  const lastNight = daysAway !== null && daysAway >= 2;

  if (streak >= STREAK_WORTH_NAMING) {
    if (lastNight) {
      /* "Tonight" would be wrong for most of the people who see this. The
         learned hour puts a 07:00 athlete's reminder at 06:00, so a warning
         saying the streak "ends tonight" arrives eighteen hours early, before
         the day it refers to has meaningfully started. "Today" is true at every
         hour this slot can fire — 06:00 or 21:00 — because the streak dies at
         the end of the same calendar day either way. */
      return {
        title: `Day ${streak} ends today`,
        body: 'Your rest day is already used — one set keeps the streak alive.',
      };
    }
    return {
      title: `Day ${streak} — keep it going`,
      body: 'One set today and the streak holds.',
    };
  }

  return {
    title: 'Time for a quick set',
    body: 'Two minutes of reps keeps your streak and form sharp.',
  };
}

/**
 * The Sunday recap.
 *
 * Built on `headlineProof`, which returns the single strongest *true* thing
 * available and null when nothing has been earned — so a quiet week gets the
 * generic line rather than an invented milestone. That honesty is the whole
 * point of the module and this must not paper over it: a recap claiming
 * progress that did not happen teaches the athlete to discount every future
 * one.
 */
export function buildWeeklyRecap(input: {
  sessions: readonly SessionSummary[];
  streak: number;
}): ReminderCopy {
  const proof = headlineProof(input.sessions, input.streak);

  return {
    title: 'Your week in reps',
    body: proof ?? 'See what you got done — and celebrate the wins.',
  };
}
