import { dayKey } from '@/domain/progression';

/**
 * What Home needs from the clock: the minute (for the paired pace hint and the
 * morning card's hour) and the day (so everything keyed on "today" rolls over).
 */
export interface HomeClock {
  now: number;
  day: string;
}

export function clockAt(nowMs: number): HomeClock {
  return { now: nowMs, day: dayKey(new Date(nowMs)) };
}

/**
 * Should a tick cause a re-render?
 *
 * Home used to tick state every minute for everyone, re-rendering a
 * 1,000-line screen to refresh a pace hint that only exists when paired. The
 * day still has to roll over for an unpaired athlete who leaves the app open
 * past midnight, so a tick is only worth a render when the day changed, or
 * when something on screen actually reads the minute.
 *
 * Returns the same object when nothing visible changed, so a `setState` with
 * it bails out.
 */
export function advanceClock(prev: HomeClock, nowMs: number, readsMinute: boolean): HomeClock {
  const next = clockAt(nowMs);
  if (next.day !== prev.day) return next;
  return readsMinute ? next : prev;
}
