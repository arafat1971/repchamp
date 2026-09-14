/**
 * Retention instrumentation — the decisions, kept out of the emit sites.
 *
 * The app already ships the mechanics this measures: streaks with a one-rest-day
 * tolerance, four leagues on weekly XP, daily/streak/recap nudges. What it has
 * never had is any way to tell which of them actually brings anyone back, so
 * every retention argument has been unfalsifiable. These helpers answer four
 * questions — did a streak continue or break, is this a return visit and on what
 * day, and did the athlete change league — and they are pure so the answers can
 * be proven without a device or a network.
 *
 * Pure on purpose, and separate from `profileStore` on purpose: that store
 * deliberately does not import analytics, so state stays independent of whatever
 * measurement happens to be wired up this month. Call sites read a decision from
 * here and emit it; nothing here emits anything itself.
 */

import { calculateStreak, dayKey } from './progression';

/* ------------------------------------------------------------------ *
 * Streak continued / broken
 * ------------------------------------------------------------------ */

export type StreakOutcome =
  | { kind: 'started'; length: 1 }
  | { kind: 'continued'; length: number; previous: number }
  | { kind: 'broken'; length: number; previous: number }
  | { kind: 'same-day' };

/**
 * What today's session did to the streak.
 *
 * `previousDays` is the training-day history *before* this session, so the
 * caller must read it ahead of recording. A second session on a day already
 * trained is `same-day`: it is not a new day for the streak and must not be
 * counted as one, or a keen athlete doing three sets would look like three
 * days of retention.
 *
 * `broken` is deliberately reported at the moment the athlete *returns* after
 * a gap, not at the moment the gap opens — nothing runs on a day nobody opens
 * the app, so a break is only ever observable in hindsight.
 */
export function streakOutcome(
  previousDays: readonly string[],
  today = dayKey(),
): StreakOutcome {
  if (previousDays.includes(today)) return { kind: 'same-day' };

  const previous = calculateStreak(previousDays, today);
  const next = calculateStreak([...previousDays, today], today);

  if (previous === 0) {
    // No live run coming in. If there is any history at all the athlete is
    // returning from a lapse; a first-ever session is simply a start.
    return previousDays.length === 0
      ? { kind: 'started', length: 1 }
      : { kind: 'broken', length: next, previous };
  }
  return { kind: 'continued', length: next, previous };
}

/* ------------------------------------------------------------------ *
 * Return visits
 * ------------------------------------------------------------------ */

export interface ReturnVisit {
  /** Days since first open. 0 on the install day, 1 the next day, and so on. */
  dayN: number;
  /** Days since the previous visit — 1 is consecutive, more means a gap. */
  daysSinceLast: number;
}

/**
 * Whether this open is the first of a new day, and how far from install.
 *
 * Returns null when the athlete has already opened the app today, so the event
 * fires once per calendar day rather than on every foreground — otherwise a
 * commuter checking the app four times would outweigh four separate people.
 *
 * D1/D7 are conventionally measured from install, so `dayN` counts from
 * `firstDay` rather than from the previous visit.
 */
export function returnVisit(
  firstDay: string | null,
  lastSeenDay: string | null,
  today = dayKey(),
): ReturnVisit | null {
  if (!firstDay) return null;
  if (lastSeenDay === today) return null;

  return {
    dayN: daysBetween(firstDay, today),
    daysSinceLast: lastSeenDay ? daysBetween(lastSeenDay, today) : 0,
  };
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative clamps to 0. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00`);
  const b = Date.parse(`${to}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/* ------------------------------------------------------------------ *
 * League movement
 * ------------------------------------------------------------------ */

export type LeagueMove =
  | { kind: 'promoted'; from: string; to: string }
  | { kind: 'demoted'; from: string; to: string }
  | { kind: 'unchanged' };

/**
 * Movement between two league ids, ordered by `order`.
 *
 * Demotion is reported as well as promotion. Weekly XP resets, so a league is
 * losable, and "who drops out of Gold and never comes back" is the more
 * interesting retention question of the two.
 */
export function leagueMove(
  previousId: string | null,
  currentId: string,
  order: readonly string[],
): LeagueMove {
  if (!previousId || previousId === currentId) return { kind: 'unchanged' };

  const from = order.indexOf(previousId);
  const to = order.indexOf(currentId);
  // An id outside the ladder (renamed tier, corrupted store) is not movement
  // worth reporting — better silent than a nonsense promotion.
  if (from < 0 || to < 0) return { kind: 'unchanged' };

  return to > from
    ? { kind: 'promoted', from: previousId, to: currentId }
    : { kind: 'demoted', from: previousId, to: currentId };
}
