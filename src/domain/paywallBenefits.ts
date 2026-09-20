/**
 * Which promise leads, given what the athlete was just blocked on.
 *
 * The paywall lists four benefits in one fixed order for all eight sources that
 * can open it. So someone stopped at a *programme* reads "Full exercise
 * library" first, and someone who tapped a locked *form report* reads it first
 * too — in both cases the thing they actually wanted is third.
 *
 * That is a real cost at the only moment intent is known. An athlete arrives
 * here having just been refused one specific thing, and the screen answers by
 * listing everything in an order chosen for nobody.
 *
 * ## What this deliberately does not do
 *
 * It does not change what Pro includes, hide a benefit, or write a different
 * promise per source. All four are always shown, in full, with the same words —
 * the only thing that moves is which one is read first. A paywall that claims
 * different things depending on where you came from is the kind of tailoring
 * that stops being persuasion and starts being a lie told twice.
 *
 * Nor does it reorder for sources with no specific block behind them. Profile
 * and onboarding are browsing, not refusal: there is no "the thing you just
 * wanted", so they keep the authored order.
 *
 * Pure, so the ordering is provable without a store or a screen.
 */

/** Stable ids for the four promises, so ordering never depends on prose. */
export type BenefitId = 'library' | 'programmes' | 'reports' | 'free-staples';

/** The authored order — used as-is when nothing specific was blocked. */
export const DEFAULT_BENEFIT_ORDER: readonly BenefitId[] = [
  'library',
  'programmes',
  'reports',
  'free-staples',
];

/**
 * The benefit a given source was blocked on, or null when it was not a refusal.
 *
 * `rep-limit` maps to nothing on purpose: the hard wall stops *all* training,
 * not one feature, so no single promise answers it and the authored order is
 * the honest response.
 */
function blockedBenefit(source: string | null | undefined): BenefitId | null {
  switch (source) {
    case 'exercise-library':
    case 'duel-exercise':
      return 'library';
    case 'programme':
      return 'programmes';
    case 'form-report':
    case 'form-report-teaser':
      return 'reports';
    default:
      return null;
  }
}

/**
 * The four benefits, ordered so the one just refused is read first.
 *
 * Everything else keeps its relative order behind it — a stable sort, not a
 * reshuffle, so the screen still reads as one authored list rather than a
 * different page per source. `free-staples` is never promoted: it is the
 * reassurance that nothing was taken away, which only lands after the athlete
 * knows what they gain.
 */
export function orderBenefits(source: string | null | undefined): readonly BenefitId[] {
  const lead = blockedBenefit(source);
  if (!lead) return DEFAULT_BENEFIT_ORDER;
  return [lead, ...DEFAULT_BENEFIT_ORDER.filter((id) => id !== lead)];
}
