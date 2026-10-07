/**
 * Names for the onboarding steps, so drop-off is readable.
 *
 * Onboarding fired one event, at the end. Thirty-odd screens and the only
 * signal was "finished" or silence — which means nobody could say whether
 * people quit at the username, the paywall, or somewhere in the middle. Adding
 * screens to a funnel like that is guesswork, and every screen added is another
 * place to lose someone.
 *
 * A funnel reading `paywall` → `how-reps-count` is diagnosable. One reading
 * `28` → `29` is a puzzle nobody solves twice.
 *
 * The names are the flow's own ids (`onboardingNav.FLOW`), so a screen cannot
 * be renamed in one place and not the other.
 */

import { FLOW } from './onboardingNav';

/**
 * A stable slug for a step index.
 *
 * Falls back to `step-N` rather than throwing: an unnamed step should still be
 * measurable, and a crash in analytics would be far worse than a dull label.
 */
export function onboardingStepName(step: number): string {
  return FLOW[step] ?? `step-${step}`;
}

/** Total named steps, for computing how far through someone got. */
export const ONBOARDING_STEP_COUNT = FLOW.length;

/**
 * How far through onboarding a step is, 0–100.
 *
 * Reported alongside the name so a funnel can be read either way — by screen
 * when diagnosing a specific drop, by depth when comparing cohorts.
 */
export function onboardingProgressPercent(step: number): number {
  const last = ONBOARDING_STEP_COUNT - 1;
  if (last <= 0) return 100;
  const clamped = Math.min(Math.max(step, 0), last);
  return Math.round((clamped / last) * 100);
}
