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
  return 'Cancel anytime in Google Play · Couple mode stays free either way';
}

/**
 * The monthly-equivalent headline for a plan, and the charge behind it.
 *
 * An annual plan billed once is hard to compare against a monthly one: "$60"
 * and "$10" are not the same unit, and the athlete has to do the division
 * themselves to see that the yearly plan is half the price. Most of them will
 * not, so the cheaper plan reads as the expensive one.
 *
 * Leading with the monthly rate puts both plans in the same unit — "$5 / month"
 * beside "$10 / month" — and keeps the real charge directly underneath, because
 * the athlete is about to be billed $60 and finding that out at the store sheet
 * instead of here is the kind of surprise that produces a refund and a
 * one-star review.
 *
 * Returns null for a plan with no sensible monthly reading: a weekly plan is
 * already granular, and a lifetime purchase is not a rate at all. The caller
 * falls back to the plain price for those.
 */
export interface MonthlyEquivalent {
  /** The headline — what a month of this plan costs, e.g. "$5". */
  perMonth: string;
  /** The charge that actually lands, e.g. "paid $60 annually". */
  billedAs: string;
}

export function monthlyEquivalent(
  plan: PlanPrice,
  priceString: string,
  packageType: string,
): MonthlyEquivalent | null {
  if (!plan.price || !plan.weeks) return null;
  /* Only plans billed less often than monthly gain anything from this. A
     monthly plan already *is* its own rate, and restating it would add a line
     that says the same thing twice. */
  if (plan.weeks < 8) return null;

  /* Months from weeks directly — 52/12, not 52/4.345. The weekly constant is a
     rounded average, and routing an annual price through it turns $60 a year
     into "$5.01 a month": an arithmetic artefact that reads as a suspiciously
     precise price and is, strictly, not what a twelfth of the charge is. */
  const months = Math.round((plan.weeks / 52) * 12);
  if (months < 2) return null;

  const perMonth = plan.price / months;
  if (!Number.isFinite(perMonth) || perMonth <= 0) return null;

  /* Two decimals unless the rate is clean — "$5 / month" reads better than
     "$5.00 / month", and a rounded-looking price should not be shown rounder
     than it is. */
  const rounded = Math.round(perMonth * 100) / 100;
  const formatted = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);

  const cadence = packageType === 'ANNUAL' ? 'annually' : `every ${Math.round(months)} months`;

  return {
    perMonth: `${plan.symbol}${formatted}`,
    billedAs: `paid ${priceString} ${cadence}`,
  };
}

/* ---------------------------------------------------------------------------
 * "How little is this, really?"
 *
 * The same price in the units a person actually spends in: a day, a workout,
 * a month. All derived from the real store price and the athlete's own
 * training history — nothing invented, no fake "was" price, no scarcity.
 * ------------------------------------------------------------------------- */

const money = (plan: PlanPrice, n: number) => `${plan.symbol}${n.toFixed(2)}`;

/** What one month of the plan costs, as a number. Null for a plan with no rate. */
export function monthlyCost(plan: PlanPrice): number | null {
  if (!plan.price || !plan.weeks) return null;
  const months = (plan.weeks / 52) * 12;
  // The monthly constant (4.345 weeks) is a rounded average: a monthly plan
  // is exactly one month, not 0.2% less of one.
  const exact = Math.abs(months - 1) < 0.02 ? 1 : months;
  return plan.price / exact;
}

/** The price per day — the smallest honest unit — e.g. "$0.16". */
export function perDayPrice(plan: PlanPrice): string | null {
  if (!plan.price || !plan.weeks) return null;
  const perDay = plan.price / (plan.weeks * 7);
  return perDay >= 0.01 ? money(plan, perDay) : null;
}

/**
 * What a workout costs at this athlete's own pace.
 *
 * Needs a few real workouts to mean anything: one session a month would make
 * the sum look worse, and two would be a guess. Returns null below `MIN_WORKOUTS`.
 */
export const MIN_WORKOUTS_FOR_COST = 3;
export function costPerWorkout(plan: PlanPrice, workoutsLast30Days: number): string | null {
  const month = monthlyCost(plan);
  if (month == null || workoutsLast30Days < MIN_WORKOUTS_FOR_COST) return null;
  const each = month / workoutsLast30Days;
  return each >= 0.01 ? money(plan, each) : null;
}

export interface YearComparison {
  /** Twelve monthly payments. */
  monthlyYear: string;
  /** One annual payment. */
  annualYear: string;
  /** What the annual plan keeps in the athlete's pocket. */
  saved: string;
}

/**
 * Twelve months on the monthly plan against one annual payment — both real,
 * both buyable. Null unless the annual plan is genuinely cheaper.
 */
export function yearComparison(monthly: PlanPrice, annual: PlanPrice): YearComparison | null {
  const month = monthlyCost(monthly);
  if (month == null || !annual.price) return null;
  const monthlyYear = month * 12;
  if (annual.price >= monthlyYear) return null;
  return {
    monthlyYear: money(monthly, monthlyYear),
    annualYear: money(annual, annual.price),
    saved: money(annual, monthlyYear - annual.price),
  };
}
