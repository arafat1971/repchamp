/**
 * Presence heartbeat — stamps `users/{uid}.lastActiveAt` while the app is open
 * so friends can see who's active. No-ops when Firebase isn't configured.
 */

import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { touchPresence } from '@/services/userService';
import { useSettingsStore } from '@/state/settingsStore';

const HEARTBEAT_MS = 60_000;

export function usePresenceHeartbeat(uid: string | undefined): void {
  const share = useSettingsStore((s) => s.shareActivity);
  useEffect(() => {
    if (!uid) return;

    // Sharing is off: write the hidden stamp once (touchPresence publishes 0
    // in that state) and never arm the timer. Flipping the setting re-runs this
    // effect, so turning it off hides the athlete straight away and turning it
    // back on resumes the heartbeat.
    if (!share) {
      void touchPresence(uid);
      return;
    }

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
  }, [uid, share]);
}
