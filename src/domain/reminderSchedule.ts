/**
 * *When* the evening reminder fires, as opposed to what it says.
 *
 * `reminderCopy` and `dormantReminder` fixed the wording of the reminder slots.
 * The hour was never touched: `scheduleDailyTrainingReminder` hardcodes 19:00,
 * the dormant slot copies it, streak-at-risk sits at 20:00. Every athlete gets
 * the same evening regardless of when they actually train.
 *
 * For the 06:30 athlete that reminder arrives twelve hours after the moment it
 * would have worked, and after the window in which they were ever going to
 * train today has closed. It is not a nag they ignore because the words are
 * wrong — it is a nag that cannot be acted on without rearranging their day.
 *
 * `SessionSummary.completedAt` has recorded the hour of every set since launch
 * and nothing has ever read it. This module reads it, and answers one question:
 * is there a time of day this athlete reliably trains, and if so what is it?
 *
 * ## What this deliberately does not do
 *
 * It does not add a notification, change a frequency, or touch the cadence
 * table in `lib/notifications`. Same slot, same volume, same words — a
 * different hour. Volume is the thing that policy protects and this must not
 * cost any of it.
 *
 * Nor does it move the reminder *earlier in order to catch someone before they
 * have decided not to train*. The hour it picks is the hour they already chose
 * by training in it; the reminder lands where their own habit already is.
 *
 * Pure and dependency-free, for the same reason as its neighbours: the schedule
 * is provable in a test without a device, a clock, or a notification
 * permission.
 */

import type { SessionSummary } from '@/state/profileStore';

/**
 * The hour used when history cannot justify anything better.
 *
 * This is the hour the app has always sent at, so an athlete with no clear
 * pattern sees no change at all — the fallback is the current behaviour rather
 * than a new guess.
 */
export const DEFAULT_REMINDER_HOUR = 19;

/**
 * Sessions required before a training time is a habit rather than a coincidence.
 *
 * Three matches `exerciseProgress`'s `minSessions` and for the same stated
 * reason: two points are a line through noise. Someone who has trained twice at
 * 07:00 may be an early riser or may have had two unusual mornings, and moving
 * their reminder on that evidence is a guess wearing the costume of
 * personalisation.
 */
export const SESSIONS_BEFORE_LEARNING = 3;

/**
 * Share of sessions that must fall in the winning window for it to count.
 *
 * Below this the athlete trains whenever they can, which is a real and common
 * pattern — and the honest response to it is to leave their reminder where it
 * is rather than pick the marginally most frequent hour and dress it up as
 * their routine.
 */
export const HABIT_DOMINANCE = 0.5;

/**
 * The earliest and latest a learned reminder may fire.
 *
 * A reminder is allowed to be ignored; it is not allowed to wake anyone. An
 * athlete whose sessions cluster at 04:00 gets 06:00, and one who trains at
 * 23:00 gets 21:00 — still nearer their habit than a flat 19:00, without the
 * app ever being the reason a phone lights up in the dark.
 *
 * The floor is 06:00 rather than something more office-shaped because 07:00 is
 * an ordinary hour to train, and a floor above it would push that athlete's
 * lead-in *past the session it exists to prompt* — reminding them at 08:00 to
 * do the thing they did at 07:00, which is worse than the flat evening this
 * replaces. The floor must sit below the earliest hour anyone credibly trains,
 * or it defeats the feature for exactly the people it was built for.
 */
export const EARLIEST_REMINDER_HOUR = 6;
export const LATEST_REMINDER_HOUR = 21;

/**
 * How long before the habitual hour the reminder lands.
 *
 * Zero would put the reminder at the moment they normally train, by which point
 * the choice is already being made. An hour ahead is enough to change a plan
 * and short enough to still be about today.
 */
export const LEAD_HOURS = 1;

export interface LearnedHour {
  /** Local hour, 0–23, already clamped to the waking window. */
  hour: number;
  /** Sessions in the winning window, over sessions considered. */
  confidence: number;
  /** The modal training hour before lead time and clamping — for tests and logs. */
  habitualHour: number;
}

/**
 * The hour this athlete reliably trains, or null when there is not one.
 *
 * Null is the common and correct answer: too little history, or a genuinely
 * scattered routine. Callers keep `DEFAULT_REMINDER_HOUR` in that case, which
 * is what they sent before this module existed.
 *
 * Sessions are bucketed into three-hour windows rather than exact hours. An
 * athlete who trains at 06:50 one day and 07:10 the next has one habit, and
 * exact-hour bucketing would split it into two and conclude they have none.
 *
 * `recentLimit` bounds the history considered so that a routine which has
 * genuinely moved — a new job, a new gym — is followed rather than outvoted by
 * a year of a schedule the athlete no longer keeps.
 */
export function learnTrainingHour(
  sessions: readonly SessionSummary[],
  recentLimit = 30,
): LearnedHour | null {
  const hours = recentTrainingHours(sessions, recentLimit);
  if (hours.length < SESSIONS_BEFORE_LEARNING) return null;

  /* Three-hour windows, each identified by its centre hour. Counting a session
     into every window it falls in (rather than one) is what lets 06:50 and
     07:10 agree: both land in the window centred on 7. */
  const counts = new Map<number, number>();
  const exact = new Map<number, number>();
  for (const hour of hours) {
    exact.set(hour, (exact.get(hour) ?? 0) + 1);
    for (const centre of [hour - 1, hour, hour + 1]) {
      if (centre < 0 || centre > 23) continue;
      counts.set(centre, (counts.get(centre) ?? 0) + 1);
    }
  }

  let habitualHour = -1;
  let best = 0;
  for (const [centre, count] of counts) {
    if (count > best) {
      best = count;
      habitualHour = centre;
      continue;
    }
    /* A tight routine ties three ways — sessions all at 07:00 give the windows
       centred on 6, 7 and 8 an identical count, because each session is counted
       into all three. The centre is the hour they actually train, so the tie
       breaks toward whichever candidate holds the most sessions in its own
       right; the flanking windows hold none. Falling back to the earlier hour
       only matters for a genuinely split routine, where being early is still
       actionable and being late is not. */
    if (count === best && habitualHour >= 0) {
      const challenger = exact.get(centre) ?? 0;
      const incumbent = exact.get(habitualHour) ?? 0;
      if (challenger > incumbent || (challenger === incumbent && centre < habitualHour)) {
        habitualHour = centre;
      }
    }
  }

  if (habitualHour < 0) return null;

  const confidence = best / hours.length;
  if (confidence < HABIT_DOMINANCE) return null;

  return {
    hour: clampToWakingHours(habitualHour - LEAD_HOURS),
    confidence,
    habitualHour,
  };
}

/**
 * The hour to schedule the evening reminder at.
 *
 * The single entry point callers need: hands back `DEFAULT_REMINDER_HOUR`
 * whenever history has not earned anything else, so a call site can use it
 * unconditionally without repeating the null handling.
 */
export function reminderHourFor(
  sessions: readonly SessionSummary[],
  fallback = DEFAULT_REMINDER_HOUR,
): number {
  return learnTrainingHour(sessions)?.hour ?? fallback;
}

/**
 * Local hours of the most recent sessions, newest first.
 *
 * `completedAt` is an ISO instant; `new Date(...).getHours()` reads it back in
 * the device's current zone, which is the zone the notification will fire in.
 * That is the right frame even for sessions recorded elsewhere — a reminder for
 * someone who has moved should follow the clock they now live by.
 *
 * Records with an unparseable timestamp are skipped rather than defaulted: a
 * corrupt row must not vote for midnight.
 */
function recentTrainingHours(
  sessions: readonly SessionSummary[],
  recentLimit: number,
): number[] {
  const chronological = [...sessions]
    .filter((s) => typeof s.completedAt === 'string')
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, Math.max(0, recentLimit));

  const hours: number[] = [];
  for (const session of chronological) {
    const at = new Date(session.completedAt);
    const hour = at.getHours();
    if (Number.isFinite(at.getTime()) && Number.isInteger(hour)) hours.push(hour);
  }
  return hours;
}

/** Pulls an hour into the waking window; never wakes anyone, never sends at 03:00. */
function clampToWakingHours(hour: number): number {
  if (hour < EARLIEST_REMINDER_HOUR) return EARLIEST_REMINDER_HOUR;
  if (hour > LATEST_REMINDER_HOUR) return LATEST_REMINDER_HOUR;
  return hour;
}
