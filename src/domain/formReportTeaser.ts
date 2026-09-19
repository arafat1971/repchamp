/**
 * What a non-Pro athlete is shown of their own form report.
 *
 * The form report is the app's strongest upsell, and it was the worst-run one.
 * `buildFormReport` runs at the end of *every* session — Pro or not, the score,
 * the three metrics, the per-rep bars and the coaching tip are all computed and
 * sitting in `sessionStore`. A free athlete who tapped "Form Report · Pro" was
 * redirected straight to a generic paywall and shown none of it.
 *
 * So the pitch was "pay to find out whether this is worth paying for", made to
 * someone who had just finished a set and was, at that exact moment, curious
 * about their own performance. That curiosity is the asset, and the redirect
 * spent it on a price list.
 *
 * This returns the part that is honest to show for free: the headline score and
 * grade they earned, plus the *names* of what the full report measures. The
 * numbers behind those names, the per-rep depth chart and the coaching tip stay
 * behind the wall, because those are the report.
 *
 * ## Why showing the real score is the right call, not a giveaway
 *
 * A teaser built from a fake or rounded number would be the same dishonesty
 * `progressProof` exists to refuse, and an athlete who later subscribes and
 * finds a different score has been lied to at the moment of payment. Showing
 * the true headline costs nothing — it is one number — and it is what makes the
 * locked detail credible. Somebody who sees "72 · Solid" knows there is a real
 * measurement behind the lock; somebody shown a blurred rectangle does not.
 *
 * Pure and store-free, so what the athlete is offered is provable in a test.
 */

import type { FormReport } from '@/vision/formScore';

export interface FormReportTeaser {
  /** The real overall score, 0-100 — the same number Pro would see. */
  score: number;
  /** The real grade for that score. */
  grade: string;
  /**
   * What the full report measures, by name only.
   *
   * Names, never values: "Depth" tells the athlete the report has something to
   * say about depth, which is the pitch. `62%` would be the product.
   */
  lockedMetrics: readonly string[];
  /** How many per-rep bars the full chart holds — a count, not the chart. */
  repCount: number;
}

/**
 * The teaser for a report, or null when there is nothing honest to tease.
 *
 * Null for a missing report and for a set with no counted reps: a report over
 * zero reps measures nothing, and dangling a lock in front of an empty
 * measurement is the fabricated-value failure this module exists to avoid.
 */
export function formReportTeaser(report: FormReport | null | undefined): FormReportTeaser | null {
  if (!report) return null;

  const repCount = report.bars.length;
  if (repCount === 0) return null;

  return {
    score: report.score,
    grade: report.grade,
    lockedMetrics: report.metrics.map((m) => m.label),
    repCount,
  };
}

/**
 * One line naming what stays locked, sized to the athlete's actual set.
 *
 * Concrete beats abstract: "18 reps analysed" is a fact about the set they just
 * did, where "detailed analysis" is a brochure phrase that could describe
 * anything. The rep count is already theirs — showing it reveals nothing the
 * results screen did not.
 */
export function teaserLockLine(teaser: FormReportTeaser): string {
  const metrics = teaser.lockedMetrics.join(', ').toLowerCase();
  return `${teaser.repCount} reps analysed — ${metrics} and your coaching tip`;
}
