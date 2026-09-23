/**
 * What a paired athlete shares with their partner, and what the partner's day
 * looks like from this side.
 *
 * Two halves of one idea. The bond already carries each member's water and
 * steps for today (see `CoupleDailyMetrics`); until now both were published
 * unconditionally. Health numbers are the kind of thing someone should get to
 * choose to show, even to the person they chose to pair with — so each one is
 * now behind its own switch, and this module decides both what gets published
 * and how the partner's side reads.
 *
 * Workouts are deliberately NOT switchable. `trainedDays` is what the shared
 * streak counts, so hiding it would not be "share less", it would be "leave the
 * bond" — and that already has its own, explicit button.
 *
 * Pure, like the rest of `domain/`: the store persists the prefs, the service
 * writes and withdraws, and the screen renders what is decided here.
 */

import { partnerStepsToday, partnerWaterToday, type CoupleMember } from '@/domain/couple';
import { DEFAULT_DAILY_GOAL_ML, formatMl } from '@/domain/hydration';
import { DEFAULT_STEP_GOAL, formatSteps } from '@/domain/steps';

export type SharedMetricKey = 'steps' | 'water';

export interface SharingPrefs {
  steps: boolean;
  water: boolean;
}

/**
 * On by default, because that is how every paired athlete has been sharing so
 * far — defaulting to off would silently blank their partner's screen on
 * update, which reads as a bug rather than as privacy.
 */
export const DEFAULT_SHARING: SharingPrefs = { steps: true, water: true };

/** The couple-doc field each switch governs. */
export const METRIC_FIELD: Record<SharedMetricKey, 'steps' | 'waterMl'> = {
  steps: 'steps',
  water: 'waterMl',
};

/** One line under the switches, so the effect is stated rather than inferred. */
export function sharingSummary(prefs: SharingPrefs, partnerName: string): string {
  const shown = [prefs.steps ? 'steps' : null, prefs.water ? 'water' : null].filter(
    (x): x is string => x !== null,
  );
  if (shown.length === 0) return `${partnerName} sees only the days you train.`;
  return `${partnerName} sees your workouts and today's ${shown.join(' and ')}.`;
}

/**
 * One of the partner's metrics, as the dashboard shows it.
 *
 * `unshared` covers "switched off", "phone cannot count" and "nothing logged
 * yet" alike — the couple doc cannot tell them apart and the screen must not
 * pretend it can. What it must never do is render a zero.
 */
export type SharedMetric =
  | { kind: 'shown'; value: number; label: string; percent: number; met: boolean }
  | { kind: 'unshared' };

function shown(value: number, goal: number, label: string): SharedMetric {
  return {
    kind: 'shown',
    value,
    label,
    percent: Math.min(100, Math.round((value / goal) * 100)),
    met: value >= goal,
  };
}

/**
 * The friendly step race, if both sides have a number to race with.
 *
 * Null rather than a tie when either side is missing: "you're level" against
 * a partner whose phone cannot count would be a claim about a number nobody has.
 */
export type StepRace =
  | { kind: 'ahead'; by: number }
  | { kind: 'behind'; by: number }
  | { kind: 'level' };

/** Inside this margin the two counts are called level — pocket noise, not a lead. */
export const STEP_RACE_LEVEL_WITHIN = 100;

export function stepRace(mine: number | null, theirs: number | null): StepRace | null {
  if (mine == null || theirs == null) return null;
  if (!Number.isFinite(mine) || !Number.isFinite(theirs)) return null;
  const gap = Math.round(mine - theirs);
  if (Math.abs(gap) < STEP_RACE_LEVEL_WITHIN) return { kind: 'level' };
  return gap > 0 ? { kind: 'ahead', by: gap } : { kind: 'behind', by: -gap };
}

export function stepRaceLine(race: StepRace | null, partnerName: string): string {
  if (!race) return '';
  if (race.kind === 'level') return `Neck and neck with ${partnerName} on steps`;
  if (race.kind === 'ahead') return `You're ${formatSteps(race.by)} steps ahead of ${partnerName}`;
  return `${partnerName} is ${formatSteps(race.by)} steps ahead — go for a walk?`;
}

export interface PartnerToday {
  steps: SharedMetric;
  water: SharedMetric;
  trainedToday: boolean;
  bothTrainedToday: boolean;
  /** Ordered by what is worth acting on; '' when there is nothing honest to say. */
  headline: string;
}

/**
 * The partner's day, from the couple document.
 *
 * Rings measure against the app's default goals, not the partner's own —
 * their goals never leave their phone, and the ring is there to give the
 * number a shape rather than to grade them. The labels carry the real value.
 */
export function partnerToday(
  partner: CoupleMember | null | undefined,
  iTrainedToday: boolean,
  today: string,
): PartnerToday {
  const steps = partnerStepsToday(partner, today);
  const water = partnerWaterToday(partner, today);
  const trainedToday = !!partner?.trainedDays?.includes(today);
  const bothTrainedToday = trainedToday && iTrainedToday;
  const name = partner?.displayName?.trim() || 'Your partner';

  let headline = '';
  if (bothTrainedToday) headline = `You and ${name} both trained today`;
  else if (trainedToday) headline = `${name} trained today — your move`;
  else if (iTrainedToday) headline = `You're in. ${name} hasn't trained yet`;
  else if (steps != null || water != null) headline = `Neither of you has trained yet today`;

  return {
    steps: steps == null ? { kind: 'unshared' } : shown(steps, DEFAULT_STEP_GOAL, formatSteps(steps)),
    water:
      water == null ? { kind: 'unshared' } : shown(water, DEFAULT_DAILY_GOAL_ML, formatMl(water)),
    trainedToday,
    bothTrainedToday,
    headline,
  };
}
