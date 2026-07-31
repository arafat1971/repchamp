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
  LOCAL_USER,
  onAuthChange,
  signOut as authSignOut,
  type AuthUser,
} from '@/services/auth';
import {
  hydrateSessionsFromCloudProgress,
  mergeProgrammeProgress,
} from '@/domain/cloudProgress';
import {
  buildCloudProgressSlice,
  fetchProfile,
  upsertProfile,
  publishScore,
  removeScore,
  uploadAvatar,
} from '@/services/userService';
import { useProfileStore, selectWeeklyXp, selectLevel, selectLeague } from '@/state/profileStore';
import { useSettingsStore } from '@/state/settingsStore';
import type { SessionSummary } from '@/state/profileStore';

export type SyncStatus = 'idle' | 'signing-in' | 'syncing' | 'synced' | 'error';

interface AuthState {
  user: AuthUser | null;
  status: SyncStatus;
  /** True once the initial auth resolution has completed (avoids UI flicker). */
  ready: boolean;
  configured: boolean;
  /**
   * Last uid we synced — survives `user: null` during sign-out so the next
   * account cannot Math.max-merge the previous profile.
   */
  lastUid: string | null;

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
  lastUid: null,

  /**
   * Wire up auth. Call once from the root layout; returns an unsubscribe.
   * Ensures an (anonymous) account exists, then pulls the cloud profile and
   * reconciles it with local state — higher values win, so a fresh reinstall
   * that signs into an existing account recovers XP and personal bests.
   */
  initialize: () => {
    if (!isFirebaseConfigured()) {
      // Keep a stable local identity so screens that need a uid (couple join,
      // queue, self-player) don't spin forever with `user: null`.
      set({ ready: true, status: 'idle', configured: false, user: LOCAL_USER });
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

      const prevUid = get().user?.uid ?? get().lastUid;
      // Crossing onto a different uid (e.g. anon → existing Google/email) must not
      // Math.max local anon XP/sessions onto that account. Same-uid link keeps local.
      if (prevUid && prevUid !== user.uid) {
        useProfileStore.getState().reset();
      }

      set({ user, status: 'syncing', lastUid: user.uid });

      try {
        const cloud = await fetchProfile(user.uid);
        const local = useProfileStore.getState();

        if (cloud) {
          // Reconcile: take the max of numeric progress so neither device regresses.
          // Default local displayName is always "Champion" (truthy) — prefer cloud
          // until this device has finished onboarding with a real handle.
          const localDisplay =
            local.onboarded && local.displayName && local.displayName !== 'Champion'
              ? local.displayName
              : '';
          const cloudOnboarded =
            cloud.onboarded === true ||
            (!!cloud.username && cloud.username !== 'champion');
          const sessions = hydrateSessionsFromCloudProgress(local.sessions, cloud) as SessionSummary[];
          useProfileStore.setState({
            onboarded: local.onboarded || cloudOnboarded,
            username: local.username || cloud.username,
            displayName: localDisplay || cloud.displayName || local.displayName,
            // Once onboarded, honor a local clear (null) — don't resurrect cloud avatar.
            avatarUri: local.onboarded
              ? local.avatarUri
              : (local.avatarUri ?? cloud.avatarUrl),
            weeklyGoal: local.weeklyGoal || cloud.weeklyGoal,
            totalXp: Math.max(local.totalXp, cloud.totalXp),
            personalBests: mergeBests(local.personalBests, cloud.personalBests),
            pairingBonusClaimed:
              local.pairingBonusClaimed || !!cloud.pairingBonusClaimed,
            pairingBonusUntil: Math.max(
              local.pairingBonusUntil,
              typeof cloud.pairingBonusUntil === 'number' ? cloud.pairingBonusUntil : 0,
            ),
            sessions,
            programme: mergeProgrammeProgress(local.programme, cloud.programme ?? null),
          });
        }

        await get().pushProfile();
        // `pushProfile` sets 'error' itself when the cloud write was rejected,
        // so don't overwrite that with 'synced' — it reports what actually
        // happened, and this line used to paper over it.
        set((s) => ({
          status: s.status === 'error' ? 'error' : 'synced',
          ready: true,
        }));
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
    const progress = buildCloudProgressSlice({
      sessions: p.sessions,
      programme: p.programme,
    });

    try {
      // `upsertProfile` reports a rejected write by returning false rather
      // than throwing (see its catch), so ignoring the result meant a denied
      // write — rules, App Check, a bad username claim — left `status` on
      // 'synced' while the athlete's XP quietly stopped mirroring to the
      // cloud. Treat it as the failure it is.
      const saved = await upsertProfile({
        uid: user.uid,
        username: (p.username || 'champion').toLowerCase(),
        displayName: p.displayName,
        avatarUrl: p.avatarUri,
        weeklyGoal: p.weeklyGoal,
        totalXp: p.totalXp,
        personalBests: p.personalBests,
        onboarded: p.onboarded,
        pairingBonusClaimed: p.pairingBonusClaimed,
        pairingBonusUntil: p.pairingBonusUntil,
        trainedDays: progress.trainedDays,
        weekKey: progress.weekKey,
        weekXp: progress.weekXp,
        weekExerciseReps: progress.weekExerciseReps,
        programme: progress.programme,
      });

      if (!saved) {
        // Local state is untouched, so nothing is lost — the next sync
        // retries. Surfacing it keeps the UI honest in the meantime.
        set({ status: 'error' });
        return;
      }

      // A private profile means private: pull the row out of the ranked
      // collection entirely rather than just hiding it in the local UI.
      if (useSettingsStore.getState().privateProfile) {
        await removeScore(user.uid);
      } else {
        await publishScore({
          uid: user.uid,
          displayName: p.displayName,
          avatarUrl: p.avatarUri,
          weeklyXp,
          totalXp: p.totalXp,
          level,
          league,
        });
      }
    } catch {
      // Offline / App Check / transient — keep local state; next sync retries.
      set({ status: 'error' });
    }
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
    const uid = get().user?.uid ?? get().lastUid;
    await authSignOut();
    // Keep lastUid so the next anon/account still triggers a cross-uid reset.
    set({ user: null, status: 'idle', lastUid: uid });
  },
}));

function mergeBests<T extends Record<string, number>>(a: T, b: T): T {
  const out = { ...a };
  for (const k of Object.keys(b)) {
    out[k as keyof T] = Math.max(a[k] ?? 0, b[k] ?? 0) as T[keyof T];
  }
  return out;
}
