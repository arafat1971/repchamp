/**
 * Whether — and how — to tell my partner about a drink I just logged.
 *
 * The old rule skipped the update whenever my partner had passed the
 * *default* 2 L, whatever their own goal — so once they drank 2 L they never
 * heard from me again. The partner's state no longer gates anything; what
 * matters is how worth telling this drink is:
 *
 * - crossing half of my goal, or all of it, is a milestone — always sent,
 *   from its own small bucket, because it happens at most twice a day;
 * - any other drink is a regular update, at most one per 90 minutes;
 * - nothing is sent when I don't share water, have switched updates off,
 *   or logged nothing.
 */

export type DrinkMilestone = 'half' | 'goal';

export function drinkMilestone(beforeMl: number, afterMl: number, goalMl: number): DrinkMilestone | null {
  if (!(goalMl > 0) || afterMl <= beforeMl) return null;
  if (beforeMl < goalMl && afterMl >= goalMl) return 'goal';
  const half = goalMl / 2;
  if (beforeMl < half && afterMl >= half) return 'half';
  return null;
}

export interface DrinkNoticePlan {
  milestone: DrinkMilestone | null;
  /** Which rate-limit bucket this spends. */
  limit: 'waterShare' | 'waterMilestone';
}

export function planDrinkNotice(input: {
  paired: boolean;
  sharingWater: boolean;
  drinkUpdates: boolean;
  ml: number;
  beforeMl: number;
  goalMl: number;
}): DrinkNoticePlan | null {
  if (!input.paired || !input.sharingWater || !input.drinkUpdates || !(input.ml > 0)) return null;
  const milestone = drinkMilestone(input.beforeMl, input.beforeMl + input.ml, input.goalMl);
  return { milestone, limit: milestone ? 'waterMilestone' : 'waterShare' };
}
