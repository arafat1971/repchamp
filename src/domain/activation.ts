/**
 * Activation — the first counted rep of an athlete's life.
 *
 * `first_rep_counted` already existed, but it fired on `completedRep.index === 1`,
 * which is the first rep of *every* session. That answers "did a set start
 * producing reps", a useful but different question, and it meant the one metric
 * `GROWTH_v2.md` ranks second — install → first counted rep — could not be
 * computed. The funnel ran `onboarding_step` → `onboarding_completed` → a
 * per-session event that a returning athlete emits several times a week, so
 * there was no terminal step and no denominator for "how many installs ever
 * reached a rep at all".
 *
 * The distinction is one persisted bit. It lives here rather than at the emit
 * site so the rule is provable without a camera, a pose model, or a device, and
 * it is expressed as a pure decision over that bit rather than as a store field:
 * this is instrumentation, and `profileStore` deliberately does not know
 * analytics exists. `app/_layout.tsx` keeps its `day_n_return` markers in MMKV
 * for the same reason — same pattern, same reasoning.
 */

/** MMKV key for the activation marker. Instrumentation-only, never product state. */
export const FIRST_REP_MARKER = 'activation.firstRepAt';

export interface FirstRepOutcome {
  /** True the one time an athlete's first-ever rep is counted. */
  isFirstEver: boolean;
  /** ISO timestamp to persist when `isFirstEver`. Null when already activated. */
  markAt: string | null;
}

/**
 * Whether this counted rep is the athlete's first ever.
 *
 * `repIndex` is the rep's position in the current session (1-based, from
 * `RepRecord.index`), and `markedAt` is whatever the marker holds — null or
 * undefined before activation, an ISO timestamp afterwards.
 *
 * Only the session's first rep is considered, so the marker is read once per
 * set rather than on every rep of a fifty-rep session. A rep that is not the
 * session's first cannot be the athlete's first either: a first-ever rep is by
 * definition rep 1 of the first session.
 *
 * Deliberately decided from the marker rather than from banked rep totals.
 * `selectTotalReps` only counts *recorded* sessions, and a session is recorded
 * when it finishes — so an athlete who counts reps and abandons the set before
 * the result screen would read as zero reps forever, and would re-fire "first
 * rep" on every subsequent attempt. The whole point of this event is that it
 * fires exactly once, so it cannot depend on a number that a quit resets.
 */
export function firstRepOutcome(
  repIndex: number,
  markedAt: string | null | undefined,
  now: () => string = () => new Date().toISOString(),
): FirstRepOutcome {
  if (repIndex !== 1) return { isFirstEver: false, markAt: null };
  if (markedAt) return { isFirstEver: false, markAt: null };
  return { isFirstEver: true, markAt: now() };
}
