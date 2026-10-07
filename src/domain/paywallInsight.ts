import { blockedBenefit } from './paywallBenefits';
import { costPerWorkout, perDayPrice, type PlanPrice } from './paywallFraming';

/**
 * The words and numbers the minimal paywall decides between.
 *
 * The screen shows very little, so what it does show has to be the right
 * thing: a headline that answers why the athlete is here, one price framing
 * (not four), and — only when a trial genuinely exists — the date the first
 * charge lands. Pure, so each decision is provable without a screen.
 */

export interface PaywallLead {
  title: string;
  sub: string;
}

/**
 * The headline for where the athlete came from.
 *
 * Mirrors `orderBenefits`: a refusal gets a headline that names what was
 * refused; the rep wall gets their own count; browsing gets the general line.
 * No claim differs by source — only which true one leads.
 */
export function paywallLead(
  source: string | null | undefined,
  opts: { fromRepWall: boolean; freeLimit: number; totalReps: number },
): PaywallLead {
  if (opts.fromRepWall) {
    if (opts.freeLimit <= 0) {
      return {
        title: 'Unlock RepChamp Pro',
        sub: 'Count every rep and get a form report after each set. Couple mode stays free.',
      };
    }
    return {
      title: `You’ve used your ${opts.freeLimit} free reps`,
      sub: `${opts.totalReps.toLocaleString()} reps counted. Pro keeps you going.`,
    };
  }
  switch (blockedBenefit(source)) {
    case 'library':
      return { title: 'Every exercise, unlocked', sub: 'Go beyond push-ups and squats.' };
    case 'programmes':
      return { title: 'A plan that adapts to you', sub: 'Multi-week programmes that scale as you do.' };
    case 'reports':
      return { title: 'See exactly how you move', sub: 'Depth, tempo and alignment after every set.' };
    default:
      return { title: 'Train without limits', sub: 'Depth when you want it. Couple mode stays free.' };
  }
}

/**
 * The single price framing worth showing under the plans.
 *
 * Per workout when the athlete has trained enough for it to mean something —
 * it is their pace, not a typical one — otherwise per day, the smallest honest
 * unit. One line, never both: two framings of one number read as patter.
 */
export function priceInsight(plan: PlanPrice, workouts30: number): string | null {
  const each = costPerWorkout(plan, workouts30);
  if (each) return `About ${each} a workout at your pace`;
  const day = perDayPrice(plan);
  return day ? `Works out to ${day} a day` : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Oct" — locale-free so the timeline reads the same everywhere. */
export function shortDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export interface TrialTimeline {
  /** When the first charge lands, e.g. "12 Oct". */
  chargeDate: string;
  /** Last day to cancel without being charged — the day before. */
  cancelBy: string;
}

/**
 * Where a free trial ends. Null for a plan with no trial, so the screen draws
 * nothing rather than inventing a timeline.
 */
export function trialTimeline(trialDays: number | null, now: Date): TrialTimeline | null {
  if (!trialDays || trialDays < 1) return null;
  const charge = new Date(now.getFullYear(), now.getMonth(), now.getDate() + trialDays);
  const before = new Date(charge.getFullYear(), charge.getMonth(), charge.getDate() - 1);
  return { chargeDate: shortDate(charge), cancelBy: shortDate(before) };
}
