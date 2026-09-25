import { useEffect, useState } from 'react';

import { isCloudSafeAvatarUrl } from '@/domain/safety';
import { fetchProfile } from '@/services/userService';

/* One read per athlete per app run. Avatars change rarely, and Home re-renders
   constantly; without this every render path would refetch the profile. */
const cache = new Map<string, string | null>();

/** A URL another phone can actually load — not a `file://` from someone's sandbox. */
function usable(url: string | null | undefined): url is string {
  return !!url && isCloudSafeAvatarUrl(url);
}

/**
 * Someone else's avatar, as their public profile has it now.
 *
 * The couple document snapshots each member's avatar at pairing time, which
 * is often null (no photo yet) or a local `file://` path from the other phone
 * that can never load here. The profile doc holds the current, cloud-safe
 * copy (a base64 data URI since Storage was dropped), so fall back to it
 * whenever the snapshot is not usable.
 */
export function usePublicAvatar(uid: string | null | undefined, snapshot?: string | null): string | null {
  const known = usable(snapshot) ? snapshot : null;
  /* The cache is the state; this only re-renders once a fetch lands. */
  const [, setLoaded] = useState(0);

  useEffect(() => {
    if (known || !uid || cache.has(uid)) return;
    let cancelled = false;
    void fetchProfile(uid).then((profile) => {
      cache.set(uid, usable(profile?.avatarUrl) ? profile!.avatarUrl : null);
      if (!cancelled) setLoaded((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, known]);

  return known ?? (uid ? (cache.get(uid) ?? null) : null);
}
