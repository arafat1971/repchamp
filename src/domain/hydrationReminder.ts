/**
 * When to remind someone to drink, and what to say.
 *
 * Hydration shipped without reminders, which is most of why a water tracker
 * gets used for two days and then forgotten: unlike training, drinking is not
 * an event anyone plans, so nothing brings the athlete back to the card.
 *
 * ## Why this does not reuse the evening slot
 *
 * `syncLocalReminders` is deliberately strict — one evening ping, and the
 * dormant line *replaces* the daily nag rather than joining it. Water cannot
 * live there: a reminder to drink at 19:00 is useless, because the day is
 * nearly over and the only honest thing left to say is that the goal was
 * missed.
 *
 * So this is a separate, earlier slot with a different job. To keep the total
 * volume honest it is capped at two pings a day, both before the training
 * reminder, and both suppressed the moment the goal is met.
 *
 * ## The rule that matters
 *
 * A reminder is only sent when it can still be acted on *and* when it is
 * telling the truth. If the goal is already met there is nothing to ask for;
 * if the day has barely started there is nothing to be behind on. Both cases
 * return null rather than inventing a line, the same discipline
 * `buildDormantReminder` follows.
 *
 * Pure and dependency-free so the wording is testable without a device.
 */

import { formatMl, hydrationProgress, type DrinkEntry } from '@/domain/hydration';

export interface ReminderCopy {
  title: string;
  body: string;
}

/**
 * The two slots, as hours.
 *
 * Late morning and mid-afternoon: both leave enough of the day to act on, and
 * both sit well clear of the 19:00 training slot so the athlete never gets two
 * pings in the same hour. Deliberately not learned from behaviour like the
 * training hour is — drinking has no equivalent of a workout time to learn
 * from, and a fabricated "your hydration window" would be exactly the invented
 * insight this codebase refuses elsewhere.
 */
export const HYDRATION_SLOTS = [11, 15] as const;

/**
 * How far behind pace an athlete must be before a slot says anything.
 *
 * Expressed as a fraction of the goal they *should* have drunk by that hour.
 * At 0.75 someone tracking roughly on target is left alone, and only a real
 * shortfall earns a ping. Set this to 1.0 and every slot fires every day,
 * which is how a reminder becomes noise.
 */
export const BEHIND_PACE_THRESHOLD = 0.75;

/** The waking window pace is measured across: 08:00 to the evening slot. */
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 19;

/**
 * How much of the day's goal should be drunk by a given hour.
 *
 * Linear across the waking window rather than front-loaded: no evidence
 * supports a cleverer curve, and a linear target is one the athlete can
 * predict, which matters more than being notionally optimal.
 */
export function expectedByHour(goalMl: number, hour: number): number {
  if (hour <= DAY_START_HOUR) return 0;
  if (hour >= DAY_END_HOUR) return goalMl;
  const through = (hour - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR);
  return Math.round(goalMl * through);
}

/**
 * The line for one slot, or null when there is nothing honest to send.
 *
 * Null covers every case where a ping would be noise: the goal is met, the
 * athlete is on pace, or the hour is outside the window. The caller cancels
 * the slot on null rather than substituting filler.
 */
export function buildHydrationReminder(input: {
  drinks: readonly DrinkEntry[];
  goalMl: number;
  day: string;
  hour: number;
}): ReminderCopy | null {
  const { drinks, goalMl, day, hour } = input;
  const progress = hydrationProgress(drinks, goalMl, day);

  // Nothing to ask for.
  if (progress.met) return null;

  const expected = expectedByHour(progress.goalMl, hour);
  if (expected <= 0) return null;

  // On or near pace — leave them alone.
  if (progress.ml >= expected * BEHIND_PACE_THRESHOLD) return null;

  const remaining = formatMl(progress.remainingMl);

  /* Two shapes, and the difference is whether they have started. Someone on
     zero is being asked to begin; someone part-way is being told what is
     left. Telling a person who has drunk nothing that they have "2 L to go"
     is technically true and reads as a scold. */
  if (progress.ml === 0) {
    return {
      title: 'Water',
      body: `Nothing logged yet today — a glass now puts you back on track for ${formatMl(progress.goalMl)}.`,
    };
  }

  return {
    title: 'Water',
    body: `${formatMl(progress.ml)} so far — ${remaining} to go today.`,
  };
}

/**
 * Whether a slot should be scheduled at all, before copy is built.
 *
 * Split out so the scheduler can cancel a slot cheaply without constructing a
 * string it will not use.
 */
export function shouldRemind(input: {
  drinks: readonly DrinkEntry[];
  goalMl: number;
  day: string;
  hour: number;
}): boolean {
  return buildHydrationReminder(input) !== null;
}
