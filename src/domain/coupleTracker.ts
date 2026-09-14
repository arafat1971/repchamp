/**
 * The couple tracker — history, contribution and weekly pace for a paired bond.
 *
 * Everything here is *derived* from `trainedDays` and `totalReps`, which the
 * couple doc already carries and both partners already write. That is a
 * deliberate constraint rather than a limitation: `couples/{id}` is governed by
 * some of the tightest rules in `firestore.rules` — each athlete may mutate only
 * their own member slice, key sets are capped with `hasOnly`, and a joiner may
 * not touch a byte of their partner's stats. Adding a stored weekly goal would
 * mean widening that surface for a number two people can disagree about, so the
 * pace target is a *local* input the UI supplies and this module reasons about.
 *
 * Pure and synchronous like `couple.ts` and `progression.ts`, so the screen and
 * the tests share one source of truth and none of it needs a device to prove.
 */

import type { Couple, CoupleMember } from './couple';
import { calculateCoupleStreak, partnerOf, memberOf } from './couple';
import { dayKey, lastNDayKeys } from './progression';

/* ------------------------------------------------------------------ *
 * Shared history
 * ------------------------------------------------------------------ */

/** Who trained on one calendar day. */
export type DayStatus = 'both' | 'mine' | 'theirs' | 'neither';

export interface TrackerDay {
  /** ISO `YYYY-MM-DD`. */
  day: string;
  status: DayStatus;
  /** True for the day the calendar is being rendered "today" against. */
  isToday: boolean;
  /**
   * True when the day is in the future — only possible on the trailing edge of
   * the current week, which the grid still renders so the week keeps its shape.
   */
  isFuture: boolean;
}

/**
 * The last `days` calendar days, oldest first, labelled with who trained.
 *
 * `both` is the only status that advances the shared streak, which is why it is
 * the one the UI should make unmistakable — the rule the whole mode rests on is
 * "neither of us wants to be the one who broke it", and it is only legible if
 * you can see the days you each carried.
 */
export function trackerHistory(
  couple: Couple | null,
  viewerUid: string,
  today: string,
  days = 28,
): TrackerDay[] {
  const me = couple ? memberOf(couple, viewerUid) : null;
  const partner = couple ? partnerOf(couple, viewerUid) : null;
  const mine = new Set(me?.trainedDays ?? []);
  const theirs = new Set(partner?.trainedDays ?? []);

  // Anchor on `today` rather than the wall clock so the caller stays in control
  // and the whole module is testable without faking time.
  const anchor = new Date(`${today}T12:00:00`);
  return lastNDayKeys(days, anchor).map((day) => {
    const iDid = mine.has(day);
    const theyDid = theirs.has(day);
    const status: DayStatus = iDid && theyDid ? 'both' : iDid ? 'mine' : theyDid ? 'theirs' : 'neither';
    return { day, status, isToday: day === today, isFuture: day > today };
  });
}

/** How many of the given days both partners trained. */
export function daysBothTrained(history: readonly TrackerDay[]): number {
  return history.filter((d) => d.status === 'both').length;
}

/* ------------------------------------------------------------------ *
 * Weekly pace
 * ------------------------------------------------------------------ */

export interface WeeklyPace {
  /** Days *this week* that both partners trained — the shared-streak currency. */
  bothDays: number;
  /** The target, echoed back so the UI never has to hold it twice. */
  goal: number;
  /** 0..1, clamped — safe to hand straight to a progress bar width. */
  progress: number;
  /** True once the couple has hit the target this week. */
  met: boolean;
  /** Days left in the week, today included. Zero on the last day once met. */
  daysLeft: number;
  /**
   * True when the goal is still reachable but only if they train *every*
   * remaining day. The honest "it's tight" state — distinct from `met` and from
   * out-of-reach, both of which call for different copy.
   */
  mustTrainDaily: boolean;
  /** True when there are no longer enough days left to reach the goal. */
  outOfReach: boolean;
}

/**
 * Progress against a weekly shared-training target.
 *
 * The week is the rolling last 7 days ending today, matching `lastNDayKeys` and
 * the existing home week row — not a Monday-anchored calendar week. A rolling
 * window is what makes the number move on the day someone actually trains,
 * rather than resetting under them on an arbitrary morning.
 */
export function weeklyPace(
  couple: Couple | null,
  viewerUid: string,
  today: string,
  goal: number,
): WeeklyPace {
  const safeGoal = Math.max(1, Math.floor(goal));
  const week = trackerHistory(couple, viewerUid, today, 7);
  const bothDays = daysBothTrained(week);

  // The rolling week ends today, so "days left" is about the goal still being
  // catchable within a fresh 7-day span, not about a calendar boundary.
  const trainedToday = week[week.length - 1]?.status === 'both';
  const daysLeft = trainedToday ? 0 : 1;

  const met = bothDays >= safeGoal;
  const shortfall = Math.max(0, safeGoal - bothDays);

  return {
    bothDays,
    goal: safeGoal,
    progress: Math.min(1, Math.max(0, bothDays / safeGoal)),
    met,
    daysLeft,
    mustTrainDaily: !met && shortfall > 0 && shortfall >= daysLeft && daysLeft > 0,
    outOfReach: !met && shortfall > daysLeft,
  };
}

/* ------------------------------------------------------------------ *
 * Contribution
 * ------------------------------------------------------------------ */

export interface Contribution {
  uid: string;
  displayName: string;
  reps: number;
  /** Share of the combined total, 0..1. Both are 0.5 when the total is zero. */
  share: number;
  /** Days this member trained within the window the caller asked about. */
  activeDays: number;
}

export interface ContributionSplit {
  mine: Contribution;
  theirs: Contribution;
  combined: number;
  /**
   * True when the split is close enough to call even. Deliberately generous —
   * this is a couples feature, and a screen that declares a "winner" between
   * two people training together every day is working against the product.
   */
  balanced: boolean;
}

/** How much each partner put in — reps all-time, active days in the window. */
export function contributionSplit(
  couple: Couple | null,
  viewerUid: string,
  today: string,
  windowDays = 28,
): ContributionSplit | null {
  if (!couple) return null;
  const me = memberOf(couple, viewerUid);
  const partner = partnerOf(couple, viewerUid);
  if (!me || !partner) return null;

  const history = trackerHistory(couple, viewerUid, today, windowDays);
  const myActive = history.filter((d) => d.status === 'both' || d.status === 'mine').length;
  const theirActive = history.filter((d) => d.status === 'both' || d.status === 'theirs').length;

  const combined = me.totalReps + partner.totalReps;
  const myShare = combined === 0 ? 0.5 : me.totalReps / combined;

  return {
    mine: toContribution(me, myShare, myActive),
    theirs: toContribution(partner, 1 - myShare, theirActive),
    combined,
    // Within 10 points of even. Below that the UI says "in step" rather than
    // naming who is ahead.
    balanced: Math.abs(myShare - 0.5) <= 0.1,
  };
}

function toContribution(member: CoupleMember, share: number, activeDays: number): Contribution {
  return {
    uid: member.uid,
    displayName: member.displayName?.trim() || 'Athlete',
    reps: member.totalReps,
    share,
    activeDays,
  };
}

/* ------------------------------------------------------------------ *
 * Headline summary
 * ------------------------------------------------------------------ */

export interface TrackerSummary {
  streak: number;
  /** Days both trained, over the full history window. */
  bothDays: number;
  /** Longest run of consecutive `both` days in the window. */
  bestRun: number;
  /** 0..1 — share of window days the couple trained together. */
  consistency: number;
}

/**
 * The four numbers worth putting at the top of the tracker.
 *
 * `bestRun` is measured strictly — consecutive `both` days with no tolerance —
 * unlike `calculateCoupleStreak`, which forgives a single rest day. They answer
 * different questions: the streak is what you can lose today, the best run is
 * what you once did. Showing a "best" that quietly forgave gaps would make the
 * live streak look worse than the record it is compared against.
 */
export function trackerSummary(
  couple: Couple | null,
  viewerUid: string,
  today: string,
  windowDays = 28,
): TrackerSummary {
  const history = trackerHistory(couple, viewerUid, today, windowDays);
  const past = history.filter((d) => !d.isFuture);
  const bothDays = daysBothTrained(past);

  let bestRun = 0;
  let run = 0;
  for (const day of past) {
    if (day.status === 'both') {
      run += 1;
      bestRun = Math.max(bestRun, run);
    } else {
      run = 0;
    }
  }

  return {
    streak: couple ? calculateCoupleStreak(couple, today) : 0,
    bothDays,
    bestRun,
    consistency: past.length === 0 ? 0 : bothDays / past.length,
  };
}

/** Convenience for callers that only have a `Date`. */
export function todayKey(date: Date = new Date()): string {
  return dayKey(date);
}
