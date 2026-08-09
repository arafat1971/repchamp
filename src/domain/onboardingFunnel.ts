/**
 * Names for the onboarding steps, so drop-off is readable.
 *
 * Onboarding fired one event, at the end. Twenty-five screens and the only
 * signal was "finished" or silence — which means nobody could say whether
 * people quit at the username, the paywall, or somewhere in the middle. Adding
 * screens to a funnel like that is guesswork, and every screen added is another
 * place to lose someone.
 *
 * A funnel reading `paywall` → `how-reps-count` is diagnosable. One reading
 * `21` → `22` is a puzzle nobody solves twice.
 */

/** Step index → stable slug. Indices match `app/onboarding.tsx`. */
const STEP_NAMES: Readonly<Record<number, string>> = {
  0: 'welcome',
  1: 'value-counts-reps',
  2: 'value-duels',
  3: 'value-couple',
  4: 'value-progress',
  5: 'username',
  6: 'photo',
  7: 'goal',
  8: 'frequency',
  9: 'experience',
  10: 'blocker',
  11: 'antidote',
  12: 'ai-coach',
  13: 'couple-mode',
  14: 'your-plan',
  15: 'commitment',
  16: 'social-proof',
  17: 'challenge',
  18: 'building',
  19: 'reminders',
  20: 'sign-in',
  21: 'paywall',
  22: 'how-reps-count',
  23: 'set-up-your-space',
  24: 'offer',
};

/**
 * A stable slug for a step index.
 *
 * Falls back to `step-N` rather than throwing: an unnamed step should still be
 * measurable, and a crash in analytics would be far worse than a dull label.
 */
export function onboardingStepName(step: number): string {
  return STEP_NAMES[step] ?? `step-${step}`;
}

/** Total named steps, for computing how far through someone got. */
export const ONBOARDING_STEP_COUNT = Object.keys(STEP_NAMES).length;

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
