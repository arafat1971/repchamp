/**
 * Auth + cloud-sync store.
 *
 * Owns the athlete's signed-in identity and orchestrates the two-way sync
 * between the local `profileStore` (source of truth for gameplay, offline-first)
 * and Firestore (durable cross-device mirror). Deliberately thin: it reacts to
 * auth changes, pulls the cloud profile on sign-in, and pushes the durable
 * slice whenever the local profile meaningfully changes.
 *
 * Everything degrades to a local-only no-op when Firebase isn't configured, so
 * the app behaves identically before provisioning — just without the cloud
 * mirror. See src/lib/firebase.ts and FIREBASE_SETUP.md.
 */

import { create } from 'zustand';

import { isFirebaseConfigured } from '@/lib/firebase';
import {
  ensureSignedIn,
  onAuthChange,
  signOut as authSignOut,
  type AuthUser,
} from '@/services/auth';
import {
  fetchProfile,
  upsertProfile,
  publishScore,
  uploadAvatar,
} from '@/services/userService';
import { useProfileStore, selectWeeklyXp, selectLevel, selectLeague } from '@/state/profileStore';

export type SyncStatus = 'idle' | 'signing-in' | 'syncing' | 'synced' | 'error';

interface AuthState {
  user: AuthUser | null;
  status: SyncStatus;
  /** True once the initial auth resolution has completed (avoids UI flicker). */
  ready: boolean;
  configured: boolean;

  initialize: () => () => void;
  pushProfile: () => Promise<void>;
  syncAvatar: (localUri: string) => Promise<string>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  status: 'idle',
  ready: false,
  configured: isFirebaseConfigured(),

  /**
   * Wire up auth. Call once from the root layout; returns an unsubscribe.
   * Ensures an (anonymous) account exists, then pulls the cloud profile and
   * reconciles it with local state — higher values win, so a fresh reinstall
   * that signs into an existing account recovers XP and personal bests.
   */
  initialize: () => {
    if (!isFirebaseConfigured()) {
      set({ ready: true, status: 'idle', configured: false });
      return () => {};
    }

    set({ status: 'signing-in', configured: true });

    const unsub = onAuthChange(async (user) => {
      if (!user) {
        // Signed out — re-establish an anonymous session so data always has a home.
        try {
          await ensureSignedIn();
        } catch {
          set({ status: 'error', ready: true });
        }
        return;
      }

      set({ user, status: 'syncing' });

      try {
        const cloud = await fetchProfile(user.uid);
        const local = useProfileStore.getState();

        if (cloud) {
          // Reconcile: take the max of numeric progress so neither device regresses.
          useProfileStore.setState({
            username: local.username || cloud.username,
            displayName: local.displayName || cloud.displayName,
            avatarUri: local.avatarUri ?? cloud.avatarUrl,
            weeklyGoal: local.weeklyGoal || cloud.weeklyGoal,
            totalXp: Math.max(local.totalXp, cloud.totalXp),
            personalBests: mergeBests(local.personalBests, cloud.personalBests),
          });
        }

        await get().pushProfile();
        set({ status: 'synced', ready: true });
      } catch {
        set({ status: 'error', ready: true });
      }
    });

    void ensureSignedIn().catch(() => set({ status: 'error', ready: true }));
    return unsub;
  },

  /** Push the durable profile slice + weekly leaderboard score. */
  pushProfile: async () => {
    const { user } = get();
    if (!user || !isFirebaseConfigured()) return;

    const p = useProfileStore.getState();
    const weeklyXp = selectWeeklyXp(p);
    const level = selectLevel(p).level;
    const league = selectLeague(p).id;

    await upsertProfile({
      uid: user.uid,
      username: (p.username || 'champion').toLowerCase(),
      displayName: p.displayName,
      avatarUrl: p.avatarUri,
      weeklyGoal: p.weeklyGoal,
      totalXp: p.totalXp,
      personalBests: p.personalBests,
    });

    await publishScore({
      uid: user.uid,
      displayName: p.displayName,
      avatarUrl: p.avatarUri,
      weeklyXp,
      totalXp: p.totalXp,
      level,
      league,
    });
  },

  /** Upload a picked avatar and return the URL to store locally. */
  syncAvatar: async (localUri) => {
    const { user } = get();
    if (!user || !isFirebaseConfigured()) return localUri;
    try {
      return await uploadAvatar(user.uid, localUri);
    } catch {
      return localUri; // Keep the local image if the upload fails.
    }
  },

  signOut: async () => {
    await authSignOut();
    set({ user: null, status: 'idle' });
  },
}));

function mergeBests<T extends Record<string, number>>(a: T, b: T): T {
  const out = { ...a };
  for (const k of Object.keys(b)) {
    out[k as keyof T] = Math.max(a[k] ?? 0, b[k] ?? 0) as T[keyof T];
  }
  return out;
}
