import type { ExerciseId } from '@/vision/exercises';

/**
 * The single most important thing to surface on Home right now.
 *
 * Home used to be a menu of seven equal sections; this makes it a decision. The
 * app looks at who the athlete is today — brand new, streak about to break,
 * partner already trained, unpaired — and picks one hero action. Everything else
 * on the screen is secondary to whatever this returns.
 *
 * Kept a pure function (no React, no stores, no Firebase) so the priority order —
 * which is the whole point, and easy to get subtly wrong — is unit-tested in
 * `homeFocus.test.ts` rather than tangled in JSX.
 */
export type HomeFocus =
  | { kind: 'first-session' }
  | { kind: 'streak-at-risk'; partnerName: string; streak: number }
  | { kind: 'partner-trained'; partnerName: string }
  | { kind: 'invite-partner' }
  | { kind: 'daily-challenge'; exercise: ExerciseId; target: number }
  | { kind: 'goal-met'; days: number; goal: number }
  | { kind: 'recovery' };

export interface HomeFocusInput {
  /** True once the athlete has ever finished a session. */
  hasTrained: boolean;
  /** True if the athlete already logged a session *today*. */
  trainedToday: boolean;
  /** Distinct days trained this week (for the weekly goal). */
  daysThisWeek: number;
  /** The athlete's weekly target. */
  weeklyGoal: number;

  /** Couple state, all derivable from `useCouple`. */
  couple: {
    /** Both seats filled. */
    paired: boolean;
    partnerName: string | null;
    /** Shared streak (days both trained). */
    streak: number;
    /** Streak is live but today isn't yet secured by both. */
    atRisk: boolean;
    /** Partner logged a session today. */
    partnerTrainedToday: boolean;
  };

  /** Today's featured challenge, if one is offered and not yet done. */
  dailyChallenge: { exercise: ExerciseId; target: number; done: boolean } | null;
}

/**
 * Pick the hero. First matching rule wins, so **order is the design** — it
 * encodes what matters most at any moment:
 *
 *  1. A brand-new athlete needs a first rep above all else (activation).
 *  2. A live shared streak about to lapse is the sharpest retention moment.
 *  3. "Your partner already trained" is the strongest social pull there is.
 *  4. An open daily challenge is the everyday habit driver.
 *  5. Goal already met → celebrate, offer a bonus.
 *  6. No partner yet → invite, because couple mode is the growth loop.
 *  7. Nothing pressing (trained today / rest) → recovery.
 *
 * The invite used to sit at 4, above the daily challenge and the weekly goal —
 * and because `!paired` carries no other condition, that made it a terminal
 * rule for everyone training alone. A solo athlete who had trained even once
 * saw "Train with your partner" and nothing else, for good: rules 4, 5 and 7
 * below it were unreachable for the majority of the userbase, and the hero
 * that was supposed to adapt never changed.
 *
 * It stays above `recovery`, because a solo athlete with nothing pressing is
 * exactly who the growth loop should ask. But a live challenge or a week just
 * completed is a better ask, and both change from one day to the next, which is
 * what makes the screen feel alive.
 */
export function selectHomeFocus(input: HomeFocusInput): HomeFocus {
  const { couple: c } = input;

  if (!input.hasTrained) {
    return { kind: 'first-session' };
  }

  // Retention: the shared streak dies today unless someone acts. Only fires when
  // paired and a streak actually exists to lose.
  if (c.paired && c.atRisk && c.partnerName) {
    return { kind: 'streak-at-risk', partnerName: c.partnerName, streak: c.streak };
  }

  // Social pull: the partner trained, this athlete hasn't. Nothing motivates a
  // return like the other half already having shown up.
  if (c.paired && c.partnerName && c.partnerTrainedToday && !input.trainedToday) {
    return { kind: 'partner-trained', partnerName: c.partnerName };
  }

  // Habit: today's challenge, if offered and unfinished.
  if (input.dailyChallenge && !input.dailyChallenge.done) {
    return {
      kind: 'daily-challenge',
      exercise: input.dailyChallenge.exercise,
      target: input.dailyChallenge.target,
    };
  }

  // Reward: the weekly goal is already met — celebrate rather than nag.
  if (input.daysThisWeek >= input.weeklyGoal) {
    return { kind: 'goal-met', days: input.daysThisWeek, goal: input.weeklyGoal };
  }

  // Growth: no partner bonded yet. Couple mode can't be used alone, so this is
  // the invite that unlocks it. Below the two rules above so it is what a solo
  // athlete sees when nothing else is pending, rather than all they ever see.
  if (!c.paired) {
    return { kind: 'invite-partner' };
  }

  // Nothing urgent — trained today, or a rest day. Point at recovery.
  return { kind: 'recovery' };
}
