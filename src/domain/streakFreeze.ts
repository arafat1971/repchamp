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

import { calculateStreak } from './progression';
import { daysBetween } from './retention';

/** Most freezes a free athlete can hold at once. */
export const MAX_STREAK_FREEZES = 2;
/** Most freezes a Pro athlete can hold — a Pro perk, listed on the paywall. */
export const MAX_STREAK_FREEZES_PRO = 3;

/**
 * The bank's cap. A lapsed Pro keeps any freezes already over the free cap
 * (nothing earned is taken back); they just stop earning until below it.
 */
export function freezeCap(isPro: boolean): number {
  return isPro ? MAX_STREAK_FREEZES_PRO : MAX_STREAK_FREEZES;
}

/** Banked count after earning one, respecting the cap and never shrinking. */
export function bankAfterEarning(banked: number, cap: number): number {
  return Math.max(banked, Math.min(cap, banked + 1));
}
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

/**
 * What happens to the streak if today passes with no set.
 *
 * - `safe`: it only uses the rest day, nothing spent.
 * - `freeze`: banked freezes cover it; the streak survives but a freeze goes.
 * - `lost`: nothing can cover it; the streak ends with today.
 * - `none`: there is no live streak, or today is already trained.
 *
 * Asked by simulating tomorrow, the first day today's gap is judged on, with
 * the same planner the app runs on open — so the reminder and the save agree.
 */
export type SkipTodayOutcome = 'safe' | 'freeze' | 'lost' | 'none';

export function skipTodayOutcome(input: {
  trainedDays: readonly string[];
  frozenDays: readonly string[];
  banked: number;
  today: string;
}): SkipTodayOutcome {
  const { trainedDays, frozenDays, banked, today } = input;
  if (trainedDays.includes(today)) return 'none';
  if (calculateStreak(trainedDays, today, frozenDays) === 0) return 'none';

  const tomorrow = shiftDay(today, 1);
  const plan = planStreakFreezes({ trainedDays, frozenDays, banked, today: tomorrow });
  if (plan.freeze.length > 0) return 'freeze';
  return calculateStreak(trainedDays, tomorrow, frozenDays) > 0 ? 'safe' : 'lost';
}

/** The words on the recap's freeze card, kept here so they stay testable. */
export function freezePanelCopy(input: {
  banked: number;
  streak: number;
  isPro: boolean;
}): { title: string; body: string } {
  const cap = freezeCap(input.isPro);
  const banked = Math.max(0, Math.floor(input.banked));
  const title =
    banked === 0 ? 'No freezes banked' : `${banked} ${banked === 1 ? 'freeze' : 'freezes'} banked`;
  const what = 'A freeze covers a missed day after your rest day, so the streak survives.';
  if (banked >= cap) return { title, body: `${what} Your bank is full.` };
  const days = daysToNextFreeze(input.streak);
  return {
    title,
    body: `${what} Next one in ${days} ${days === 1 ? 'day' : 'days'} of training in a row.`,
  };
}

/* ------------------------------------------------------------------ *
 * Streak repair — a Pro perk for a streak that broke anyway
 * ------------------------------------------------------------------ */

/** Unfrozen missed days a streak can be repaired across, rest day included. */
export const REPAIR_MAX_MISSED = 4;
/** Shorter streaks are not worth a repair prompt — the same bar reminders use. */
export const REPAIR_MIN_STREAK = 3;
/** One repair per this many days, so a repair rescues a bad week, not a habit of skipping. */
export const REPAIR_COOLDOWN_DAYS = 30;

export interface StreakRepairOffer {
  /** The streak as it stood on the last trained day. */
  lostStreak: number;
  /** The last trained day before the break; identifies this break for dismissal. */
  lastTrained: string;
  /** Missed days a repair marks frozen — every one but the rest day. */
  freeze: string[];
}

/**
 * Whether a streak just broke and can still be repaired.
 *
 * Judged on the gap before today (a set today after a break still restarts at
 * 1, and a repair reconnects it). Null when nothing broke, when the break is
 * too old or the streak too short to be worth it, or inside the cooldown.
 * Automatic freezes run first, so an offer only appears when the bank could
 * not cover the gap.
 */
export function streakRepairOffer(input: {
  trainedDays: readonly string[];
  frozenDays: readonly string[];
  today: string;
  lastRepairDay: string | null;
}): StreakRepairOffer | null {
  const { trainedDays, frozenDays, today, lastRepairDay } = input;
  if (lastRepairDay && daysBetween(lastRepairDay, today) < REPAIR_COOLDOWN_DAYS) return null;

  let last: string | null = null;
  for (const day of trainedDays) {
    if (day < today && (last === null || day > last)) last = day;
  }
  if (last === null) return null;

  const frozen = new Set(frozenDays);
  const missed: string[] = [];
  const gap = daysBetween(last, today) - 1;
  for (let i = 1; i <= gap; i++) {
    const day = shiftDay(last, i);
    if (!frozen.has(day)) missed.push(day);
  }
  // One missed day is the rest day: nothing broke.
  if (missed.length < 2 || missed.length > REPAIR_MAX_MISSED) return null;

  const lostStreak = calculateStreak(trainedDays.filter((d) => d <= last), last, frozenDays);
  if (lostStreak < REPAIR_MIN_STREAK) return null;

  return { lostStreak, lastTrained: last, freeze: missed.slice(1) };
}
