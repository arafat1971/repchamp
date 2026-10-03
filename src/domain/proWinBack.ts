/**
 * Welcoming back someone whose Pro lapsed.
 *
 * A lapsed subscriber is the warmest lead the app has: they already decided once
 * that this was worth paying for. The honest way to ask again is to show them
 * what they actually did while they had it — their own sessions and reps in the
 * window — and let that carry the offer.
 *
 * ## What it refuses to do
 *
 * - No invented discount. The price is the price on the paywall; a "special
 *   offer" that was always available is the dark pattern `paywallFraming`
 *   exists to avoid.
 * - No claim without evidence. If they barely trained while subscribed there is
 *   no honest "look what you did", so the card does not appear at all.
 * - No pitch over a payment problem. A billing issue means the card failed, not
 *   that they left; that gets a "fix your payment" line, never a sales one.
 * - Not for someone who cancelled this week (too raw) or a year ago (a different
 *   person) — only a window in between — and never repeatedly.
 *
 * Pure, so the policy is provable without a store or a device.
 */

export interface LapsedSubscription {
  /** RevenueCat `periodType` of the plan that ended: `NORMAL`, `TRIAL` or `INTRO`. */
  periodType: string;
  /** Epoch ms the entitlement first started. */
  startedAt: number;
  /** Epoch ms it ended. */
  endedAt: number;
  /** A failed charge was detected — the card, not the athlete's choice. */
  billingIssue: boolean;
}

export interface WinBackSession {
  reps: number;
  /** ISO timestamp. */
  completedAt: string;
}

export interface WinBackRecord {
  at: number;
  outcome: 'shown' | 'tapped' | 'dismissed';
}

export interface WinBackInput {
  lapsed: LapsedSubscription | null;
  sessions: readonly WinBackSession[];
  /** Newest first. */
  history: readonly WinBackRecord[];
  now: number;
}

export type WinBackDecision =
  | { kind: 'offer'; headline: string; body: string; cta: string }
  | { kind: 'billing-issue'; headline: string; body: string; cta: string };

const DAY_MS = 86_400_000;

/** Too soon is raw; the first look comes after a few days. */
export const MIN_DAYS_LAPSED = 4;
/** Past this they are a different person from the one who subscribed. */
export const MAX_DAYS_LAPSED = 90;
/** Fewest sets in the Pro window to have anything honest to say. */
export const MIN_SETS_IN_WINDOW = 3;
export const REOFFER_DAYS = 30;
export const REOFFER_AFTER_DISMISS_DAYS = 60;
export const MAX_WIN_BACK_OFFERS = 2;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function winBack(input: WinBackInput): WinBackDecision | null {
  const { lapsed, now } = input;
  if (!lapsed) return null;

  const lapsedDays = (now - lapsed.endedAt) / DAY_MS;
  if (lapsedDays < MIN_DAYS_LAPSED || lapsedDays > MAX_DAYS_LAPSED) return null;

  if (input.history.length >= MAX_WIN_BACK_OFFERS) return null;
  const last = input.history[0];
  if (last) {
    const needed = last.outcome === 'dismissed' ? REOFFER_AFTER_DISMISS_DAYS : REOFFER_DAYS;
    if ((now - last.at) / DAY_MS < needed) return null;
  }

  /* A failed charge is a payment problem to fix, not a lapse to win back, so
     it skips the evidence check below — there is nothing to prove, only
     something to tell them. It still goes through the pacing above, so it
     can never turn into a nag. */
  if (lapsed.billingIssue) {
    return {
      kind: 'billing-issue',
      headline: 'Your Pro payment didn’t go through',
      body: 'Your card was declined, so Pro paused. Update your payment method in the store and it picks up where you left off.',
      cta: 'See Pro',
    };
  }

  const inWindow = input.sessions.filter((s) => {
    const at = Date.parse(s.completedAt);
    return Number.isFinite(at) && at >= lapsed.startedAt && at <= lapsed.endedAt;
  });
  if (inWindow.length < MIN_SETS_IN_WINDOW) return null;

  const reps = inWindow.reduce((sum, s) => sum + s.reps, 0);
  const was = lapsed.periodType === 'TRIAL' ? 'your trial' : 'Pro';

  return {
    kind: 'offer',
    headline: 'Pick up where you left off',
    body: `In ${was} you trained ${plural(inWindow.length, 'time')} and counted ${plural(reps, 'rep')}. Pro is the same price it was, and your history is all still here.`,
    cta: 'See Pro',
  };
}
