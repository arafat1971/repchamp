/**
 * Where onboarding goes next, back, and on a restart — pure, so the rules that
 * were scattered through `app/onboarding.tsx` as magic numbers are tested.
 *
 * Step indices match `onboardingFunnel.ts`.
 */

/** Screens that stay in the file (so funnel names line up) but are never shown. */
export const SKIPPED_STEPS: ReadonlySet<number> = new Set([12, 13]);

export const LAST_STEP = 27;
/** The last step the progress bar is shown for; the build screen takes over after it. */
export const LAST_BAR_STEP = 17;
export const BUILD_STEP = 18;
export const REMINDERS_STEP = 19;
export const SIGN_IN_STEP = 20;
export const PAYWALL_STEP = 21;
/** The screen after the paywall. */
export const AFTER_PAYWALL_STEP = 22;

/** The next screen the athlete actually sees. */
export function nextStep(step: number): number {
  let n = step + 1;
  while (SKIPPED_STEPS.has(n)) n += 1;
  return Math.min(n, LAST_STEP);
}

/** The previous screen the athlete actually saw. */
export function previousStep(step: number): number {
  let n = step - 1;
  while (n > 0 && SKIPPED_STEPS.has(n)) n -= 1;
  return Math.max(0, n);
}

/**
 * Progress bar fill, 0–100, over the screens that are really shown.
 *
 * It measured against a fixed 24 while the bar disappears after step 17, so it
 * topped out at 71% and two skipped screens were still counted in the total —
 * a bar that never filled before handing over to the build screen. Counting
 * only visible screens up to `LAST_BAR_STEP` makes the last questionnaire
 * screen read 100%.
 */
export function barPercent(step: number): number {
  const shown = (upTo: number) => {
    let c = 0;
    for (let i = 1; i <= upTo; i += 1) if (!SKIPPED_STEPS.has(i)) c += 1;
    return c;
  };
  const total = shown(LAST_BAR_STEP);
  const at = shown(Math.min(Math.max(step, 0), LAST_BAR_STEP));
  return Math.round((at / total) * 100);
}

/**
 * Where to resume after the app was closed mid-flow.
 *
 * Answers are restored, so the questionnaire is skipped past; but the build
 * screen is an animation (re-run from the reminders step), and anything from
 * sign-in on depends on account state that may have changed, so those resume
 * at the reminders screen — one tap from sign-in.
 */
export function resumeStep(saved: number): number {
  if (!Number.isFinite(saved) || saved < 1) return 0;
  const s = Math.floor(saved);
  if (SKIPPED_STEPS.has(s)) return nextStep(s);
  if (s >= BUILD_STEP) return REMINDERS_STEP;
  return s;
}

/** The screen after sign-in: a subscriber is not offered the paywall again. */
export function afterSignInStep(isPro: boolean): number {
  return isPro ? AFTER_PAYWALL_STEP : PAYWALL_STEP;
}
