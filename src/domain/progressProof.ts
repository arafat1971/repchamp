import type { SessionSummary } from '@/state/profileStore';

/**
 * Evidence that the athlete is getting better.
 *
 * The app has recorded every set since launch and never once told anyone they
 * had improved. Encouragement is cheap and everybody discounts it; a number
 * they can check is not. "Your first push-up set was 4 reps. Today it was 11."
 * is the same claim as "you're doing great", except it is falsifiable, which is
 * exactly why it is believed.
 *
 * Every function here refuses to speak rather than overstate. A single session
 * proves nothing, a worse day is not dressed up as progress, and where there is
 * no honest claim the return is null and the UI shows nothing.
 */

export interface ExerciseProgress {
  exercise: string;
  /** Best single set when they started — the first session on record. */
  firstBest: number;
  /** Best single set now. */
  currentBest: number;
  /** Whole-number percent gain; only present when genuinely positive. */
  percentGain: number;
  sessionCount: number;
}

/**
 * Per-exercise improvement, best sets only.
 *
 * Best-vs-best rather than first-vs-latest: a light day after a heavy week is
 * not a regression, and an athlete who has plainly improved should not be told
 * otherwise because today was a recovery set.
 *
 * Needs at least `minSessions` before it will claim anything. Two points are a
 * line through noise, not a trend.
 */
export function exerciseProgress(
  sessions: readonly SessionSummary[],
  minSessions = 3,
): ExerciseProgress[] {
  const byExercise = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    const list = byExercise.get(s.exercise);
    if (list) list.push(s);
    else byExercise.set(s.exercise, [s]);
  }

  const out: ExerciseProgress[] = [];
  for (const [exercise, group] of byExercise) {
    if (group.length < minSessions) continue;

    const chronological = [...group].sort((a, b) =>
      a.completedAt.localeCompare(b.completedAt),
    );
    const half = Math.max(1, Math.floor(chronological.length / 2));
    const firstBest = Math.max(...chronological.slice(0, half).map((s) => s.reps));
    const currentBest = Math.max(...chronological.slice(half).map((s) => s.reps));

    if (!firstBest || currentBest <= firstBest) continue;

    out.push({
      exercise,
      firstBest,
      currentBest,
      percentGain: Math.round(((currentBest - firstBest) / firstBest) * 100),
      sessionCount: group.length,
    });
  }

  return out.sort((a, b) => b.percentGain - a.percentGain);
}

/**
 * The single strongest true thing that can be said right now.
 *
 * One claim, not a wall of statistics: a dashboard is read, a sentence is
 * believed. Returns null when nothing has been earned yet, because a fabricated
 * milestone on day one teaches the athlete that the app's praise means nothing.
 */
export function headlineProof(
  sessions: readonly SessionSummary[],
  streak: number,
): string | null {
  if (sessions.length === 0) return null;

  const [best] = exerciseProgress(sessions);
  if (best) {
    return `Your best set has gone from ${best.firstBest} to ${best.currentBest} reps`;
  }

  if (streak >= 3) return `${streak} days in a row — that is the hard part done`;

  const totalReps = sessions.reduce((sum, s) => sum + s.reps, 0);
  if (totalReps >= 100) return `${totalReps} reps banked since you started`;

  if (sessions.length >= 3) return `${sessions.length} sets finished — the habit is forming`;

  return null;
}

/**
 * Where the athlete started — for someone who has not yet earned a headline.
 *
 * `headlineProof` refuses every tier for an athlete with one or two sessions,
 * under 100 banked reps and no streak: no measurable gain (that needs three
 * sessions), no streak, not enough volume, not enough sets. That refusal is
 * correct — they have not improved yet, and saying they have would be the
 * fabrication this module exists to avoid.
 *
 * But it leaves the dormant slot silent for exactly the athlete most likely to
 * leave. Someone who trained twice and stopped gets the generic evening line
 * that already failed them on days one and two, because
 * `buildDormantReminder` has nothing true to put in its place.
 *
 * There is something true: where they began. "Your first set was 12 push-ups"
 * claims no progress, no trend and no milestone — it is a fact about one
 * recorded session, and it is the number every later gain will be measured
 * from. That is a different sentence from the ones above, not a weakened
 * version of them.
 *
 * ## Why this is separate rather than a fifth tier of `headlineProof`
 *
 * `headlineProof` feeds the weekly recap and, through `exerciseProgress`, the
 * share card. Loosening any threshold there would let a two-session athlete's
 * "progress" leak into a recap that claims improvement and a share card that
 * broadcasts it — the two places where an overstatement is most expensive.
 * Those refusals are load-bearing, so this adds a narrower claim beside them
 * rather than widening any of them.
 *
 * Returns null once `headlineProof` can speak (three or more sessions), so the
 * two never compete for the same slot, and null for an athlete with nothing on
 * record at all — a first set of zero reps is not a starting point.
 */
export function startingPointProof(sessions: readonly SessionSummary[]): string | null {
  if (sessions.length === 0 || sessions.length > 2) return null;

  /* The earliest session on record. `sessions` is newest-first as the store
     writes it, but that is the store's business — sorting by the timestamp
     makes this correct whatever order arrives. */
  const [first] = [...sessions].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  if (!first || first.reps <= 0) return null;

  /* Pluralised: a single-rep first set is exactly the athlete this line exists
     for, and "1 reps" in the sentence meant to make them feel credited is the
     one place sloppiness is least affordable. */
  return `Your first set was ${first.reps} rep${first.reps === 1 ? '' : 's'}`;
}

/**
 * A line worth sharing, or null.
 *
 * Only offered when there is a real result behind it. Prompting someone to
 * broadcast an unremarkable day costs them social credit and teaches them to
 * ignore the prompt, which is worse than never asking.
 */
export function shareWorthyLine(
  sessions: readonly SessionSummary[],
  streak: number,
): string | null {
  const [best] = exerciseProgress(sessions);
  if (best && best.percentGain >= 25) {
    return `Up ${best.percentGain}% on my best set since starting RepChamp 💪`;
  }
  if (streak >= 7) return `${streak}-day training streak on RepChamp 🔥`;
  return null;
}
