/**
 * Where onboarding goes next, back, and on a restart — pure, so the rules that
 * were scattered through `app/onboarding.tsx` as magic numbers are tested.
 *
 * The flow is a named list. A screen is found by its id, never by a bare
 * number, so a screen can be added, moved or hidden without every other index
 * in the file shifting under it. Some screens only show for athletes whose
 * answers make them relevant (the couple pitch is for someone who wants a
 * partner; the yoga screen is for someone who picked yoga).
 */

export const FLOW = [
  /* Hook: feel something before being asked for anything. */
  'welcome',
  'showcase',
  'feel',
  'value-counts-reps',
  'value-couple',
  'value-ranks',
  /* Personalise: small, easy answers first, each one shaping what follows. */
  'goal',
  'train-with',
  'couple-pitch',
  'friends-pitch',
  'coach-pitch',
  'styles',
  'yoga-pitch',
  'experience',
  'blocker',
  'antidote',
  'frequency',
  'when',
  /* Invest: the bigger asks, once there is something to lose. */
  'username',
  'photo',
  /* Proof: the plan, the maths, the first rival. */
  'your-plan',
  'your-projection',
  'your-first-week',
  'challenge',
  'building',
  /* Convert. */
  'reminders',
  'sign-in',
  'price-why',
  'paywall',
  /* Set up. */
  'how-reps-count',
  'set-up-your-space',
  'home-widget',
  'together-preview',
  'reps-widget',
  'ready-to-race',
] as const;

export type StepId = (typeof FLOW)[number];

/** Who the athlete wants in their corner. */
export type Circle = 'solo' | 'partner' | 'friends' | 'coach';
/** What kinds of training they want to try. */
export type TrainStyle = 'strength' | 'yoga' | 'mind' | 'mobility';

/** The answers that decide which screens appear. */
export interface FlowAnswers {
  circle: Circle | null;
  styles: readonly string[];
}

const NO_ANSWERS: FlowAnswers = { circle: null, styles: [] };

/** Index of a screen in the flow. */
export function stepIndex(id: StepId): number {
  return FLOW.indexOf(id);
}

/** The screen at an index, or undefined when out of range. */
export function stepIdAt(step: number): StepId | undefined {
  return FLOW[step];
}

export const LAST_STEP = FLOW.length - 1;
/** The last step the progress bar is shown for; the build screen takes over after it. */
export const LAST_BAR_STEP = stepIndex('challenge');
export const BUILD_STEP = stepIndex('building');
export const REMINDERS_STEP = stepIndex('reminders');
export const SIGN_IN_STEP = stepIndex('sign-in');
export const PRICE_WHY_STEP = stepIndex('price-why');
export const PAYWALL_STEP = stepIndex('paywall');
export const USERNAME_STEP = stepIndex('username');
export const PHOTO_STEP = stepIndex('photo');
/** The screen after the paywall. */
export const AFTER_PAYWALL_STEP = stepIndex('how-reps-count');

/** Whether the athlete sees this screen, given what they have answered so far. */
export function isShown(id: StepId, answers: FlowAnswers = NO_ANSWERS): boolean {
  switch (id) {
    case 'couple-pitch':
      return answers.circle === 'partner';
    case 'friends-pitch':
      return answers.circle === 'friends';
    case 'coach-pitch':
      return answers.circle === 'coach';
    case 'yoga-pitch':
      return answers.styles.includes('yoga');
    default:
      return true;
  }
}

const shownAt = (step: number, answers: FlowAnswers) => {
  const id = FLOW[step];
  return id !== undefined && isShown(id, answers);
};

/** The next screen the athlete actually sees. */
export function nextStep(step: number, answers: FlowAnswers = NO_ANSWERS): number {
  let n = step + 1;
  while (n < LAST_STEP && !shownAt(n, answers)) n += 1;
  return Math.min(n, LAST_STEP);
}

/** The previous screen the athlete actually saw. */
export function previousStep(step: number, answers: FlowAnswers = NO_ANSWERS): number {
  let n = step - 1;
  while (n > 0 && !shownAt(n, answers)) n -= 1;
  return Math.max(0, n);
}

/**
 * Progress bar fill, 0–100, over the screens that are really shown.
 *
 * Counting only visible screens up to `LAST_BAR_STEP` makes the last
 * questionnaire screen read 100%, and a branch screen that does not apply to
 * this athlete never makes the bar jump or stall.
 */
export function barPercent(step: number, answers: FlowAnswers = NO_ANSWERS): number {
  const shown = (upTo: number) => {
    let c = 0;
    for (let i = 1; i <= upTo; i += 1) if (shownAt(i, answers)) c += 1;
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
export function resumeStep(saved: number, answers: FlowAnswers = NO_ANSWERS): number {
  if (!Number.isFinite(saved) || saved < 1) return 0;
  const s = Math.floor(saved);
  if (s >= BUILD_STEP) return REMINDERS_STEP;
  if (!shownAt(s, answers)) return nextStep(s, answers);
  return s;
}

/**
 * The screen after sign-in. A subscriber is not offered the paywall again, and
 * everyone else meets the price explanation before the price itself.
 */
export function afterSignInStep(isPro: boolean): number {
  return isPro ? AFTER_PAYWALL_STEP : PRICE_WHY_STEP;
}
