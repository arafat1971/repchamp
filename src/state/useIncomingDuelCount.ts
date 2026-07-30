/**
 * Surfaces challenge invites as a single local notification per duel id.
 *
 * Remote push to a friend still needs their Expo token (private today), so the
 * inbox + this banner when the app can present is the honest path. Deduped in
 * MMKV so focus refetches never spam.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { presentChallengeInvite } from '@/lib/notifications';
import { storage } from '@/lib/storage';
import { fetchIncomingDuels } from '@/services/duelService';
import { useAuthStore } from '@/state/authStore';
import { useSettingsStore } from '@/state/settingsStore';

const SEEN_KEY = 'repchamp.notif.seenChallenges';

function readSeen(): Set<string> {
  try {
    const raw = storage.getString(SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeSeen(ids: Set<string>): void {
  const trimmed = [...ids].slice(-40);
  storage.set(SEEN_KEY, JSON.stringify(trimmed));
}

export function useIncomingDuelCount(): number {
  const uid = useAuthStore((s) => s.user?.uid);
  const duelInvites = useSettingsStore((s) => s.duelInvites);
  const [count, setCount] = useState(0);
  const bootstrapped = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!uid) {
        setCount(0);
        return;
      }
      let cancelled = false;
      void fetchIncomingDuels(uid).then((list) => {
        if (cancelled) return;
        setCount(list.length);

        if (!duelInvites) {
          bootstrapped.current = true;
          return;
        }

        const seen = readSeen();
        // First snapshot only seeds — don't notify for invites that were
        // already waiting when the athlete opened the app.
        if (!bootstrapped.current) {
          for (const d of list) seen.add(d.id);
          writeSeen(seen);
          bootstrapped.current = true;
          return;
        }

        for (const d of list) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          void presentChallengeInvite({
            duelId: d.id,
            fromName: d.hostName,
            kind: d.kind,
          });
        }
        writeSeen(seen);
      });
      return () => {
        cancelled = true;
      };
    }, [uid, duelInvites]),
  );

  return count;
}
