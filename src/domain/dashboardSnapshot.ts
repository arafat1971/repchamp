/**
 * The daily dashboard widget's payload.
 *
 * A sibling of `widgetSnapshot.ts` rather than an extension of it. The partner
 * widget answers one question — is my partner training, and should I act — and
 * its focus is the reason it works. This one answers a different question:
 * how is today going across water, steps and the bond. Folding both into one
 * payload would have coupled two cards that should be free to diverge.
 *
 * Same contract as its sibling, for the same reasons: every field is a
 * primitive, every string is built here rather than in native code (a string
 * built in Swift or Kotlin cannot be unit-tested from this repo), and the
 * payload carries its own `updatedAt` so the widget can admit to being stale
 * rather than showing week-old numbers as if they were current.
 */

import { hydrationProgress, type DrinkEntry, formatMl } from '@/domain/hydration';
import { formatSteps, stepsProgress, type StepsState } from '@/domain/steps';

/** Storage key, shared with the native side. Changing it breaks the bridge. */
export const DASHBOARD_SNAPSHOT_KEY = 'repchamp.widget.dashboard.v1';

/** Matches `WIDGET_STALE_AFTER_MS` — one rule for both widgets. */
export const DASHBOARD_STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export interface DashboardSnapshot {
  /** "1.5 L" — already formatted, so no native code decides on units. */
  waterLabel: string;
  /** 0–100, clamped. */
  waterPercent: number;
  waterMet: boolean;

  /** "8,432", or '' when this phone cannot count steps. */
  stepsLabel: string;
  stepsPercent: number;
  stepsMet: boolean;
  /** False on Android and wherever motion access was refused. */
  stepsKnown: boolean;

  /** "Sam had 1.5 L today", or '' when there is nothing honest to say. */
  partnerLine: string;

  /** The one line worth reading. May be ''. */
  headline: string;

  updatedAt: number;
}

/**
 * The single line the dashboard leads with.
 *
 * Ordered by what the athlete can still do something about, not by what is
 * most impressive. A met goal is pleasant but finished; an unmet one is the
 * only thing a glance can change. Silence beats filler — a line that is
 * always present is one the athlete learns to skip, which costs the line that
 * would have mattered.
 */
function headlineFor(
  water: { met: boolean; remainingMl: number },
  steps: { known: boolean; met: boolean; remaining: number },
): string {
  if (!water.met && water.remainingMl > 0) {
    return `${formatMl(water.remainingMl)} of water to go`;
  }
  if (steps.known && !steps.met && steps.remaining > 0) {
    return `${formatSteps(steps.remaining)} steps to go`;
  }
  if (water.met && steps.known && steps.met) return 'Both goals closed today';
  if (water.met) return 'Water goal closed';
  return '';
}

export function buildDashboardSnapshot(
  drinks: readonly DrinkEntry[],
  goalMl: number,
  steps: StepsState,
  partner: { name: string; ml: number } | null,
  day: string,
  now: number = Date.now(),
): DashboardSnapshot {
  const w = hydrationProgress(drinks, goalMl, day);

  /* `stepsKnown: false` rather than a zero. On Android "steps today" is not
     answerable at all, and a 0 in the ring would read as "you have not
     moved" — the exact misreport `domain/steps` exists to prevent. */
  const known = steps.status === 'ready';
  const s = known
    ? stepsProgress(steps.steps, steps.goal)
    : { steps: 0, goal: 0, percent: 0, remaining: 0, met: false };

  return {
    waterLabel: formatMl(w.ml),
    waterPercent: w.percent,
    waterMet: w.met,

    stepsLabel: known ? formatSteps(s.steps) : '',
    stepsPercent: s.percent,
    stepsMet: s.met,
    stepsKnown: known,

    partnerLine: partner ? `${partner.name} had ${formatMl(partner.ml)} today` : '',

    headline: headlineFor(w, { known, met: s.met, remaining: s.remaining }),

    updatedAt: now,
  };
}

/** True when the payload is old enough that the widget should say so. */
export function isDashboardStale(
  snapshot: { updatedAt: number },
  now: number = Date.now(),
): boolean {
  return now - snapshot.updatedAt > DASHBOARD_STALE_AFTER_MS;
}
