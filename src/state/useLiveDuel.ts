/**
 * Live-duel wiring for the session screen.
 *
 * The session screen (app/session/index.tsx) drives a duel against a bot
 * `OpponentPacer` by default. When the screen is opened with a `duelId` — a real
 * 1v1 match created/joined through `duelService` — this hook takes over the
 * opponent side: it streams the athlete's own reps up to their Firestore seat a
 * few times a second, subscribes to the opposing seat and pushes those reps into
 * the session store (the same `setOpponentReps` the pacer feeds), and settles the
 * duel when the set ends. With no `duelId` it is inert and the bot path runs
 * unchanged.
 *
 * Everything is guarded by `duelService`, which no-ops when Firebase isn't
 * configured — so even a stray `duelId` degrades to the bot rather than throwing.
 */

import { useCallback, useEffect, useRef } from 'react';

import {
  DUEL_SYNC_INTERVAL_MS,
  type Duel,
  type DuelSeat,
} from '@/domain/duel';
import {
  finishDuel,
  pushLiveState,
  watchDuel,
} from '@/services/duelService';
import { useAuthStore } from '@/state/authStore';
import { useSessionStore } from '@/state/sessionStore';

export interface LiveDuel {
  /** True while a live duel is driving the opponent (vs. the bot pacer). */
  active: boolean;
  /** Stream the athlete's current reps/form up to their seat, throttled. */
  push: (reps: number, formScore: number) => void;
  /** Settle the duel when the set ends (clock out or forfeit). */
  finish: (reps: number, formScore: number, forfeited: boolean) => void;
}

const INERT: LiveDuel = { active: false, push: () => {}, finish: () => {} };

/**
 * Wire a live duel identified by `duelId`, or return an inert controller when
 * there is none. Subscribes to the opponent's seat and mirrors it into
 * `setOpponentReps` for the duration of the mount.
 */
export function useLiveDuel(duelId: string | null | undefined): LiveDuel {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const seatRef = useRef<DuelSeat | null>(null);
  const lastPushRef = useRef<number>(0);
  const finishedRef = useRef(false);

  // Subscribe to the duel doc: resolve our seat once, and mirror the opponent's
  // live reps into the session store so the HUD renders the real rival.
  useEffect(() => {
    if (!duelId || !uid) return;
    finishedRef.current = false;

    const unsub = watchDuel(duelId, (duel: Duel | null) => {
      if (!duel) return;
      const seat: DuelSeat | null =
        duel.hostUid === uid ? 'host' : duel.guestUid === uid ? 'guest' : null;
      seatRef.current = seat;
      if (!seat) return;

      const other = seat === 'host' ? duel.guest : duel.host;
      if (other) {
        useSessionStore.getState().setOpponentReps(other.reps);
        // Surface the real rival's name so the result screen labels the score
        // with them instead of the default bot opponent.
        if (other.displayName) useSessionStore.getState().setOpponentName(other.displayName);
      }
    });

    return unsub;
  }, [duelId, uid]);

  const push = useCallback(
    (reps: number, formScore: number) => {
      const seat = seatRef.current;
      if (!duelId || !seat) return;
      // Throttle to the sync budget from duel.ts; the clock ticks faster than we
      // want to write, and a dropped intermediate value is harmless.
      const now = elapsedTicks();
      if (now - lastPushRef.current < DUEL_SYNC_INTERVAL_MS) return;
      lastPushRef.current = now;
      void pushLiveState(duelId, seat, { reps, formScore });
    },
    [duelId],
  );

  const finish = useCallback(
    (reps: number, formScore: number, forfeited: boolean) => {
      const seat = seatRef.current;
      if (!duelId || !seat || finishedRef.current) return;
      finishedRef.current = true;
      void finishDuel(duelId, seat, { reps, formScore, forfeited });
    },
    [duelId],
  );

  if (!duelId || !uid) return INERT;
  return { active: true, push, finish };
}

/**
 * A monotonic millisecond counter for throttling.
 *
 * `Date.now()` is fine here — this is throttle bookkeeping, not the duel clock
 * (which is elapsed-time based and lives in the session screen). Extracted so
 * the intent is explicit and a future switch to `performance.now()` is one edit.
 */
function elapsedTicks(): number {
  return Date.now();
}
