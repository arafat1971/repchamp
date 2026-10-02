import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { PENDING_INVITE_KEY, serializeInvite, type PendingInvite } from '@/domain/pendingInvite';
import { storage } from '@/lib/storage';
import { useProfileStore } from '@/state/profileStore';

/**
 * For an invite-link landing screen: when the athlete has not finished
 * onboarding, park the link and send them through onboarding first. It is
 * replayed when onboarding finishes (see `finish` in `app/onboarding.tsx`).
 *
 * Returns true while deferring, so the screen can skip its own work — a couple
 * link must not join with the placeholder "Champion" profile.
 */
export function useDeferInvite(invite: PendingInvite | null): boolean {
  const router = useRouter();
  const onboarded = useProfileStore((s) => s.onboarded);
  const defer = !onboarded && invite != null;
  const key = invite ? JSON.stringify(invite) : '';

  useEffect(() => {
    if (!defer || !invite) return;
    storage.set(PENDING_INVITE_KEY, serializeInvite(invite, Date.now()));
    router.replace('/onboarding');
    // `key` stands in for `invite`, which is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defer, key, router]);

  return defer;
}
