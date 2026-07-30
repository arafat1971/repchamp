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

import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  DUEL_SYNC_INTERVAL_MS,
  type Duel,
  type DuelSeat,
} from '@/domain/duel';
import { clampDuelRepJump } from '@/domain/fairPlay';
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
 *
 * The returned object identity is stable across renders (memoised) so session
 * effects that depend on it do not restart the duel clock every tick — that
 * reset was a mid-set crash/ANR class bug on live matches.
 */
export function useLiveDuel(duelId: string | null | undefined): LiveDuel {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const seatRef = useRef<DuelSeat | null>(null);
  const lastPushAtRef = useRef<number>(0);
  /** Last reps value we intended for the cloud seat (fair-jump baseline). */
  const lastSentRepsRef = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!duelId || !uid) return;
    finishedRef.current = false;
    lastSentRepsRef.current = 0;

    const unsub = watchDuel(duelId, (duel: Duel | null) => {
      if (!duel) return;
      const seat: DuelSeat | null =
        duel.hostUid === uid ? 'host' : duel.guestUid === uid ? 'guest' : null;
      seatRef.current = seat;
      if (!seat) return;

      const mine = seat === 'host' ? duel.host : duel.guest;
      if (mine && typeof mine.reps === 'number') {
        lastSentRepsRef.current = Math.max(lastSentRepsRef.current, mine.reps);
      }

      const other = seat === 'host' ? duel.guest : duel.host;
      if (other) {
        useSessionStore.getState().setOpponentReps(other.reps);
        if (other.displayName) useSessionStore.getState().setOpponentName(other.displayName);
      }
    });

    return unsub;
  }, [duelId, uid]);

  const push = useCallback(
    (reps: number, formScore: number) => {
      const seat = seatRef.current;
      if (!duelId || !seat || finishedRef.current) return;
      const now = Date.now();
      if (now - lastPushAtRef.current < DUEL_SYNC_INTERVAL_MS) return;
      lastPushAtRef.current = now;
      const fairReps = clampDuelRepJump(lastSentRepsRef.current, reps);
      lastSentRepsRef.current = fairReps;
      void pushLiveState(duelId, seat, { reps: fairReps, formScore });
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

  return useMemo(() => {
    if (!duelId || !uid) return INERT;
    return { active: true, push, finish };
  }, [duelId, uid, push, finish]);
}
