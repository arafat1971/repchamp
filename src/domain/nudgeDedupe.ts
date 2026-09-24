/**
 * Whether a couple nudge arriving in the foreground is the duplicate to hide.
 *
 * A nudge reaches an open app twice: the Firestore subscription shows it at
 * once as a local notification (`presentNudge`), and the sender's Expo push
 * lands a moment later. Only that second, remote copy is a duplicate.
 *
 * The check used to look only at the type and the time since the in-app
 * nudge was shown — but `presentNudge` stamps that time and then schedules
 * its own notification, which is also a `couple-nudge`. So the app hid its
 * own in-app banner, and a partner with the app open never saw a nudge at
 * all. The local one now carries `local: true` and is never suppressed.
 */
export const IN_APP_NUDGE_DEDUPE_MS = 8_000;

export function isDuplicateNudge(input: {
  type: unknown;
  local: unknown;
  suppressing: boolean;
  msSinceInApp: number;
}): boolean {
  return (
    input.type === 'couple-nudge' &&
    input.local !== true &&
    input.suppressing &&
    input.msSinceInApp < IN_APP_NUDGE_DEDUPE_MS
  );
}
