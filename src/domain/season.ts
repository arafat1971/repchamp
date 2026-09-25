/**
 * The scene's calendar: the season, and the few days worth dressing up for.
 *
 * Seasons follow the meteorological calendar and flip south of the equator;
 * the hemisphere comes from the (opt-in) weather reading and defaults north.
 * Occasions are the widely shared ones — New Year's Day, Valentine's Day —
 * plus the couple's own: each month on the day they paired.
 */

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export type Occasion = 'newyear' | 'valentine' | 'bond' | '';

/** The season for a local date, in the given hemisphere. */
export function seasonFor(date: Date, south = false): Season {
  const m = date.getMonth(); // 0 = January
  const north: Season = m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
  if (!south) return north;
  return ({ winter: 'summer', spring: 'autumn', summer: 'winter', autumn: 'spring' } as const)[north];
}

/**
 * Whole months since pairing, when today is the monthly anniversary; else 0.
 * A pairing on the 31st celebrates on the last day of shorter months.
 */
export function bondMonths(pairedAt: number | null | undefined, today: Date): number {
  if (!pairedAt || !Number.isFinite(pairedAt)) return 0;
  const start = new Date(pairedAt);
  const months = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  if (months <= 0) return 0;
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const day = Math.min(start.getDate(), lastDay);
  return today.getDate() === day ? months : 0;
}

/** Today's occasion, if any — the couple's own takes precedence. */
export function occasionFor(today: Date, bond: number): Occasion {
  if (bond > 0) return 'bond';
  if (today.getMonth() === 0 && today.getDate() === 1) return 'newyear';
  if (today.getMonth() === 1 && today.getDate() === 14) return 'valentine';
  return '';
}

/** The line an occasion earns on the widget. */
export function occasionLine(occasion: Occasion, bond: number): string | null {
  if (occasion === 'bond') return bond % 12 === 0 ? `${bond / 12}-year bond today 💞` : `${bond}-month bond today 💞`;
  if (occasion === 'newyear') return 'Happy New Year 🎆 — first sip of the year?';
  if (occasion === 'valentine') return 'Happy Valentine’s 💝 — share a sip';
  return null;
}
