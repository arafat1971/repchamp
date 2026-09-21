/**
 * What the two of you actually train — by movement, not just by rep count.
 *
 * `coupleTracker` answers "who put in what" as one number each: reps, days,
 * share. That is the right headline and it is also everything the couple
 * document can say, because `couples/{id}` stores exactly `trainedDays` and
 * `totalReps` per member and nothing about *which* exercise those reps were.
 *
 * So a pair training every day learns they are 60/40 on volume and never learns
 * the more useful thing: that one of them is carrying push-ups while the other
 * does every squat. That is the shape of a real habit, and it is the gap a
 * couples tracker should close.
 *
 * ## Why this reads local sessions and not the couple document
 *
 * Widening the couple doc is the obvious route and the wrong one. Its write
 * rules are the tightest in `firestore.rules` — each athlete may mutate only
 * their own member slice, and the key set is capped with `hasOnly` so a joiner
 * cannot touch a byte of their partner's stats. Adding a per-exercise map would
 * mean loosening that cap for presentation data, on the one document in the app
 * where a spoofed write is most damaging.
 *
 * The athlete's own `sessions` already carry `exercise`, locally and for free.
 *
 * ## The honest limit, stated rather than papered over
 *
 * That data is *mine only*. My partner's per-exercise history never reaches my
 * device, and no arithmetic here can conjure it. So this reports my own
 * breakdown and says plainly that the other half is unknown — it does not
 * estimate, split the difference, or infer a partner's movements from their rep
 * total. Inventing the partner's half would be the fabrication `progressProof`
 * exists to refuse, in the one place two people compare themselves to each
 * other.
 *
 * Pure and synchronous, like its neighbours.
 */

import type { ExerciseId } from '@/vision/exercises';

/** One movement, as this athlete has actually trained it. */
export interface ExerciseHabit {
  exercise: ExerciseId;
  /** Reps banked in the window. */
  reps: number;
  /** Distinct days this movement was trained in the window. */
  days: number;
  /** Share of this athlete's reps in the window, 0..1. */
  share: number;
}

export interface CoupleExerciseBreakdown {
  /** Movements this athlete trained, strongest first. Empty when none. */
  mine: readonly ExerciseHabit[];
  /** Total reps across all movements in the window. */
  total: number;
  /**
   * The movement this athlete trains most, or null when there is no clear
   * leader — a tie, or nothing trained at all. Null rather than an arbitrary
   * pick, because "your movement is push-ups" is a claim about a person.
   */
  signature: ExerciseId | null;
}

/** A session, reduced to what this module needs. */
export interface ExerciseSession {
  day: string;
  exercise: ExerciseId;
  reps: number;
}

/**
 * This athlete's movements over `windowDays`, strongest first.
 *
 * Zero-rep sessions are excluded rather than counted as a trained day: an
 * abandoned set is not a habit, and the rest of the app already refuses to bank
 * XP or streak credit for one.
 */
export function myExerciseBreakdown(
  sessions: readonly ExerciseSession[],
  windowKeys: ReadonlySet<string>,
): CoupleExerciseBreakdown {
  const byExercise = new Map<ExerciseId, { reps: number; days: Set<string> }>();

  for (const s of sessions) {
    if (!windowKeys.has(s.day) || s.reps <= 0) continue;
    const entry = byExercise.get(s.exercise) ?? { reps: 0, days: new Set<string>() };
    entry.reps += s.reps;
    entry.days.add(s.day);
    byExercise.set(s.exercise, entry);
  }

  const total = [...byExercise.values()].reduce((sum, e) => sum + e.reps, 0);

  const mine = [...byExercise.entries()]
    .map(([exercise, e]) => ({
      exercise,
      reps: e.reps,
      days: e.days.size,
      share: total === 0 ? 0 : e.reps / total,
    }))
    /* Reps first, then days, then name — a deterministic order, so the list
       does not reshuffle between renders on a tie. */
    .sort((a, b) => b.reps - a.reps || b.days - a.days || a.exercise.localeCompare(b.exercise));

  return { mine, total, signature: signatureOf(mine) };
}

/**
 * The movement someone is identifiably "the one for", or null.
 *
 * Requires a clear lead — strictly more reps than the runner-up, and at least
 * `SIGNATURE_SHARE` of the window's volume. A 34/33/33 split has no signature,
 * and calling the first one a favourite would be reading noise as identity.
 */
export const SIGNATURE_SHARE = 0.4;

function signatureOf(ranked: readonly ExerciseHabit[]): ExerciseId | null {
  const [first, second] = ranked;
  if (!first || first.reps <= 0) return null;
  if (second && second.reps === first.reps) return null;
  return first.share >= SIGNATURE_SHARE ? first.exercise : null;
}

/**
 * How the two of you differ, when that can honestly be said.
 *
 * Only ever compares *my* signature against the fact that my partner's
 * movements are unknown. It returns the framing the UI should use, so the
 * screen never has to decide how much it is allowed to claim.
 */
export type CoupleExerciseInsight =
  | { kind: 'no-data' }
  | { kind: 'mine-only'; signature: ExerciseId; share: number }
  | { kind: 'mixed' };

export function coupleExerciseInsight(
  breakdown: CoupleExerciseBreakdown,
): CoupleExerciseInsight {
  if (breakdown.total === 0) return { kind: 'no-data' };
  if (!breakdown.signature) return { kind: 'mixed' };
  const lead = breakdown.mine[0];
  if (!lead) return { kind: 'mixed' };
  return { kind: 'mine-only', signature: breakdown.signature, share: lead.share };
}
