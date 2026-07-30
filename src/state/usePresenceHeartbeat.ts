/**
 * Presence heartbeat — stamps `users/{uid}.lastActiveAt` while the app is open
 * so friends can see who's active. No-ops when Firebase isn't configured.
 */

import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { touchPresence } from '@/services/userService';

const HEARTBEAT_MS = 60_000;

export function usePresenceHeartbeat(uid: string | undefined): void {
  useEffect(() => {
    if (!uid) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const beat = () => {
      if (!cancelled) void touchPresence(uid);
    };

    const arm = (state: AppStateStatus) => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (state !== 'active') return;
      beat();
      timer = setInterval(beat, HEARTBEAT_MS);
    };

    arm(AppState.currentState);
    const sub = AppState.addEventListener('change', arm);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      sub.remove();
    };
  }, [uid]);
}
