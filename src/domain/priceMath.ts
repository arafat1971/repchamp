/**
 * The arithmetic behind "why does it cost this?" — pure, so every figure the
 * onboarding shows next to a price is one a test has checked.
 *
 * Nothing here invents a number. It divides the real price of the real plan by
 * a real count (days in a year, sessions the athlete said they would train),
 * so the comparison is the athlete's own commitment divided into a bill they
 * are about to see anyway. No fake discounts, no invented "normal price", no
 * made-up comparison to another product.
 */

/** Price of a yearly plan, per calendar day. */
export function perDay(yearlyAmount: number): number {
  return yearlyAmount / 365;
}

/**
 * Price of a yearly plan, per session, at the pace the athlete chose.
 *
 * `daysPerWeek` is clamped to 1–7: it came from a slider, but this is the one
 * place a division by it could produce Infinity.
 */
export function perSession(yearlyAmount: number, daysPerWeek: number): number {
  const days = Math.min(7, Math.max(1, Math.round(daysPerWeek)));
  return yearlyAmount / (days * 52);
}

/**
 * How much cheaper the yearly plan is than twelve months of the monthly one,
 * as a whole percent. 0 when yearly is not actually cheaper, so the screen
 * never claims a saving that is not there.
 */
export function yearlySavingPercent(monthlyAmount: number, yearlyAmount: number): number {
  if (!(monthlyAmount > 0) || !(yearlyAmount > 0)) return 0;
  const saving = 1 - yearlyAmount / (monthlyAmount * 12);
  if (!(saving > 0)) return 0;
  return Math.min(99, Math.round(saving * 100));
}

/**
 * A price in the store's own currency.
 *
 * `Intl` can be missing or lack a currency on a given device, and a price
 * screen must never throw, so it falls back to "CODE 1.23".
 */
export function formatMoney(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return '';
  const digits = amount >= 100 ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(digits)}`;
  }
}
