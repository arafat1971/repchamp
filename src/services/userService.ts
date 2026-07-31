/**
 * User profile service — cloud persistence of the athlete's account.
 *
 * The source of truth for gameplay stays local (the Zustand `profileStore` +
 * MMKV) so the app is instant and offline-first. This service mirrors the
 * durable slice of that state — identity, XP, personal bests, avatar — up to
 * Firestore so it survives reinstalls and syncs across devices. `authStore`
 * owns the push/pull wiring; this module is just typed I/O.
 *
 * All writes are no-ops (resolve immediately) when Firebase isn't configured,
 * so calling code never has to branch.
 */

import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

import { isFirebaseConfigured } from '@/lib/firebase';
import {
  mergeCloudProgressSlice,
  type CloudProgressSlice,
} from '@/domain/cloudProgress';
import { normalizeUsername, sanitizeDisplayName } from '@/domain/input';
import { clampWeeklyXp } from '@/domain/fairPlay';
import { isCloudSafeAvatarUrl } from '@/domain/safety';
import { isoWeekKey } from '@/domain/weeklyChallenge';
import type { ProgrammeProgress } from '@/domain/programme';
import type { ExerciseId } from '@/vision/exercises';

export { buildCloudProgressSlice } from '@/domain/cloudProgress';

/** The durable, cloud-synced projection of a user. */
export interface CloudProfile {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  weeklyGoal: number;
  totalXp: number;
  personalBests: Record<ExerciseId, number>;
  /** Server timestamp of last write — used to resolve local-vs-cloud on sync. */
  updatedAt: number;
  /** Millisecond stamp of first profile create — powers "New on RepChamp". */
  createdAt?: number;
  /** Millisecond heartbeat — powers Friends "Active now" and the Home pill. */
  lastActiveAt?: number;
  /** True once onboarding finished on any device — skip the wizard on reinstall. */
  onboarded?: boolean;
  /** Lifetime latch for the couple pairing Pro week (anti-farm across devices). */
  pairingBonusClaimed?: boolean;
  /** Epoch ms until local pairing Pro remains active (max across devices). */
  pairingBonusUntil?: number;
  /** Compact history for streak / weekly UI / programme after reinstall. */
  trainedDays?: string[];
  weekKey?: string;
  weekXp?: number;
  weekExerciseReps?: Partial<Record<ExerciseId, number>>;
  programme?: ProgrammeProgress | null;
}

const USERS = 'users';

function usersCol() {
  return firestore().collection(USERS);
}

/** Read a profile once. Returns null if unconfigured or not yet created. */
export async function fetchProfile(uid: string): Promise<CloudProfile | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const snap = await usersCol().doc(uid).get();
    if (!snap.exists()) return null;
    return snap.data() as CloudProfile;
  } catch {
    return null;
  }
}

/**
 * Store this device's Expo push token in an owner-only private doc — never on
 * the world-readable profile — so strangers cannot harvest tokens for spam.
 *
 * Couple nudges read the partner's token from the couple member object instead
 * (see `syncCouplePushToken` / `nudgePartner`).
 */
export async function saveExpoPushToken(uid: string, token: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const ref = usersCol().doc(uid);
  await Promise.all([
    ref.collection('private').doc('push').set({
      expoPushToken: token,
      pushUpdatedAt: firestore.FieldValue.serverTimestamp(),
    }),
    // Strip any pre-migration token left on the world-readable profile.
    ref.set({ expoPushToken: firestore.FieldValue.delete() }, { merge: true }),
  ]);
}

/** Read this athlete's own private push token (owner-only). */
export async function fetchExpoPushToken(uid: string): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;
  const snap = await usersCol().doc(uid).collection('private').doc('push').get();
  return snap.exists() ? ((snap.get('expoPushToken') as string | undefined) ?? null) : null;
}

/**
 * True when no other profile currently claims this username.
 * Client mitigation until a `usernames/{name}` reservation exists server-side.
 */
export async function isUsernameAvailable(
  username: string,
  excludeUid?: string,
): Promise<boolean> {
  if (!isFirebaseConfigured()) return true;
  const name = normalizeUsername(username);
  if (!name) return false;
  try {
    const snap = await usersCol().where('username', '==', name).limit(5).get();
    return snap.docs.every((d) => d.id === excludeUid);
  } catch {
    // Offline — don't block local onboarding; upsert will reconcile later.
    return true;
  }
}

/** Prefer the higher personal best per exercise across devices. */
function mergePersonalBests(
  cloud: Record<string, number> | undefined,
  local: Record<ExerciseId, number>,
): Record<ExerciseId, number> {
  const out = { ...local } as Record<string, number>;
  if (cloud) {
    for (const [k, v] of Object.entries(cloud)) {
      if (typeof v === 'number') out[k] = Math.max(out[k] ?? 0, v);
    }
  }
  return out as Record<ExerciseId, number>;
}

/**
 * Upsert the durable profile slice. Merge so we never clobber fields another
 * device wrote (e.g. a higher personal best) that this device doesn't track.
 * `totalXp` and personal bests take the max across devices so a late sync
 * cannot regress progress. Stamps `createdAt` once and refreshes `lastActiveAt`.
 */
/**
 * Mirror the durable profile slice to Firestore.
 * @returns `true` when the write confirmed (or Firebase is unconfigured / no-op).
 *          `false` when the write failed — callers that must park progress before
 *          a uid switch should abort rather than treat silence as success.
 */
export async function upsertProfile(
  profile: Omit<CloudProfile, 'updatedAt' | 'createdAt' | 'lastActiveAt'>,
): Promise<boolean> {
  if (!isFirebaseConfigured()) return true;
  try {
    let username = normalizeUsername(profile.username) || 'champion';
    const ref = usersCol().doc(profile.uid);
    const existing = await ref.get();
    const cloud = existing.exists() ? (existing.data() as Partial<CloudProfile>) : null;
    // Never steal another athlete's handle on sync.
    if (!(await isUsernameAvailable(username, profile.uid))) {
      username =
        (typeof cloud?.username === 'string' && cloud.username) ||
        `${username.slice(0, 16)}_${profile.uid.slice(0, 4)}`;
    }
    const displayName = sanitizeDisplayName(profile.displayName, username);
    const avatarUrl = isCloudSafeAvatarUrl(profile.avatarUrl) ? profile.avatarUrl : null;
    const totalXp = Math.max(
      Math.max(0, Math.floor(profile.totalXp)),
      typeof cloud?.totalXp === 'number' ? cloud.totalXp : 0,
    );
    const personalBests = mergePersonalBests(cloud?.personalBests, profile.personalBests);
    const pairingBonusClaimed = !!(
      profile.pairingBonusClaimed || cloud?.pairingBonusClaimed
    );
    const pairingBonusUntil = Math.max(
      typeof profile.pairingBonusUntil === 'number' ? profile.pairingBonusUntil : 0,
      typeof cloud?.pairingBonusUntil === 'number' ? cloud.pairingBonusUntil : 0,
    );
    const onboarded = !!(profile.onboarded || cloud?.onboarded);
    const localProgress: CloudProgressSlice = {
      trainedDays: Array.isArray(profile.trainedDays) ? profile.trainedDays : [],
      weekKey: typeof profile.weekKey === 'string' ? profile.weekKey : isoWeekKey(),
      weekXp: typeof profile.weekXp === 'number' ? profile.weekXp : 0,
      weekExerciseReps: profile.weekExerciseReps ?? {},
      programme: profile.programme ?? null,
    };
    const progress = mergeCloudProgressSlice(localProgress, cloud);
    const now = Date.now();
    await ref.set(
      {
        ...profile,
        username,
        displayName,
        avatarUrl,
        totalXp,
        personalBests,
        onboarded,
        pairingBonusClaimed,
        pairingBonusUntil,
        trainedDays: progress.trainedDays,
        weekKey: progress.weekKey,
        weekXp: progress.weekXp,
        weekExerciseReps: progress.weekExerciseReps,
        programme: progress.programme,
        updatedAt: firestore.FieldValue.serverTimestamp(),
        lastActiveAt: now,
        ...(existing.exists() ? {} : { createdAt: now }),
        // Never leave a harvestable token on the public profile after sync.
        expoPushToken: firestore.FieldValue.delete(),
      },
      { merge: true },
    );
    return true;
  } catch {
    // Offline / network — caller keeps local state and retries later.
    return false;
  }
}

/**
 * Lightweight presence heartbeat. Merge-writes only `lastActiveAt` so friends
 * can see this athlete as online without a full profile sync.
 */
export async function touchPresence(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    const ref = usersCol().doc(uid);
    const snap = await ref.get();
    // Never create a half-empty profile — wait until upsertProfile has run once.
    if (!snap.exists()) return;
    await ref.set({ lastActiveAt: Date.now() }, { merge: true });
  } catch {
    // Offline — presence is best-effort.
  }
}

/**
 * Publish the athlete's weekly-XP snapshot to the leaderboard shard for their
 * league. Kept as a flat, query-cheap document so a ranked read is a single
 * ordered query rather than a fan-out. See leaderboardService.ts.
 */
export async function publishScore(input: {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  weeklyXp: number;
  totalXp: number;
  level: number;
  league: string;
}): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    const weekKey = currentWeekKey();
    const ref = firestore().collection('leaderboard').doc(input.uid);
    const existing = await ref.get();
    let weeklyXp = clampWeeklyXp(input.weeklyXp);
    let totalXp = Math.max(0, Math.floor(input.totalXp));
    if (existing.exists()) {
      const row = existing.data() as {
        weeklyXp?: number;
        totalXp?: number;
        weekKey?: string;
      };
      // Same ISO week: never publish a lower weekly score (empty local sessions
      // after reinstall would otherwise wipe the board).
      if (row.weekKey === weekKey && typeof row.weeklyXp === 'number') {
        weeklyXp = Math.max(weeklyXp, clampWeeklyXp(row.weeklyXp));
      }
      if (typeof row.totalXp === 'number') {
        totalXp = Math.max(totalXp, Math.max(0, Math.floor(row.totalXp)));
      }
    }
    await ref.set(
      {
        ...input,
        displayName: sanitizeDisplayName(input.displayName),
        avatarUrl: isCloudSafeAvatarUrl(input.avatarUrl) ? input.avatarUrl : null,
        weeklyXp,
        totalXp,
        updatedAt: firestore.FieldValue.serverTimestamp(),
        // `weekKey` lets a scheduled function/rule reset stale weekly rows.
        weekKey,
      },
      { merge: true },
    );
  } catch {
    // Offline — local XP still counts; next sync retries.
  }
}

/**
 * Remove the athlete's leaderboard row entirely — used when they turn on a
 * private profile. Deleting (rather than flagging) is what actually keeps them
 * out of every ranked query, since the board reads the raw collection.
 */
export async function removeScore(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await firestore().collection('leaderboard').doc(uid).delete();
  } catch {
    // Offline — privacy flip retries on next sync.
  }
}

/**
 * Upload a local avatar image (file:// or content:// uri) to Storage and return
 * the HTTPS download URL. Returns the original uri unchanged when unconfigured
 * so the local avatar keeps working offline.
 *
 * Declares JPEG content-type so Storage rules accept the write. Callers should
 * crop/compress before upload (ImagePicker quality ~0.8).
 */
export async function uploadAvatar(uid: string, localUri: string): Promise<string> {
  if (!isFirebaseConfigured()) return localUri;
  if (!localUri || localUri.startsWith('https://')) return localUri;
  const ref = storage().ref(`avatars/${uid}.jpg`);
  await ref.putFile(localUri, { contentType: 'image/jpeg' });
  return ref.getDownloadURL();
}

/** Delete the stored avatar object (best-effort) so a moderated/removed photo clears. */
export async function deleteAvatar(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await storage().ref(`avatars/${uid}.jpg`).delete();
  } catch {
    // Missing object is fine.
  }
}

/** ISO week key like `2026-W30`, matching the weekly XP rollup elsewhere. */
export function currentWeekKey(date = new Date()): string {
  return isoWeekKey(date);
}
