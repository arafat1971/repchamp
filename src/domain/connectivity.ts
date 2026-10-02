/**
 * Is the device offline? Pure, so the rule is testable without the native module.
 *
 * `null` means "not known yet" — NetInfo reports it for the first moments after
 * launch and while it probes reachability. Treating unknown as offline would
 * flash an "offline" banner at every cold start, so only an explicit `false`
 * counts. `isInternetReachable` matters on its own: a phone joined to wifi with
 * no uplink reports `isConnected: true` and `isInternetReachable: false`, which
 * is exactly the case where every Firestore read fails.
 */
export interface ConnectivitySnapshot {
  isConnected: boolean | null;
  isInternetReachable?: boolean | null;
}

export function isOffline(state: ConnectivitySnapshot): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

/**
 * Wording for a failed fetch. While offline the cause is known, so say it —
 * "check your connection" on a screen the banner already explained is noise,
 * and the generic line is wrong when the device is online and the server failed.
 */
export function loadFailureMessage(offline: boolean, online: string): string {
  return offline ? "You're offline. This will load when you're back online." : online;
}
