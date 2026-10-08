/**
 * When to ask for a store rating.
 *
 * A rating prompt is only worth showing at the moment the athlete is proud of
 * something they just did — and worth nothing, or worse, anywhere else. This
 * module decides that moment; it never writes anything and never calls the OS.
 *
 * ## What it requires
 *
 * - A **rare or epic highlight** on the set just finished (`setHighlight`): a
 *   personal best or a streak milestone, a fact checkable against their own
 *   history. An ordinary set never prompts.
 * - **Experience of the app**: `REVIEW_MIN_SESSIONS` sets behind them, so the
 *   rating describes the product rather than a first impression.
 * - **Not a lost duel**, and **not stacked on the Pro offer** — two asks on one
 *   screen is one too many, and the sales one is the one that should win.
 * - **Patience**: at most `REVIEW_MAX_ASKS` in a lifetime and never twice within
 *   `REVIEW_COOLDOWN_DAYS`. The OS enforces its own quota on top, and a prompt it
 *   silently drops still counts here — we cannot tell, so we assume it showed.
 *
 * ## What it deliberately does not do
 *
 * No "do you like the app?" pre-screen that routes unhappy people away from the
 * store, and no incentive for a rating. Both are against Play policy and they
 * bias the one number that is supposed to be honest. The system sheet is shown to
 * everyone who reaches a good moment, and they rate what they actually think.
 *
 * Pure and dependency-free past a type, so the rule is provable in a test with
 * no device, store or clock.
 */

import type { HighlightTier } from '@/domain/setHighlight';

export const REVIEW_MIN_SESSIONS = 3;
export const REVIEW_COOLDOWN_DAYS = 90;
export const REVIEW_MAX_ASKS = 3;

const DAY_MS = 86_400_000;

export interface ReviewPromptInput {
  now: number;
  /** Sets in the history, including the one just finished. */
  sessionCount: number;
  /** Tier of the set's highlight, or null for an ordinary set. */
  highlightTier: HighlightTier | null;
  /** A versus set the athlete lost — never the moment to ask. */
  lostDuel: boolean;
  /** The Pro offer is already on this screen. */
  proMomentShown: boolean;
  /** When we previously asked, as epoch ms. */
  asks: readonly number[];
}

export function shouldAskForReview(input: ReviewPromptInput): boolean {
  if (input.highlightTier !== 'rare' && input.highlightTier !== 'epic') return false;
  if (input.lostDuel || input.proMomentShown) return false;
  if (input.sessionCount < REVIEW_MIN_SESSIONS) return false;
  if (input.asks.length >= REVIEW_MAX_ASKS) return false;

  const last = input.asks.reduce((m, t) => Math.max(m, t), 0);
  if (last > 0 && input.now - last < REVIEW_COOLDOWN_DAYS * DAY_MS) return false;
  return true;
}

/** Parses the persisted ask log; anything malformed is treated as never asked. */
export function parseAsks(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  } catch {
    return [];
  }
}
