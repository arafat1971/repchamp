/**
 * When to offer a monthly subscriber the annual plan.
 *
 * A monthly subscriber pays more per month for the same product and churns far
 * faster than an annual one. Moving them is the cheapest revenue there is: no
 * acquisition cost, and the athlete genuinely pays less. That last part is why
 * this is honest — it is only ever offered when annual really is cheaper, and
 * the saving shown is the plain difference between two prices they can both buy.
 *
 * ## When it speaks
 *
 * - Only a paying monthly plan: not a trial (they have not decided yet), not a
 *   plan already cancelled (`willRenew` false — pitching a leaver reads as a
 *   trap), not annual or lifetime.
 * - Only after they have been charged once and actually used the app. "Save
 *   £X" to someone who has not trained in a month is an invitation to cancel
 *   instead. The usage gate is what makes the offer read as a good deal for a
 *   person who keeps the habit, rather than a retention trick.
 * - Rationed: a month between looks, two months after a "not now", three
 *   offers in a lifetime.
 *
 * Pure and store-free, so the whole policy is provable in a test.
 */

import { yearComparison, type PlanPrice, type YearComparison } from './paywallFraming';

export interface ActiveSubscription {
  /** RevenueCat package type of the plan they are on, e.g. `MONTHLY`. */
  packageType: string;
  /** RevenueCat `periodType`: `NORMAL`, `TRIAL` or `INTRO`. */
  periodType: string;
  willRenew: boolean;
  /** Epoch ms of the latest charge. */
  latestPurchaseAt: number;
  /** Epoch ms the entitlement first started. */
  originalPurchaseAt: number;
}

export interface UpgradeOfferRecord {
  at: number;
  outcome: 'shown' | 'tapped' | 'dismissed';
}

export interface AnnualUpgradeInput {
  active: ActiveSubscription | null;
  monthly: PlanPrice | null;
  annual: PlanPrice | null;
  /** Training sessions in the last 30 days. */
  sessionsLast30Days: number;
  /** Newest first. */
  history: readonly UpgradeOfferRecord[];
  now: number;
}

const DAY_MS = 86_400_000;

/** Days on the plan before the first look — long enough to have been charged. */
export const MIN_DAYS_SUBSCRIBED = 21;
/** Sets in the last 30 days that show the habit is real. */
export const MIN_SESSIONS_FOR_UPGRADE = 6;
export const REOFFER_DAYS = 30;
export const REOFFER_AFTER_DISMISS_DAYS = 60;
export const MAX_UPGRADE_OFFERS = 3;

export interface AnnualUpgradeOffer {
  comparison: YearComparison;
  headline: string;
  body: string;
  cta: string;
}

export function annualUpgradeOffer(input: AnnualUpgradeInput): AnnualUpgradeOffer | null {
  const { active, monthly, annual, now } = input;
  if (!active || !monthly || !annual) return null;

  if (active.packageType !== 'MONTHLY') return null;
  if (active.periodType !== 'NORMAL' || !active.willRenew) return null;
  if ((now - active.originalPurchaseAt) / DAY_MS < MIN_DAYS_SUBSCRIBED) return null;
  if (input.sessionsLast30Days < MIN_SESSIONS_FOR_UPGRADE) return null;

  if (input.history.length >= MAX_UPGRADE_OFFERS) return null;
  const last = input.history[0];
  if (last) {
    const gap = (now - last.at) / DAY_MS;
    const needed = last.outcome === 'dismissed' ? REOFFER_AFTER_DISMISS_DAYS : REOFFER_DAYS;
    if (gap < needed) return null;
  }

  const comparison = yearComparison(monthly, annual);
  if (!comparison) return null;

  return {
    comparison,
    headline: `Save ${comparison.saved} a year`,
    body: `You've trained ${input.sessionsLast30Days} times this month. Twelve months on monthly is ${comparison.monthlyYear}; annual is ${comparison.annualYear}. Same Pro, switch any time.`,
    cta: 'Switch to annual',
  };
}

/**
 * Which package type a product id belongs to, given the offering's packages.
 *
 * Play reports a subscription as `product:basePlan`, the offering lists the same
 * subscription under either spelling, so an exact match and a match on the
 * part before the colon both count.
 */
export function packageTypeForProduct(
  productId: string,
  packages: readonly { productId: string; packageType: string }[],
): string | null {
  const base = productId.split(':')[0];
  const hit =
    packages.find((p) => p.productId === productId) ??
    packages.find((p) => p.productId.split(':')[0] === base);
  return hit?.packageType ?? null;
}
