/**
 * When — and only when — to offer Pro.
 *
 * The paywall already knows how to *price* an offer honestly. What was missing
 * is *timing*: the offer was shown when the athlete was refused something (a
 * locked exercise, the rep wall) — the moment they feel worst — and never at
 * the moment they feel best. People buy at a high: just after a personal best,
 * a streak milestone, a first win. That is when "keep this going" is a wish
 * rather than a sales line.
 *
 * ## What makes this honest persuasion
 *
 * - Every trigger is a real thing the athlete just did, read from their own
 *   history. No invented scarcity, no fake countdown, no made-up "others".
 * - Every number in the copy is theirs.
 * - It is rationed hard. A prompt that fires every session teaches the athlete
 *   to dismiss it; one that fires rarely, at a real peak, gets read. The
 *   cooldowns are the feature, not a limitation.
 * - It backs off. Two dismissals in a row mean "not now" — the gap then
 *   stretches to two weeks instead of nagging into an uninstall.
 * - Never for Pro, never during couple/together mode (the viral loop stays
 *   unpitched), never on top of the rep wall's own pitch.
 *
 * Pure and store-free, so the whole policy is provable in a test.
 */

import { calculateStreak } from './progression';

export type ProMomentKind = 'personal-best' | 'streak-milestone' | 'first-win';

export type ProMomentOutcome = 'shown' | 'tapped' | 'dismissed';

export interface ProMomentRecord {
  kind: ProMomentKind;
  /** Epoch ms the prompt was shown. */
  at: number;
  /** What the athlete did with it; `shown` means no response was recorded. */
  outcome: ProMomentOutcome;
}

/** The slice of a session this policy reads — a subset of `SessionSummary`. */
export interface MomentSession {
  exercise: string;
  mode: string;
  reps: number;
  won: boolean;
  drew?: boolean;
  /** `YYYY-MM-DD` */
  day: string;
}

export interface ProMomentInput {
  isPro: boolean;
  /** Newest first, *including* the set just finished. */
  sessions: readonly MomentSession[];
  /** Prompt history, newest first. */
  history: readonly ProMomentRecord[];
  /** Epoch ms. */
  now: number;
  /** The wall's own countdown is already pitching; do not double up. */
  nearingWall?: boolean;
  /** Today as `YYYY-MM-DD`. */
  today: string;
}

export interface ProMoment {
  kind: ProMomentKind;
  /** Paywall `source` — also the analytics label. */
  source: string;
  headline: string;
  body: string;
  cta: string;
}

const DAY_MS = 86_400_000;

/** Fewest finished sets before any pitch: the athlete has to have a habit first. */
export const MIN_SESSIONS_BEFORE_PITCH = 3;
/** A set smaller than this is not a peak worth interrupting. */
export const MIN_REPS_FOR_PITCH = 5;
/** Gap after any prompt. */
export const COOLDOWN_DAYS = 3;
/** Gap after two consecutive dismissals. */
export const BACKOFF_DAYS = 14;
/** The same kind is not repeated inside this window. */
export const KIND_REPEAT_DAYS = 30;
/** Streak lengths worth marking. */
export const STREAK_MILESTONES: readonly number[] = [3, 7, 14, 30, 60, 100];

const daysSince = (at: number, now: number) => (now - at) / DAY_MS;

/**
 * Whether policy permits *any* prompt right now — independent of whether
 * there is a peak to celebrate.
 */
export function promptAllowed(input: ProMomentInput): boolean {
  if (input.isPro || input.nearingWall) return false;
  if (input.sessions.length < MIN_SESSIONS_BEFORE_PITCH) return false;

  const last = input.history[0];
  if (!last) return true;

  const gap = daysSince(last.at, input.now);
  if (gap < COOLDOWN_DAYS) return false;

  const lastTwo = input.history.slice(0, 2);
  const turnedAwayTwice =
    lastTwo.length === 2 && lastTwo.every((r) => r.outcome === 'dismissed');
  return !turnedAwayTwice || gap >= BACKOFF_DAYS;
}

function kindCooledDown(kind: ProMomentKind, input: ProMomentInput): boolean {
  const prior = input.history.find((r) => r.kind === kind);
  return !prior || daysSince(prior.at, input.now) >= KIND_REPEAT_DAYS;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const EXERCISE_NAME: Record<string, string> = {
  push: 'push-up',
  squat: 'squat',
};
const exerciseName = (id: string) => EXERCISE_NAME[id] ?? id;

function personalBest(latest: MomentSession, prior: readonly MomentSession[]): ProMoment | null {
  const same = prior.filter((s) => s.exercise === latest.exercise);
  /* Two earlier sets are a line through noise; three make a "best" mean
     something. Matches `exerciseProgress`'s own floor. */
  if (same.length < 3) return null;

  const previousBest = Math.max(...same.map((s) => s.reps));
  if (latest.reps <= previousBest) return null;

  const name = exerciseName(latest.exercise);
  return {
    kind: 'personal-best',
    source: 'moment-personal-best',
    headline: `New best: ${plural(latest.reps, name)}`,
    body: `That beats your last best of ${previousBest}. Pro shows you what made this set your strongest — depth, tempo and alignment, rep by rep.`,
    cta: 'See what drove it',
  };
}

function streakMilestone(
  latest: MomentSession,
  prior: readonly MomentSession[],
  today: string,
): ProMoment | null {
  /* Only the first set of a day moves a streak. A second set at 8pm must not
     re-announce the milestone the morning set already celebrated. */
  if (prior.some((s) => s.day === latest.day)) return null;
  if (latest.day !== today) return null;

  const days = [...new Set([latest, ...prior].map((s) => s.day))];
  const streak = calculateStreak(days, today);
  if (!STREAK_MILESTONES.includes(streak)) return null;

  return {
    kind: 'streak-milestone',
    source: 'moment-streak',
    headline: `${streak} days in a row`,
    body: `You've shown up ${streak} days running. Pro gives you a multi-week programme that builds on this instead of repeating it.`,
    cta: 'Keep it growing',
  };
}

function firstWin(latest: MomentSession, prior: readonly MomentSession[]): ProMoment | null {
  if (latest.mode !== 'versus' || !latest.won || latest.drew) return null;
  if (prior.some((s) => s.mode === 'versus' && s.won && !s.drew)) return null;

  return {
    kind: 'first-win',
    source: 'moment-first-win',
    headline: 'Your first win',
    body: 'You beat them head to head. Pro opens every exercise in the library — pick the one you can win at next.',
    cta: 'Unlock more exercises',
  };
}

/**
 * The prompt to show after the set just finished, or null for none.
 *
 * Ordered by how personal the peak is: a personal best is the athlete beating
 * themselves, so it outranks a streak, which outranks a win over somebody else.
 * Returns at most one — two pitches back to back is a sales funnel, not a
 * celebration.
 */
export function chooseProMoment(input: ProMomentInput): ProMoment | null {
  const [latest, ...prior] = input.sessions;
  if (!latest) return null;

  /* Together-sets are the viral loop and stay unpitched; a tiny set is not a
     peak. */
  if (latest.mode === 'together' || latest.reps < MIN_REPS_FOR_PITCH) return null;
  if (!promptAllowed(input)) return null;

  const candidates = [
    personalBest(latest, prior),
    streakMilestone(latest, prior, input.today),
    firstWin(latest, prior),
  ];
  return candidates.find((m): m is ProMoment => m !== null && kindCooledDown(m.kind, input)) ?? null;
}
