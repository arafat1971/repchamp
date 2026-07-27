import type { ExerciseId } from '@/vision/exercises';

/**
 * What RepChamp Pro gates — the single source of truth for free vs. paid.
 *
 * Kept pure and centralised so the paywall, the gates scattered through the UI,
 * and the tests all agree on one definition. Change the split here, not in seven
 * `if (isPro)` checks.
 *
 * Guiding rule (see GROWTH_PLAN.md): **couple mode is always free** — it is the
 * viral loop, and gating growth to chase a subscription is the wrong trade. Pro
 * sells *depth*: the full exercise library, history and stats, custom programmes.
 */

/** The RevenueCat entitlement id that grants Pro. Matches the dashboard config. */
export const PRO_ENTITLEMENT = 'pro';

/** Exercises anyone can do for free — the two staples. */
export const FREE_EXERCISES: readonly ExerciseId[] = ['push', 'squat'];

/** A Pro-only capability, referenced by gates so each has a stable name. */
export type ProFeature =
  | 'exercise-library' // every movement beyond push-ups + squats
  | 'form-history' // the saved form-report trend over time
  | 'advanced-stats' // depth/tempo/alignment analytics
  | 'custom-programmes'; // adaptive multi-week plans

/**
 * Whether a given exercise is playable without Pro.
 *
 * Couple mode and the two staples stay free; the rest of the library is Pro.
 */
export function isExerciseFree(exercise: ExerciseId): boolean {
  return FREE_EXERCISES.includes(exercise);
}

/**
 * The gate the UI calls: can this athlete use `feature` right now?
 *
 * A single predicate so every call site reads the same way — `canUse(isPro,
 * 'form-history')` — and Pro-ness lives in one boolean the store owns.
 */
export function canUse(isPro: boolean, _feature: ProFeature): boolean {
  // Every named feature is Pro-only today; `isPro` decides all of them. The
  // per-feature argument exists so gates are self-documenting and so a feature
  // could later be freed without touching call sites.
  return isPro;
}

/** Can this athlete start a session with `exercise`? Free staples or Pro. */
export function canStartExercise(isPro: boolean, exercise: ExerciseId): boolean {
  return isExerciseFree(exercise) || isPro;
}
