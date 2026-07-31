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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DUEL_SYNC_INTERVAL_MS,
  duelStartedAtMs,
  type Duel,
  type DuelSeat,
} from '@/domain/duel';
import { clampDuelRepJump } from '@/domain/fairPlay';
import {
  fetchDuel,
  finishDuel,
  pushDuelPhoto,
  pushLiveState,
  seatFor,
  watchDuel,
} from '@/services/duelService';
import { useAuthStore } from '@/state/authStore';
import { useSessionStore } from '@/state/sessionStore';

export interface LiveDuel {
  /** True while a live duel is driving the opponent (vs. the bot pacer). */
  active: boolean;
  /** Shared match origin from `duel.startedAt`, or null until the watch lands. */
  matchStartedAtMs: number | null;
  /** Stream the athlete's current reps/form up to their seat, throttled. */
  push: (reps: number, formScore: number) => void;
  /** Settle the duel when the set ends (clock out or forfeit). */
  finish: (reps: number, formScore: number, forfeited: boolean) => void;
  /** Upload this athlete's captured action shot once the set ends. */
  pushPhoto: (localUri: string) => void;
}

const INERT: LiveDuel = {
  active: false,
  matchStartedAtMs: null,
  push: () => {},
  finish: () => {},
  pushPhoto: () => {},
};

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
  const [matchStartedAtMs, setMatchStartedAtMs] = useState<number | null>(null);

  useEffect(() => {
    if (!duelId || !uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMatchStartedAtMs(null);
      return;
    }
    finishedRef.current = false;
    lastSentRepsRef.current = 0;
    setMatchStartedAtMs(null);

    const unsub = watchDuel(duelId, (duel: Duel | null) => {
      if (!duel) return;
      const startMs = duelStartedAtMs(duel);
      if (startMs != null) setMatchStartedAtMs(startMs);

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
        // Never rewind the HUD on a stale snapshot.
        const prev = useSessionStore.getState().opponentReps;
        useSessionStore.getState().setOpponentReps(Math.max(prev, other.reps));
        if (other.displayName) useSessionStore.getState().setOpponentName(other.displayName);
        if (other.photoUrl) useSessionStore.getState().setOpponentSnapshotUri(other.photoUrl);
      }
      // Persist the remote uid so H2H history and rematch can address them.
      const otherUid = seat === 'host' ? duel.guestUid : duel.hostUid;
      if (otherUid) useSessionStore.getState().setOpponentId(otherUid);
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
      // Only advance the fair baseline after a successful write — a failed push
      // used to jump the baseline and brick later ticks against the +8 rule.
      void pushLiveState(duelId, seat, { reps: fairReps, formScore }).then((ok) => {
        if (ok) lastSentRepsRef.current = Math.max(lastSentRepsRef.current, fairReps);
      });
    },
    [duelId],
  );

  const finish = useCallback(
    (reps: number, formScore: number, forfeited: boolean) => {
      if (!duelId || !uid || finishedRef.current) return;
      // Latch immediately so a re-entrant finish effect cannot double-settle.
      finishedRef.current = true;

      void (async () => {
        let seat = seatRef.current;
        if (!seat) {
          // Watch snapshot may not have landed yet — one-shot resolve.
          const duel = await fetchDuel(duelId);
          seat = duel ? seatFor(duel, uid) : null;
          if (seat) seatRef.current = seat;
        }
        if (!seat) {
          // Allow a later retry if the athlete is somehow still finishing.
          finishedRef.current = false;
          return;
        }
        const ok = await finishDuel(duelId, seat, { reps, formScore, forfeited });
        if (!ok) {
          // Write failed (offline / transient) — clear latch so a remount or
          // re-run of the finish handoff can settle the cloud duel.
          finishedRef.current = false;
        }
      })();
    },
    [duelId, uid],
  );

  const pushPhoto = useCallback(
    (localUri: string) => {
      if (!duelId || !uid) return;
      void (async () => {
        let seat = seatRef.current;
        if (!seat) {
          const duel = await fetchDuel(duelId);
          seat = duel ? seatFor(duel, uid) : null;
        }
        if (!seat) return;
        void pushDuelPhoto(duelId, seat, localUri);
      })();
    },
    [duelId, uid],
  );

  return useMemo(() => {
    if (!duelId || !uid) return INERT;
    return { active: true, matchStartedAtMs, push, finish, pushPhoto };
  }, [duelId, uid, matchStartedAtMs, push, finish, pushPhoto]);
}
