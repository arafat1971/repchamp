/**
 * `recordSession` + the retention signal, as one call.
 *
 * The events themselves were only ever emitted from the result screen's normal
 * finish. But `recordSession` has four call sites, and the other three are all
 * live-duel settle paths — cold resume, the detached settle while the result
 * screen is open, and the force-bank before an MMKV wipe. Each of those banks a
 * real training day that extends a real streak and can move a real league, and
 * each emitted nothing.
 *
 * That under-counting was not random. It landed only on versus sessions, which
 * is exactly the comparison the instrumentation was built to make: whether
 * couple and duel streaks retain better than solo, the premise the viral loop
 * rests on. Left alone, the data would have read "solo retains better" as an
 * artifact of which code path happened to bank the set.
 *
 * The ordering is the subtle part, and the reason this is one helper rather
 * than three pasted blocks: `streakOutcome` needs the training days as they
 * were *before* the write, and a league is only "changed" relative to what it
 * was a moment ago. Emitting after the write compares the new state with
 * itself and silently reports nothing — which looks identical to a quiet day.
 *
 * Safe to call from a settle bank callback: `armLiveResultSettle` latches on
 * `settled`/`banked` before invoking `onBank`, and `forceBankPendingLiveSettles`
 * skips anything already banked, so a replay cannot emit twice.
 */

import { LEAGUES } from '@/domain/progression';
import { leagueMove, streakOutcome } from '@/domain/retention';
import { track } from '@/lib/analytics';
import {
  selectLeague,
  useProfileStore,
  type SessionSummary,
} from '@/state/profileStore';

type SessionInput = Omit<SessionSummary, 'id' | 'completedAt' | 'day'>;

/**
 * Record a session and emit whatever it did to the streak and the ladder.
 *
 * Returns the stored summary, exactly as `recordSession` does, so this is a
 * drop-in at every call site.
 */
export function recordSessionWithRetention(input: SessionInput): SessionSummary {
  const store = useProfileStore.getState();

  // Read before the write — see the note above on why the order matters.
  const beforeDays = store.sessions.map((s) => s.day);
  const beforeLeague = selectLeague(store).id;

  const summary = store.recordSession(input);

  // A zero-rep set is not a training day: `recordSession` skips history and
  // streak for it, so there is nothing to report and the league cannot move.
  if (summary.reps <= 0) return summary;

  emitRetention(beforeDays, beforeLeague);
  return summary;
}

/**
 * The emit half, for callers that must do their own `recordSession` (the
 * settle paths pass fields assembled from an outbox record plus a bank payload
 * and cannot hand over a single input object). Call with the snapshot taken
 * before the write.
 */
export function emitRetention(
  beforeDays: readonly string[],
  beforeLeague: string | null,
): void {
  /* A second set on a day already trained reports `same-day` and emits
     nothing — three sets in an evening are one day of retention, not three. */
  const streak = streakOutcome(beforeDays);
  if (streak.kind === 'continued') {
    track('streak_continued', { length: streak.length, previous: streak.previous });
  } else if (streak.kind === 'broken') {
    track('streak_broken', {
      length: streak.length,
      previous: streak.previous,
      daysMissed: streak.previous,
    });
  }

  const move = leagueMove(
    beforeLeague,
    selectLeague(useProfileStore.getState()).id,
    LEAGUES.map((l) => l.id),
  );
  if (move.kind !== 'unchanged') {
    track('league_promoted', { from: move.from, to: move.to, direction: move.kind });
  }
}

/**
 * Snapshot the fields the retention signal needs, before a write.
 *
 * The settle callbacks build their `recordSession` argument inline from an
 * outbox record and a bank payload, so they take this first and hand it to
 * `emitRetention` afterwards.
 */
export function retentionSnapshot(): { days: string[]; league: string } {
  const store = useProfileStore.getState();
  return {
    days: store.sessions.map((s) => s.day),
    league: selectLeague(store).id,
  };
}
