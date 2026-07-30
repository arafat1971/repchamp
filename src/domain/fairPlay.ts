/**
 * Fair-play constants — shared by the rep counter, Firestore rules comments,
 * and client publish guards. Coarse caps stop trivial leaderboard spoofing;
 * competitive sessions also require full-depth reps (see RepCounter options).
 */

/** Hard ceiling on a single duel seat — absurd scores never land on the board. */
export const MAX_DUEL_REPS = 500;

/**
 * Max reps a seat may jump in one *live* Firestore write.
 * Live pushes are ~1–3 Hz; a jump larger than this is almost always a cheat
 * or a corrupted client, not a human set. Finish writes may settle the full
 * score in one shot (see firestore.rules `seatRepsFair` when `done`).
 */
export const MAX_DUEL_REP_JUMP = 8;

/** Leaderboard weekly XP ceiling (also enforced in firestore.rules). */
export const MAX_WEEKLY_XP = 50_000;

/** Max XP a single session can award (matches progression.xpForSession solo win). */
export const MAX_SESSION_XP = 300;

/** Clamp a proposed weekly XP before publishing. */
export function clampWeeklyXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return 0;
  return Math.min(MAX_WEEKLY_XP, Math.floor(xp));
}

/** Clamp form score for cloud writes. */
export function clampFormScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Clamp duel reps for cloud writes. */
export function clampDuelReps(reps: number): number {
  if (!Number.isFinite(reps) || reps < 0) return 0;
  return Math.min(MAX_DUEL_REPS, Math.floor(reps));
}

/**
 * Live-sync fair step: never decrease, never jump more than MAX_DUEL_REP_JUMP,
 * and never exceed the hard cap. Callers should keep `previous` as the last
 * value successfully intended for the cloud seat.
 */
export function clampDuelRepJump(previous: number, next: number): number {
  const prev = clampDuelReps(previous);
  const target = clampDuelReps(next);
  if (target <= prev) return prev;
  return Math.min(target, prev + MAX_DUEL_REP_JUMP);
}
