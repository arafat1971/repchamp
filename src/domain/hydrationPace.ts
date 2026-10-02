/**
 * Hydration pacing — whether today's water is on track for the time of day.
 *
 * A total alone ("800 ml of 2 L") cannot say if that is good at 10:00 or bad
 * at 21:00. Spreading the goal evenly across the waking day gives a "where you
 * should be by now" line, and everything the card coaches with comes from the
 * gap to it: on pace, ahead, or a concrete catch-up amount.
 *
 * Pure and clock-injected, so every branch is testable.
 */

/** The drinking day: goal spread evenly from 08:00 to 22:00. */
export const PACE_START_HOUR = 8;
export const PACE_END_HOUR = 22;

/** Within this much of the line counts as on pace — a glass is not a verdict. */
export const PACE_TOLERANCE_ML = 150;

/** A typical glass, for the next-sip interval. */
const SIP_ML = 250;

export type PaceStatus = 'done' | 'ahead' | 'on' | 'behind' | 'early';

export interface HydrationPace {
  status: PaceStatus;
  /** Where the line says you should be right now, in ml. */
  expectedMl: number;
  /** The same, as a 0–1 fraction of the goal — for the marker on the bar. */
  expectedFraction: number;
  /** How far behind the line, in ml (0 unless behind). */
  behindMl: number;
  /** A one-tap amount that gets you back on the line, rounded to 50 ml. */
  catchUpMl: number;
  /** Minutes until the next glass keeps you on pace; null when done or behind. */
  nextSipMin: number | null;
  /** The coaching line, short enough for one row. */
  line: string;
}

function minutesOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

function roundTo50(ml: number): number {
  return Math.round(ml / 50) * 50;
}

export function hydrationPace(ml: number, goalMl: number, now: Date): HydrationPace {
  const goal = Math.max(1, goalMl);
  const start = PACE_START_HOUR * 60;
  const end = PACE_END_HOUR * 60;
  const t = minutesOfDay(now);
  const fraction = Math.max(0, Math.min(1, (t - start) / (end - start)));
  const expectedMl = Math.round(goal * fraction);
  const remainingMl = Math.max(0, goal - ml);

  const base = { expectedMl, expectedFraction: fraction };

  if (ml >= goal) {
    return { ...base, status: 'done', behindMl: 0, catchUpMl: 0, nextSipMin: null, line: 'Goal hit — you are fully topped up' };
  }

  /* Outside the drinking day there is no "next sip" to schedule: before it,
     anything already drunk is a head start; after it, the day is closing. */
  if (t < start) {
    return ml === 0
      ? { ...base, status: 'early', behindMl: 0, catchUpMl: 0, nextSipMin: null, line: 'Start the day with a glass' }
      : { ...base, status: 'ahead', behindMl: 0, catchUpMl: 0, nextSipMin: null, line: 'Early head start — keep it going after 8 AM' };
  }

  const gap = expectedMl - ml;
  if (t >= end && gap > PACE_TOLERANCE_ML) {
    return {
      ...base,
      status: 'behind',
      behindMl: remainingMl,
      catchUpMl: Math.max(100, Math.min(500, roundTo50(remainingMl))),
      nextSipMin: null,
      line: `${roundTo50(remainingMl)} ml short today — one more glass before bed`,
    };
  }
  if (gap > PACE_TOLERANCE_ML) {
    const catchUpMl = Math.max(100, Math.min(750, roundTo50(gap)));
    return {
      ...base,
      status: 'behind',
      behindMl: gap,
      catchUpMl,
      nextSipMin: null,
      line: `${roundTo50(gap)} ml behind pace — catch up now`,
    };
  }

  /* On or ahead: when is the next glass due? Spread what is left over what
     is left of the drinking day. */
  const minutesLeft = Math.max(0, end - Math.max(t, start));
  const sipsLeft = Math.max(1, Math.ceil(remainingMl / SIP_ML));
  let nextSipMin = minutesLeft > 0 ? Math.max(5, Math.round(minutesLeft / sipsLeft)) : null;
  // Ahead of the line: the next glass can wait until the line catches up.
  if (nextSipMin != null && gap < 0) {
    const perMinute = goal / (end - start);
    nextSipMin = Math.max(nextSipMin, Math.round(-gap / perMinute));
  }

  const when = nextSipMin == null ? '' : ` · next sip ${formatWait(nextSipMin)}`;
  if (gap < -PACE_TOLERANCE_ML) {
    return { ...base, status: 'ahead', behindMl: 0, catchUpMl: 0, nextSipMin, line: `Ahead of pace${when}` };
  }
  return { ...base, status: 'on', behindMl: 0, catchUpMl: 0, nextSipMin, line: `On pace${when}` };
}

/** "in 25 min", "in 1 h 10 min". */
export function formatWait(min: number): string {
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `in ${h} h` : `in ${h} h ${m} min`;
}
