/**
 * Streak freezes for the couple's shared streak.
 *
 * The shared streak only counts days BOTH partners trained, so it breaks far
 * more often than either personal streak: one partner's sick day is enough.
 * Losing a long shared streak is the moment a pair stops training together,
 * so the couple gets its own bank, shared by both, with the same rules as the
 * personal one (`streakFreeze.ts`): one to start, one more for every 7-day
 * milestone, a small cap, and spent automatically only when it saves the
 * streak.
 *
 * Either phone may apply the plan. It is a pure function of the document, so
 * both partners running it inside a transaction converge on the same result
 * and a freeze is never spent twice.
 */

import { bothTrainedDays, isPaired, type Couple, type CoupleFreezeBank } from './couple';
import { calculateStreak } from './progression';
import {
  FREEZE_EARN_EVERY,
  MAX_STREAK_FREEZES,
  STARTER_STREAK_FREEZES,
  planStreakFreezes,
  shiftDay,
  skipTodayOutcome,
  type SkipTodayOutcome,
} from './streakFreeze';

/**
 * The shared bank's cap. Couple mode is a Pro feature for both partners, but
 * the bank is shared, so it holds the free cap: two people get one bank.
 */
export const COUPLE_FREEZE_CAP = MAX_STREAK_FREEZES;
/** Frozen days kept on the document. Bounded so the doc cannot grow forever. */
export const COUPLE_FROZEN_DAYS_KEPT = 60;

/** The bank as stored, or the starter bank for a couple that has none yet. */
export function coupleFreezeBank(couple: Couple): CoupleFreezeBank {
  const f = couple.freeze;
  if (!f || typeof f !== 'object') {
    return { banked: STARTER_STREAK_FREEZES, frozenDays: [], lastEarnedDay: null };
  }
  const banked = Number.isFinite(f.banked) ? Math.max(0, Math.min(COUPLE_FREEZE_CAP, Math.floor(f.banked))) : 0;
  const frozenDays = Array.isArray(f.frozenDays) ? f.frozenDays.filter((d) => typeof d === 'string') : [];
  return { banked, frozenDays, lastEarnedDay: typeof f.lastEarnedDay === 'string' ? f.lastEarnedDay : null };
}

/**
 * The bank after today's bookkeeping, or null when nothing changes.
 *
 * Two steps, in order:
 * 1. Earn: if the latest both-trained day completed a 7-day milestone that has
 *    not paid yet, bank one. Judged on that day rather than today, so a pair
 *    who finished day 7 late at night with neither phone open still earns it.
 * 2. Spend: cover the gap before today if the bank can save the streak.
 */
export function planCoupleFreeze(couple: Couple, today: string): CoupleFreezeBank | null {
  if (!isPaired(couple)) return null;
  const stored = couple.freeze;
  const bank = coupleFreezeBank(couple);
  const days = bothTrainedDays(couple);
  let { banked, frozenDays, lastEarnedDay } = bank;
  let changed = !stored;

  let latest: string | null = null;
  for (const d of days) if (d <= today && (latest === null || d > latest)) latest = d;
  if (latest && (lastEarnedDay ?? '') < latest) {
    const streakThen = calculateStreak(days.filter((d) => d <= latest), latest, frozenDays);
    if (streakThen > 0 && streakThen % FREEZE_EARN_EVERY === 0) {
      lastEarnedDay = latest;
      if (banked < COUPLE_FREEZE_CAP) banked += 1;
      changed = true;
    }
  }

  const plan = planStreakFreezes({ trainedDays: days, frozenDays, banked, today });
  if (plan.freeze.length > 0) {
    banked -= plan.freeze.length;
    frozenDays = [...new Set([...frozenDays, ...plan.freeze])].sort().slice(-COUPLE_FROZEN_DAYS_KEPT);
    changed = true;
  }

  return changed ? { banked, frozenDays, lastEarnedDay: lastEarnedDay ?? null } : null;
}

/** What skipping today does to the shared streak, for the couple reminder. */
export function coupleSkipTodayOutcome(couple: Couple, today: string): SkipTodayOutcome {
  if (!isPaired(couple)) return 'none';
  const bank = coupleFreezeBank(couple);
  return skipTodayOutcome({
    trainedDays: bothTrainedDays(couple),
    frozenDays: bank.frozenDays,
    banked: bank.banked,
    today,
  });
}

/** How far back a shared-freeze save is still news worth a Home card. */
const SAVE_NEWS_DAYS = 3;

export interface CoupleFreezeSave {
  /** The newest frozen day; identifies this save so a dismissal sticks. */
  day: string;
  /** Freezes the save spent. */
  used: number;
}

/**
 * The shared freeze's latest save, while it is still news.
 *
 * Derived from the document rather than recorded by whichever phone spent it,
 * so both partners see it: the partner who wasn't the one to open the app
 * learns their streak was saved too.
 */
export function coupleFreezeSave(couple: Couple, today: string): CoupleFreezeSave | null {
  if (!isPaired(couple)) return null;
  const { frozenDays } = coupleFreezeBank(couple);
  const day = frozenDays.filter((d) => d < today).sort().at(-1);
  if (!day || day < shiftDay(today, -SAVE_NEWS_DAYS)) return null;

  let lastTrained = '';
  for (const d of bothTrainedDays(couple)) if (d < day && d > lastTrained) lastTrained = d;
  const used = frozenDays.filter((d) => d > lastTrained && d <= day).length;
  return { day, used: Math.max(1, used) };
}

/** The couple streak reminder, worded for what skipping today really costs. */
export function coupleStreakReminderCopy(input: {
  partnerName: string;
  streak: number;
  ifSkipped: SkipTodayOutcome | null;
}): { title: string; body: string } {
  const { partnerName, streak, ifSkipped } = input;
  const run = streak > 0 ? `${streak}-day ` : '';
  if (ifSkipped === 'freeze') {
    return {
      title: `Day ${streak + 1} together — save your freeze`,
      body: `Skip today and your shared freeze covers it. Train with ${partnerName} and keep it banked.`,
    };
  }
  if (ifSkipped === 'safe') {
    return {
      title: 'Keep the shared streak climbing',
      body: `Your ${run}streak with ${partnerName} has its rest day, but a set from you both today adds a day.`,
    };
  }
  return {
    title: 'Shared streak needs you',
    body: `You and ${partnerName} both need a set today to keep your ${run}streak alive.`,
  };
}
