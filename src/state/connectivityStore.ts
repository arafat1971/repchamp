import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { create } from 'zustand';

import { isOffline } from '@/domain/connectivity';

interface ConnectivityState {
  offline: boolean;
  /** Bumps on every offline → online edge, so screens can re-run their loads. */
  reconnects: number;
}

export const useConnectivityStore = create<ConnectivityState>(() => ({ offline: false, reconnects: 0 }));

/** Reactive flag for screens: true only when the device is known to be offline. */
export function useOffline(): boolean {
  return useConnectivityStore((s) => s.offline);
}

/** Changes each time the connection comes back; use as an effect dependency. */
export function useReconnectCount(): number {
  return useConnectivityStore((s) => s.reconnects);
}

/** Non-reactive read, for service code that cannot use a hook. */
export function isDeviceOffline(): boolean {
  return useConnectivityStore.getState().offline;
}

/**
 * Follow connectivity for the life of the app. `onReconnect` fires on the
 * offline → online edge only, which is when queued work (couple credits,
 * pending duel settles) is worth retrying — retrying on every change event
 * would hammer a flapping connection.
 */
export function startConnectivityWatch(onReconnect?: () => void): () => void {
  return NetInfo.addEventListener((state: NetInfoState) => {
    const next = isOffline(state);
    const was = useConnectivityStore.getState().offline;
    if (next !== was) {
      useConnectivityStore.setState((s) => ({
        offline: next,
        reconnects: was && !next ? s.reconnects + 1 : s.reconnects,
      }));
    }
    if (was && !next) onReconnect?.();
  });
}
