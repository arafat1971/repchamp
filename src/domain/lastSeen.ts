/**
 * How recently a friend was around, as a short human label.
 *
 * `online` is the app's own presence flag (a recent heartbeat); `lastActiveAt`
 * is the last stamp. They can disagree for a moment either side of the window,
 * so `online` wins: someone shown as active is never also "2h ago".
 */
export function lastSeenLabel(
  online: boolean,
  lastActiveAt: number | null | undefined,
  now: number = Date.now(),
): string {
  if (online) return 'Active now';
  if (!lastActiveAt || lastActiveAt > now) return 'Offline';
  const mins = Math.floor((now - lastActiveAt) / 60_000);
  if (mins < 1) return 'Active just now';
  if (mins < 60) return `Active ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Active yesterday';
  if (days < 7) return `Active ${days}d ago`;
  return 'Offline';
}
