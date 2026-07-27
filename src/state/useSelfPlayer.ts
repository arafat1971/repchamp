/**
 * The current athlete's identity as a duel participant.
 *
 * `createDuel`/`joinDuel` need a uid, display name, avatar and level to seat the
 * player. Those live across the auth store (uid) and the profile store (the rest);
 * this hook assembles them in one place so the lobby screens don't each reach
 * into two stores. Returns null until an account exists (i.e. Firebase is
 * configured and signed in) — the caller falls back to a bot duel.
 */

import { selectLevel, useProfileStore } from '@/state/profileStore';
import { useAuthStore } from '@/state/authStore';

export interface SelfPlayer {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
}

export function useSelfPlayer(): SelfPlayer | null {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const displayName = useProfileStore((s) => s.displayName);
  const avatarUrl = useProfileStore((s) => s.avatarUri);
  const totalXp = useProfileStore((s) => s.totalXp);

  if (!uid) return null;
  return {
    uid,
    displayName: displayName || 'Champion',
    avatarUrl,
    level: selectLevel({ totalXp }).level,
  };
}
