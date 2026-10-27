/**
 * "Do the math" on the paywall: the athlete picks how many days a week they
 * will train, and the real price of the selected plan is divided into what a
 * year of that looks like — sets, reps, and the price of one counted rep.
 *
 * Every figure comes from two honest inputs: the store's price and the
 * athlete's own answer (plus their own typical set size, when they have one).
 * Nothing is a "was" price or an invented comparison.
 *
 * Pure, so the arithmetic is checked by tests rather than trusted on sight.
 */

/** Set size assumed before the athlete has any history of their own. */
export const DEFAULT_REPS_PER_SET = 20;

const WEEKS_PER_YEAR = 52;

export interface RepMath {
  /** One set per training day, for a year. */
  setsPerYear: number;
  repsPerYear: number;
  /** The plan's price for a year, divided per rep. */
  perRep: number;
  perSet: number;
}

/**
 * The year at `daysPerWeek`, priced by the plan.
 *
 * `price` over `weeks` is the plan's own billing (52 annual, 4.345 monthly,
 * 1 weekly), scaled to a year so every plan is compared on the same year of
 * training. Null when there is no price to divide.
 */
export function repMath(input: {
  price: number;
  weeks: number;
  daysPerWeek: number;
  repsPerSet: number;
}): RepMath | null {
  if (!(input.price > 0) || !(input.weeks > 0)) return null;
  const days = clampDays(input.daysPerWeek);
  const reps = Math.max(1, Math.round(input.repsPerSet) || DEFAULT_REPS_PER_SET);
  const yearly = (input.price / input.weeks) * WEEKS_PER_YEAR;
  const setsPerYear = days * WEEKS_PER_YEAR;
  const repsPerYear = setsPerYear * reps;
  return { setsPerYear, repsPerYear, perRep: yearly / repsPerYear, perSet: yearly / setsPerYear };
}

/** Days a week, held to 1–7: it is the divisor, so it can never be 0. */
export function clampDays(daysPerWeek: number): number {
  const n = Math.round(daysPerWeek);
  if (!Number.isFinite(n)) return 3;
  return Math.min(7, Math.max(1, n));
}

/**
 * The athlete's own usual set: the median of their last twenty sets with reps.
 *
 * Median rather than mean, so one marathon set does not make every rep look
 * cheaper than it will be. Held to 5–200 so a stray 1-rep test set or a
 * miscount cannot swing the figure. Falls back to `DEFAULT_REPS_PER_SET`.
 */
export function typicalSetSize(sessions: readonly { reps: number }[]): number {
  const recent = sessions
    .filter((s) => s.reps > 0)
    .slice(-20)
    .map((s) => s.reps)
    .sort((a, b) => a - b);
  if (recent.length === 0) return DEFAULT_REPS_PER_SET;
  const mid = Math.floor(recent.length / 2);
  const median = recent.length % 2 ? recent[mid]! : (recent[mid - 1]! + recent[mid]!) / 2;
  return Math.min(200, Math.max(5, Math.round(median)));
}

/**
 * The price of one rep, readable: never "$0.00".
 *
 * Under one hundredth it reads as "under $0.01" (true, and simpler than a
 * long decimal); under a tenth it keeps three places so it is not rounded to
 * a misleading figure.
 */
export function formatPerRep(perRep: number, symbol: string): string {
  if (!(perRep > 0)) return '';
  if (perRep < 0.01) return `under ${symbol}0.01`;
  return `${symbol}${perRep.toFixed(perRep < 0.1 ? 3 : 2)}`;
}

/** One closing line under the figures. */
export function repMathVerdict(math: RepMath, symbol: string): string {
  if (math.perRep < 0.01) return `Less than ${symbol}0.01 for every rep counted and form-checked.`;
  return `${formatPerRep(math.perSet, symbol)} a workout, every rep counted and form-checked.`;
}
