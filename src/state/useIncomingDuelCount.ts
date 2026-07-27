/**
 * The number of pending challenges awaiting this athlete — the source for the
 * notifications-bell badge.
 *
 * Thin wrapper over `fetchIncomingDuels`: reads the current uid, counts the open
 * targeted duels, and refetches whenever the screen regains focus so the badge
 * clears once the athlete has opened the inbox and accepted (or the challenges
 * lapse). Returns 0 when Firebase is unconfigured, so the badge simply never
 * shows in the local-only build.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { fetchIncomingDuels } from '@/services/duelService';
import { useAuthStore } from '@/state/authStore';

export function useIncomingDuelCount(): number {
  const uid = useAuthStore((s) => s.user?.uid);
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!uid) {
        setCount(0);
        return;
      }
      let cancelled = false;
      void fetchIncomingDuels(uid).then((list) => {
        if (!cancelled) setCount(list.length);
      });
      return () => {
        cancelled = true;
      };
    }, [uid]),
  );

  return count;
}
