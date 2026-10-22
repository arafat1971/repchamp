/**
 * The onboarding paywall's decisions — pure, so they are tested rather than
 * argued about.
 *
 * The screen is a hard paywall: it is the end of onboarding and there is no
 * free solo training behind it (`FREE_REP_LIMIT` is 0). It is still
 * dismissible — a quiet close control fades in after `CLOSE_DELAY_MS` — because
 * an inescapable paywall is the exact shape Play rejected. Everything here is
 * derived from the athlete's own answers and the real store prices: no fake
 * timers, no invented "was" price, no testimonials that did not happen.
 */

import { firstWeekTarget, goalPlan, type Blocker, type FitnessLevel } from '@/domain/onboardingPlan';

export type PlanKey = 'year' | 'month' | 'week';

/** How long before the close control appears. Long enough to read the offer. */
export const CLOSE_DELAY_MS = 3500;

/** Store package type → the plan key onboarding remembers. */
export function planKeyOf(packageType: string): PlanKey | null {
  switch (packageType) {
    case 'ANNUAL':
      return 'year';
    case 'MONTHLY':
      return 'month';
    case 'WEEKLY':
      return 'week';
    default:
      return null;
  }
}

/** Accept a saved plan key, or fall back to the yearly default. */
export function cleanPlanKey(raw: unknown): PlanKey {
  return raw === 'month' || raw === 'week' ? raw : 'year';
}

/**
 * The plan to show selected: the one they picked if it exists, else yearly,
 * else whatever exists. Null when the store offered nothing.
 */
export function resolvePlan(wanted: PlanKey, available: readonly PlanKey[]): PlanKey | null {
  if (available.includes(wanted)) return wanted;
  for (const k of ['year', 'month', 'week'] as const) if (available.includes(k)) return k;
  return null;
}

/**
 * The one thing offered when they reach for the close control: a smaller
 * commitment than the one selected, if one really exists. Weekly before monthly.
 * Null when they already have the smallest plan selected — then closing just closes.
 */
export function exitOffer(selected: PlanKey, available: readonly PlanKey[]): PlanKey | null {
  const order: PlanKey[] = ['week', 'month'];
  const rank: Record<PlanKey, number> = { week: 0, month: 1, year: 2 };
  for (const k of order) {
    if (available.includes(k) && rank[k] < rank[selected]) return k;
  }
  return null;
}

export interface Benefit {
  icon: string;
  title: string;
  body: string;
}

const LEAD: Record<Blocker, Benefit> = {
  motivation: {
    icon: '⚔️',
    title: 'Rivals that push back',
    body: 'Live duels and AI pacers that match your level, so every set has a reason.',
  },
  consistency: {
    icon: '📆',
    title: 'A plan for every day',
    body: 'Programmes that tell you exactly what today is — and streaks worth protecting.',
  },
  form: {
    icon: '🎯',
    title: 'Form checked on every rep',
    body: 'Depth and tempo scored live, with a form report after each set.',
  },
  time: {
    icon: '⏱️',
    title: 'Two minutes, no gear',
    body: 'Prop your phone up and go. Every rep counted for you, anywhere.',
  },
};

/**
 * Three benefits, led by the answer to what they said stops them. The other
 * two are the core: unlimited AI counting, and the full library.
 */
export function benefitsFor(blocker: Blocker | null, goal: string | null): Benefit[] {
  const lead = blocker ? LEAD[blocker] : null;
  const counting: Benefit = {
    icon: '🤖',
    title: 'Unlimited AI rep counting',
    body: `Every rep counted and banked — ${goalPlan(goal).focus.toLowerCase()}.`,
  };
  const library: Benefit = {
    icon: '🔓',
    title: 'Everything unlocked',
    body: 'Every exercise, programme, yoga flow and form report.',
  };
  return lead ? [lead, counting, library] : [counting, library, LEAD.consistency];
}

/**
 * Six weekly rep targets: their real first-week target, growing 15% a week
 * (the progressive overload the programmes use), rounded to fives.
 */
export function sixWeekClimb(daysPerWeek: number, level: FitnessLevel | null): number[] {
  const start = firstWeekTarget(daysPerWeek, level);
  return Array.from({ length: 6 }, (_, i) => Math.round((start * Math.pow(1.15, i)) / 5) * 5);
}

/** The hero line, in their name. */
export function paywallHeadline(username: string): string {
  const handle = username.trim();
  return handle ? `@${handle}, your plan\nis ready` : 'Your plan\nis ready';
}
