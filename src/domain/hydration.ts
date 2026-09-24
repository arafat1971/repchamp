/**
 * Daily water intake.
 *
 * Stored as an append-only log of drinks rather than a running total per day,
 * matching how `sessions` works in the profile store. Three things fall out of
 * that choice and none of them are free the other way:
 *
 *   - Midnight needs no code. A day's intake is a filter over entries carrying
 *     a `day` key, so the number "resets" because `day !== dayKey()`, not
 *     because anything cleared it. There is no timer to get wrong.
 *   - Undo is removing an entry. A `{ day, ml }` counter has to remember the
 *     size of the last drink to undo it — which is a log with one entry of
 *     history, arrived at awkwardly.
 *   - A week of history is already there when something wants to show it.
 *
 * Undo removes rather than appending a negative entry, so `ml` can stay
 * validated as positive and a day's total can never go below zero.
 *
 * Every function takes `today` as a day key rather than reading the clock, so
 * a caller stays timezone-consistent with `dayKey()` and results are provable
 * in a test.
 */

import { dayKey, lastNDayKeys } from '@/domain/progression';

/** One logged drink. Append-only; a day's intake is the sum of its entries. */
export interface DrinkEntry {
  id: string;
  /** Millilitres. Always positive — see the note on undo above. */
  ml: number;
  /** ISO timestamp, for ordering within a day. */
  at: string;
  /** `YYYY-MM-DD` local, from `dayKey()` at the moment it was logged. */
  day: string;
  /** What it was (see `drinkKinds`); absent on entries logged before kinds, which are water. */
  kind?: string;
}

/** The three one-tap sizes on the card: a glass, a bottle, a large bottle. */
export const DRINK_SIZES_ML = [250, 500, 750] as const;

export const DEFAULT_DAILY_GOAL_ML = 2000;
export const MIN_DAILY_GOAL_ML = 500;
export const MAX_DAILY_GOAL_ML = 6000;

/** One tap cannot log more than this — a fat-fingered 20 L is not a drink. */
export const MAX_DRINK_ML = 2000;

/**
 * Ceiling on a single day's total.
 *
 * Also duplicated in `firestore.rules` (`dailyInSaneRange`), which cannot
 * import TypeScript. `firestore-rules/couples.test.ts` asserts the two agree,
 * so raising it here without touching the rules fails a test rather than
 * silently letting the guard drift.
 */
export const MAX_DAILY_ML = 20000;

/** Matches the 500-session cap in the profile store. */
export const DRINK_LOG_LIMIT = 500;

const GOAL_STEP_ML = 250;

/**
 * A logged amount, or 0 when it is not a drink at all.
 *
 * Returns 0 rather than throwing or clamping up: a rejected tap should record
 * nothing, and clamping a garbage value into a real one would log water the
 * athlete never drank.
 */
export function sanitizeDrinkMl(ml: number): number {
  if (!Number.isFinite(ml)) return 0;
  const rounded = Math.round(ml);
  if (rounded <= 0 || rounded > MAX_DRINK_ML) return 0;
  return rounded;
}

/** A goal inside the allowed band. Garbage falls back to the default. */
export function sanitizeGoalMl(ml: number): number {
  if (!Number.isFinite(ml)) return DEFAULT_DAILY_GOAL_ML;
  const rounded = Math.round(ml);
  return Math.min(MAX_DAILY_GOAL_ML, Math.max(MIN_DAILY_GOAL_ML, rounded));
}

/** The next goal up or down, a quarter-litre at a time, clamped to the band. */
export function stepGoalMl(goalMl: number, direction: 1 | -1): number {
  return sanitizeGoalMl(sanitizeGoalMl(goalMl) + direction * GOAL_STEP_ML);
}

/** Total millilitres logged on one day. */
export function mlOnDay(drinks: readonly DrinkEntry[], day: string): number {
  let total = 0;
  for (const d of drinks) if (d.day === day) total += d.ml;
  return total;
}

/** One day's drinks, newest first — the order the log itself is kept in. */
export function drinksOnDay(drinks: readonly DrinkEntry[], day: string): DrinkEntry[] {
  return drinks.filter((d) => d.day === day);
}

export interface HydrationProgress {
  ml: number;
  goalMl: number;
  /** 0–100, already clamped. `ProgressBar` takes a percent, not a fraction. */
  percent: number;
  /** Millilitres still to drink; 0 once the goal is met, never negative. */
  remainingMl: number;
  met: boolean;
}

/** Today's intake measured against the goal. */
export function hydrationProgress(
  drinks: readonly DrinkEntry[],
  goalMl: number,
  day: string,
): HydrationProgress {
  const goal = sanitizeGoalMl(goalMl);
  const ml = mlOnDay(drinks, day);
  return {
    ml,
    goalMl: goal,
    percent: Math.min(100, Math.round((ml / goal) * 100)),
    remainingMl: Math.max(0, goal - ml),
    met: ml >= goal,
  };
}

/**
 * The last `n` days including today, oldest first.
 *
 * Days with nothing logged are present with `ml: 0` rather than omitted — a
 * sparkline needs the gaps to be visible as gaps.
 */
export function hydrationHistory(
  drinks: readonly DrinkEntry[],
  today: string,
  n: number,
): { day: string; ml: number }[] {
  if (n <= 0) return [];
  /* `lastNDayKeys` walks back from a Date. Anchor at noon so a DST shift
     cannot move the date, the same trick `coupleTracker` uses. */
  const anchor = new Date(`${today}T12:00:00`);
  return lastNDayKeys(n, anchor).map((day) => ({ day, ml: mlOnDay(drinks, day) }));
}

/** How many of the last `n` days reached the goal. */
export function daysGoalMet(
  drinks: readonly DrinkEntry[],
  goalMl: number,
  today: string,
  n: number,
): number {
  const goal = sanitizeGoalMl(goalMl);
  return hydrationHistory(drinks, today, n).filter((d) => d.ml >= goal).length;
}

/**
 * A readable amount: litres once there is a litre to speak of.
 *
 * "1.25 L" rather than "1250 ml" because the goal is expressed in litres in
 * every other context an athlete meets it, and trailing zeroes are dropped so
 * a round two litres reads "2 L" and not "2.00 L".
 */
export function formatMl(ml: number): string {
  if (!Number.isFinite(ml) || ml <= 0) return '0 ml';
  const rounded = Math.round(ml);
  if (rounded < 1000) return `${rounded} ml`;
  const litres = rounded / 1000;
  return `${Number(litres.toFixed(2))} L`;
}

/**
 * Whether a day key describes the day in question.
 *
 * Used on the partner's synced total: their phone stamps the day it wrote, and
 * without this check a phone that last synced yesterday would have its total
 * read as today's.
 */
export function isFreshFor(day: string | null | undefined, today: string): boolean {
  return typeof day === 'string' && day === today;
}

/** Mint an entry for `ml` at `at`. The store owns rejection; this owns shape. */
export function makeDrinkEntry(ml: number, at: Date = new Date(), kind?: string): DrinkEntry {
  return {
    id: `${at.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    ml,
    at: at.toISOString(),
    day: dayKey(at),
    ...(kind && kind !== 'water' ? { kind } : {}),
  };
}
