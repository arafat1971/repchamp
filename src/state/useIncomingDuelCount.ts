/**
 * Challenge-inbox sync: badge count + local invite banners.
 *
 * Remote push still needs a server-readable Expo token (private today), so the
 * inbox + this local banner is the honest path. Polling runs app-wide (not only
 * while Home is focused) so invites still surface on Friends/Train/background→foreground.
 * Deduped in MMKV so polls never spam.
 */

import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { presentChallengeInvite } from '@/lib/notifications';
import { storage } from '@/lib/storage';
import { fetchIncomingDuels } from '@/services/duelService';
import { useAuthStore } from '@/state/authStore';
import { useSettingsStore } from '@/state/settingsStore';

const SEEN_KEY = 'repchamp.notif.seenChallenges';
const POLL_MS = 45_000;

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

interface IncomingDuelStore {
  count: number;
  setCount: (n: number) => void;
}

const useIncomingStore = create<IncomingDuelStore>((set) => ({
  count: 0,
  setCount: (count) => set({ count }),
}));

/** Badge count for Home / friends chrome — populated by `useChallengeInviteSync`. */
export function useIncomingDuelCount(): number {
  return useIncomingStore((s) => s.count);
}

/**
 * Mount once at the app root while signed in. Polls the inbox, updates the
 * badge store, and presents local banners for newly arrived challenges.
 */
export function useChallengeInviteSync(): void {
  const uid = useAuthStore((s) => s.user?.uid);
  const duelInvites = useSettingsStore((s) => s.duelInvites);
  const setCount = useIncomingStore((s) => s.setCount);
  const bootstrapped = useRef(false);

  const refresh = useCallback(async () => {
    if (!uid) {
      setCount(0);
      return;
    }
    try {
      const list = await fetchIncomingDuels(uid);
      setCount(list.length);

      if (!duelInvites) {
        bootstrapped.current = true;
        return;
      }

      const seen = readSeen();
      // First snapshot only seeds — don't notify for invites that were already
      // waiting when the athlete opened the app.
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
    } catch {
      // Offline — keep the last count.
    }
  }, [uid, duelInvites, setCount]);

  useEffect(() => {
    bootstrapped.current = false;
    if (!uid) {
      setCount(0);
      return;
    }

    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, POLL_MS);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [uid, refresh, setCount]);
}
