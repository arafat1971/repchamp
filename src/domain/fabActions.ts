import { canStartExercise } from '@/domain/pro';
import type { SessionSummary } from '@/state/profileStore';
import type { ExerciseId } from '@/vision/exercises';

/**
 * What the Train FAB should offer, given what the athlete has actually done.
 *
 * The menu used to be a fixed list in a fixed order — the same four exercises
 * whether it was the athlete's first session or their hundredth, whether they
 * had already trained today or not. This ranks it instead, and works out
 * whether there is a single obvious action worth skipping the menu for.
 *
 * Pure and dependency-free so it can be tested without a device: the caller
 * supplies session history and entitlement, and gets back an order plus a
 * primary action.
 */

/** One row in the FAB menu. */
export interface RankedExercise {
  exercise: ExerciseId;
  /** True when this athlete's plan does not include it — show a lock. */
  locked: boolean;
  /** True when a set of this movement is already logged today. */
  doneToday: boolean;
  /** Sets logged in the trailing window; drives the "usual pick" ordering. */
  recentCount: number;
}

export interface FabModel {
  /** Menu rows, best-next first. */
  order: readonly RankedExercise[];
  /**
   * The one action a tap should take without opening the menu, or null when
   * nothing stands out and the menu should open as usual.
   */
  primary: FabPrimary | null;
  /** Count for the badge on the button itself. 0 hides it. */
  badgeCount: number;
}

export type FabPrimary =
  | { kind: 'daily'; exercise: ExerciseId }
  | { kind: 'duel' }
  | { kind: 'exercise'; exercise: ExerciseId };

export interface FabInput {
  sessions: readonly SessionSummary[];
  /** `dayKey()` for today, so callers stay timezone-consistent with the rest. */
  today: string;
  isPro: boolean;
  /** Exercises the menu offers, in their authored order. */
  candidates: readonly ExerciseId[];
  /** Incoming duel invites awaiting a response. */
  pendingDuels: number;
  /** The featured daily challenge, and whether it is already cleared. */
  daily: { exercise: ExerciseId; done: boolean };
}

/** How far back "usual pick" looks. Long enough to see a habit, short enough to follow a change in one. */
const RECENT_DAYS = 14;

/**
 * Rank the menu and pick the primary action.
 *
 * Ordering, in priority order:
 *   1. Not done today beats done today — the point of the button is to start
 *      something, and a movement already logged is the least useful row.
 *   2. Unlocked beats locked. A locked row that outranks a usable one just
 *      sends the athlete to the paywall on their way to training.
 *   3. More recent sets first, so the movement someone actually does floats up.
 *   4. Authored order, so the result is stable when nothing distinguishes two.
 */
export function buildFabModel(input: FabInput): FabModel {
  const { sessions, today, isPro, candidates, pendingDuels, daily } = input;

  const recentCutoff = shiftDay(today, -RECENT_DAYS);
  const recentCounts = new Map<ExerciseId, number>();
  const doneToday = new Set<ExerciseId>();

  for (const s of sessions) {
    if (s.day === today) doneToday.add(s.exercise);
    if (s.day > recentCutoff) {
      recentCounts.set(s.exercise, (recentCounts.get(s.exercise) ?? 0) + 1);
    }
  }

  /** Authored position, carried alongside the row so ties stay stable. */
  const rows = candidates.map((exercise, authoredIndex) => ({
    row: {
      exercise,
      locked: !canStartExercise(isPro, exercise),
      doneToday: doneToday.has(exercise),
      recentCount: recentCounts.get(exercise) ?? 0,
    } satisfies RankedExercise,
    authoredIndex,
  }));

  rows.sort((a, b) => {
    if (a.row.doneToday !== b.row.doneToday) return a.row.doneToday ? 1 : -1;
    if (a.row.locked !== b.row.locked) return a.row.locked ? 1 : -1;
    if (a.row.recentCount !== b.row.recentCount) return b.row.recentCount - a.row.recentCount;
    return a.authoredIndex - b.authoredIndex;
  });

  const order = rows.map((r) => r.row);

  return {
    order,
    primary: pickPrimary({ order, isPro, pendingDuels, daily }),
    badgeCount: pendingDuels + (daily.done ? 0 : 1),
  };
}

/**
 * The single action worth skipping the menu for, or null.
 *
 * Deliberately conservative. A button that does something different every time
 * is worse than one that always opens a menu, so this only returns an action
 * when there is a real reason to: something is waiting (a duel invite, an
 * unclaimed daily), or the athlete has a clear habit and has not trained yet.
 * A tie, a fresh account, or a day already trained all fall through to the menu.
 */
function pickPrimary({
  order,
  isPro,
  pendingDuels,
  daily,
}: {
  order: readonly RankedExercise[];
  isPro: boolean;
  pendingDuels: number;
  daily: { exercise: ExerciseId; done: boolean };
}): FabPrimary | null {
  // Someone is waiting on a reply — that outranks starting a set alone.
  if (pendingDuels > 0) return { kind: 'duel' };

  // An unclaimed daily challenge, as long as the athlete can actually do it.
  if (!daily.done && canStartExercise(isPro, daily.exercise)) {
    return { kind: 'daily', exercise: daily.exercise };
  }

  const [first, second] = order;
  if (!first || first.locked || first.doneToday) return null;
  // No history to go on, or no clear favourite — open the menu instead of
  // guessing. `>` not `>=` so an exact tie is treated as no preference.
  if (first.recentCount === 0) return null;
  if (second && !second.doneToday && second.recentCount >= first.recentCount) return null;

  return { kind: 'exercise', exercise: first.exercise };
}

/** `YYYY-MM-DD` shifted by whole days, matching `dayKey()`'s format. */
function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
