/**
 * The upgrade pitch — the one reminder that exists to sell Pro.
 *
 * With `FREE_REP_LIMIT` at 0 a solo athlete without Pro meets the wall on their
 * first rep. Yet the evening slot kept telling them "Time for a quick set" and
 * "keep your streak" — an invitation to open the app and be refused. That is
 * the worst of both outcomes: it is not honest (the set they are asked for
 * cannot be done) and it earns nothing (the only screen it can lead to is the
 * one that was never shown).
 *
 * For exactly those athletes this slot replaces the training nag with a short,
 * truthful sales sequence. It is bounded on purpose: three pushes, then silence.
 *
 * ## Why one-shot dates and not a repeating daily trigger
 *
 * A DAILY trigger sends the same sentence forever. These are dated from the last
 * time the app was opened (every foreground re-syncs), so an athlete who keeps
 * opening the app keeps pushing the pitch out — they are seeing the paywall
 * anyway — while one who has gone quiet hears from us three times and then
 * never again. Nothing here can become a daily nag.
 *
 * ## What it does not do
 *
 * No invented discounts, countdowns or scarcity: every line states something
 * Pro actually includes (see `paywallBenefits`). It is silent for Pro,
 * for paired athletes (couple mode is the viral loop and never walled), when
 * billing is not configured, and when the athlete has switched reminders off.
 *
 * Pure and dependency-free past `hardPaywall`, so the sequence is provable
 * without a device or a notification permission.
 */

import { isWalled } from '@/domain/hardPaywall';
import type { ReminderCopy } from '@/domain/reminderCopy';

/** Days after the last app open each pitch lands. Three pushes, then nothing. */
export const UPGRADE_PITCH_DAYS = [1, 3, 7] as const;

export interface UpgradePitchStep {
  /** Whole days after the last app open. */
  days: number;
  /** Stable suffix for the notification identifier. */
  id: string;
  copy: ReminderCopy;
}

/**
 * Whether this athlete should be pitched at all.
 *
 * `proReady` gates it because RevenueCat has not answered yet on a cold start
 * and `isPro` is still its fail-safe `false` — scheduling a sales push for a
 * paying subscriber is the one mistake this module cannot afford.
 */
export function shouldPitchUpgrade(input: {
  proReady: boolean;
  isPro: boolean;
  bonusActive: boolean;
  paired: boolean;
  repsSoFar: number;
  billingReady: boolean;
  remindersEnabled: boolean;
}): boolean {
  if (!input.remindersEnabled || !input.proReady || input.paired) return false;
  return isWalled({
    isPro: input.isPro || input.bonusActive,
    repsSoFar: input.repsSoFar,
    billingReady: input.billingReady,
  });
}

/**
 * The sequence, each step leading with a different true promise so the second
 * and third are not the first one repeated.
 */
export function upgradePitchSequence(): readonly UpgradePitchStep[] {
  return [
    {
      days: UPGRADE_PITCH_DAYS[0],
      id: '1d',
      copy: {
        title: 'Your AI coach is ready',
        body: 'Pro counts every rep with the camera and scores your form on each set.',
      },
    },
    {
      days: UPGRADE_PITCH_DAYS[1],
      id: '3d',
      copy: {
        title: 'See how your form really scores',
        body: 'Depth, tempo and alignment after every set — plus the full exercise library.',
      },
    },
    {
      days: UPGRADE_PITCH_DAYS[2],
      id: '7d',
      copy: {
        title: 'A plan built around you',
        body: 'Multi-week programmes that adapt as you improve. Cancel anytime.',
      },
    },
  ];
}

/** The local instant a step fires: `days` after `from`, at `hour`:00. */
export function pitchDate(from: Date, step: UpgradePitchStep, hour: number): Date {
  const at = new Date(from);
  at.setDate(at.getDate() + step.days);
  at.setHours(hour, 0, 0, 0);
  return at;
}
