/**
 * How a price is framed on the paywall.
 *
 * The honest kind of persuasion: every number here is derived from the real
 * price, and none of it overstates. Anchoring against a plan the athlete can
 * actually buy is fair; inventing a "was" price they were never charged is not,
 * and app stores treat that as a dark pattern.
 *
 * Pure, so the arithmetic is provable without a store or a device.
 */

export interface PlanPrice {
  /** Price in the store's currency, as a number. */
  price: number;
  /** Billing period in weeks — 52 annual, 4.345 monthly, 1 weekly. */
  weeks: number;
  /** Currency symbol pulled off the localised price string. */
  symbol: string;
}

/**
 * The smallest unit a price divides into cleanly.
 *
 * "£0.48 a week" lands very differently from "£24.99 a year" for the same
 * money. Daily is finer still, but below about 20p it starts to read as a
 * gimmick rather than a comparison, so weekly is the floor for cheap plans.
 */
export function granularPrice(plan: PlanPrice): string | null {
  if (!plan.price || !plan.weeks) return null;

  const perWeek = plan.price / plan.weeks;
  if (perWeek >= 1) {
    const perDay = perWeek / 7;
    if (perDay >= 0.2) return `${plan.symbol}${perDay.toFixed(2)} a day`;
  }
  return `${plan.symbol}${perWeek.toFixed(2)} a week`;
}

/**
 * What the annual plan saves against the most expensive alternative.
 *
 * Anchored on the dearest real plan, not an invented list price. Returns null
 * rather than 0% when there is nothing honest to claim — a "SAVE 0%" badge is
 * worse than no badge.
 */
export function savingsPercent(annual: PlanPrice, others: readonly PlanPrice[]): number | null {
  const annualPerWeek = annual.price / annual.weeks;
  if (!annualPerWeek) return null;

  const dearest = Math.max(
    0,
    ...others.map((p) => (p.weeks ? p.price / p.weeks : 0)).filter((n) => n > 0),
  );
  if (!dearest || annualPerWeek >= dearest) return null;

  const pct = Math.round((1 - annualPerWeek / dearest) * 100);
  return pct > 0 ? pct : null;
}

/**
 * A concrete comparison for the annual price.
 *
 * Abstract money is easy to refuse; money measured against something already
 * bought without thinking is harder. Deliberately modest examples — a coffee,
 * a single gym day-pass — because an inflated comparison invites the athlete to
 * argue with the claim instead of considering the offer.
 */
export function priceAnchor(plan: PlanPrice): string | null {
  if (!plan.price || !plan.weeks) return null;
  const perWeek = plan.price / plan.weeks;
  if (perWeek <= 0) return null;

  if (perWeek < 0.75) return 'Less than a coffee a month';
  if (perWeek < 1.5) return 'About one coffee a month';
  if (perWeek < 3) return 'Less than a gym day-pass a month';
  return null;
}

/**
 * The reassurance line under the CTA.
 *
 * Naming the exit reduces the risk of committing, which is why every serious
 * subscription app says it. It must stay true: only claim a trial when the plan
 * actually carries one.
 */
export function commitmentLine(hasTrial: boolean, trialLabel?: string | null): string {
  if (hasTrial && trialLabel) return `${trialLabel} free · Cancel anytime · No charge until it ends`;
  return 'Cancel anytime · Keep the free staples either way';
}
