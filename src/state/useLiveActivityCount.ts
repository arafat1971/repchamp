/**
 * Real count for the Home "who's here" pill: online friends + open matchmaking.
 */

import { useEffect, useState } from 'react';

import { fetchActiveFriends } from '@/services/leaderboardService';
import { countWaitingTickets } from '@/services/matchmakingService';
import { useAuthStore } from '@/state/authStore';

export function useLiveActivityCount(): number {
  const uid = useAuthStore((s) => s.user?.uid);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    const refresh = () => {
      void Promise.all([fetchActiveFriends(uid), countWaitingTickets(uid)])
        .then(([friends, waiting]) => {
          if (cancelled) return;
          const online = friends.filter((f) => f.online).length;
          setCount(online + waiting);
        })
        .catch(() => {
          if (!cancelled) setCount(0);
        });
    };

    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [uid]);

  /* Signed out shows nothing without an effect having to zero the state.
     Clearing it in the effect meant a render with the previous athlete's
     count still on screen, then a second render to correct it — a stale badge
     for a frame, and the cascading-render the lint rule is about. */
  return uid ? count : 0;
}
