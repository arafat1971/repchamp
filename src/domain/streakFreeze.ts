/**
 * Streak freezes — banked protection for a streak across a short break.
 *
 * A streak already survives one rest day (see `calculateStreak`). Two missed
 * days in a row wipe it, and a lost long streak is the single most common
 * moment a habit app is abandoned for good: the number you were protecting is
 * gone, so there is nothing left to protect. A freeze covers one extra missed
 * day, so a weekend away or a sick day costs a freeze instead of the streak.
 *
 * Freezes are earned, never bought: one for every 7-day milestone, up to a
 * small cap, plus one to start. Spending is automatic and only happens when it
 * actually saves the streak — a gap too long for the bank to cover spends
 * nothing, because a freeze that fails to save anything is a freeze stolen.
 *
 * Frozen days are neutral in the streak walk: they neither add a day nor use
 * up the rest-day tolerance. The streak counts days trained, not days covered.
 */

import { daysBetween } from './retention';

/** Most freezes an athlete can hold at once. */
export const MAX_STREAK_FREEZES = 2;
/** Every this-many-day milestone of the streak earns a freeze. */
export const FREEZE_EARN_EVERY = 7;
/** Freezes a new athlete starts with, so the mechanic is visible from day one. */
export const STARTER_STREAK_FREEZES = 1;
/** How many frozen days to remember. Older ones are past any live streak's reach in practice. */
const FROZEN_DAYS_KEPT = 120;

/** `YYYY-MM-DD` shifted by `delta` days, calendar-safe. */
export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export interface FreezePlan {
  /** Days to mark frozen, oldest first. Empty when nothing is spent. */
  freeze: string[];
}

/**
 * Which missed days, if any, to cover with freezes before `today` is judged.
 *
 * Only closed days (before today) are considered: today can still be trained.
 * Within the gap since the last trained day, the first missed day is the free
 * rest day; every further missed day needs a freeze. If the bank cannot cover
 * all of them the streak is lost anyway, so nothing is spent.
 */
export function planStreakFreezes(input: {
  trainedDays: readonly string[];
  frozenDays: readonly string[];
  banked: number;
  today: string;
}): FreezePlan {
  const { trainedDays, frozenDays, banked, today } = input;
  if (banked <= 0) return { freeze: [] };

  let last: string | null = null;
  for (const day of trainedDays) {
    if (day < today && (last === null || day > last)) last = day;
  }
  if (last === null) return { freeze: [] };

  const gap = daysBetween(last, today) - 1;
  if (gap <= 1) return { freeze: [] };

  const frozen = new Set(frozenDays);
  const missed: string[] = [];
  for (let i = 1; i <= gap; i++) {
    const day = shiftDay(last, i);
    if (!frozen.has(day)) missed.push(day);
  }

  const needed = missed.length - 1;
  if (needed <= 0 || needed > banked) return { freeze: [] };
  // Keep the earliest missed day as the rest day; freeze the rest.
  return { freeze: missed.slice(1) };
}

/** Merges new frozen days into the stored list, de-duplicated, sorted, and bounded. */
export function mergeFrozenDays(existing: readonly string[], added: readonly string[]): string[] {
  const all = [...new Set([...existing, ...added])].sort();
  return all.slice(-FROZEN_DAYS_KEPT);
}

/**
 * Whether moving the streak from `previous` to `next` crosses a milestone that
 * earns a freeze. Only a genuine step up counts, so a second set on the same
 * day (streak unchanged) never pays twice.
 */
export function earnsFreeze(previous: number, next: number): boolean {
  if (next <= previous || next <= 0) return false;
  return Math.floor(next / FREEZE_EARN_EVERY) > Math.floor(previous / FREEZE_EARN_EVERY);
}

/** Days until the next freeze is earned, for the "next freeze in N days" hint. */
export function daysToNextFreeze(streak: number): number {
  const s = Math.max(0, Math.floor(streak));
  return FREEZE_EARN_EVERY - (s % FREEZE_EARN_EVERY);
}
