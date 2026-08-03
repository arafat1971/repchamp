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

import { isFirebaseConfigured } from '@/lib/firebase';
import {
  mergeCloudProgressSlice,
  type CloudProgressSlice,
} from '@/domain/cloudProgress';
import { normalizeUsername, sanitizeDisplayName } from '@/domain/input';
import { clampWeeklyXp } from '@/domain/fairPlay';
import { isCloudSafeAvatarUrl, MAX_AVATAR_DATA_URI_BYTES } from '@/domain/safety';
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
 * Whether this username is free, as far as we can tell.
 *
 * `'unknown'` is distinct from `'free'` on purpose. The lookup used to report
 * a failed query as available, which quietly defeated `upsertProfile`'s
 * collision guard: one transient error and a second athlete wrote the same
 * handle. Two `@champion` profiles in production came from exactly this.
 *
 * Callers decide what an unknown result means, because the safe answer
 * differs. Onboarding must not strand someone offline, so it lets them
 * through; the cloud write must not hand out a taken handle, so it treats
 * unknown as taken and falls back to a uid-suffixed name.
 *
 * Client mitigation until a `usernames/{name}` reservation exists
 * server-side — this narrows the window, it does not close it. Two devices
 * querying at once still both see "free".
 */
export type UsernameAvailability = 'free' | 'taken' | 'unknown';

export async function checkUsername(
  username: string,
  excludeUid?: string,
): Promise<UsernameAvailability> {
  if (!isFirebaseConfigured()) return 'free';
  const name = normalizeUsername(username);
  if (!name) return 'taken';
  try {
    const snap = await usersCol().where('username', '==', name).limit(5).get();
    return snap.docs.every((d) => d.id === excludeUid) ? 'free' : 'taken';
  } catch {
    return 'unknown';
  }
}

/**
 * True when the name is free *or* we could not check.
 *
 * Kept for onboarding, where blocking on a failed lookup would trap an
 * offline athlete on the username step with no way forward.
 */
export async function isUsernameAvailable(
  username: string,
  excludeUid?: string,
): Promise<boolean> {
  return (await checkUsername(username, excludeUid)) !== 'taken';
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
    // Never steal another athlete's handle on sync. `unknown` counts as taken
    // here: writing a possibly-duplicate handle is worse than falling back to
    // the athlete's existing one (or a suffixed variant), which a later
    // successful sync can still correct.
    if ((await checkUsername(username, profile.uid)) !== 'free') {
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
 * Avatar edge, in pixels.
 *
 * The app never renders an avatar above ~96pt, so 192 is already retina-sharp
 * at 2x and comfortably so at 3x. It is also what keeps the encoded payload
 * near 6 KB — small enough to ride on the profile document.
 */
const AVATAR_EDGE = 192;

/**
 * Turn a picked photo into something that can live on the profile document.
 *
 * This used to upload to Firebase Storage and return a download URL. Storage
 * requires the paid Blaze plan, and avatars were the only thing in the whole
 * app that used it — so instead of putting a bill between an athlete and their
 * profile picture, the image is downscaled to `AVATAR_EDGE` and returned as a
 * base64 data URI, which Firestore stores inline.
 *
 * The size discipline matters. Firestore caps a document at 1 MiB including
 * every other field, so the resize is not an optimisation — a full-resolution
 * phone photo would fail the write and take the whole profile with it.
 *
 * Returns the original uri unchanged when Firebase is unconfigured, or when it
 * is already a remote/encoded value, so the local avatar keeps working offline.
 */
export async function uploadAvatar(_uid: string, localUri: string): Promise<string> {
  if (!isFirebaseConfigured()) return localUri;
  if (!localUri) return localUri;
  if (localUri.startsWith('https://') || localUri.startsWith('data:image/')) return localUri;

  // Required lazily, not imported at module scope.
  //
  // This module is reachable from app/(tabs)/_layout.tsx via notifications, so
  // a static import puts expo-image-manipulator's native module on the path of
  // every launch. When a build's JS is newer than its native binary the import
  // throws, the route module resolves to undefined, and expo-router dies on it
  // — a white screen on boot because an avatar resizer was missing. Requiring
  // it here means that failure can only ever cost the athlete a cloud-synced
  // photo, which is what the local-uri fallbacks below already handle.
  let manipulateAsync: typeof import('expo-image-manipulator').manipulateAsync;
  let SaveFormat: typeof import('expo-image-manipulator').SaveFormat;
  try {
    ({ manipulateAsync, SaveFormat } = require('expo-image-manipulator'));
  } catch {
    return localUri;
  }

  const result = await manipulateAsync(
    localUri,
    [{ resize: { width: AVATAR_EDGE, height: AVATAR_EDGE } }],
    { compress: 0.75, format: SaveFormat.JPEG, base64: true },
  );
  if (!result.base64) return localUri;

  const dataUri = `data:image/jpeg;base64,${result.base64}`;
  // Guard the ceiling here as well as in `isCloudSafeAvatarUrl`: a caller that
  // skipped the resize would otherwise fail the whole profile write, and
  // keeping the local uri costs the athlete nothing but a cloud-synced photo.
  return dataUri.length <= MAX_AVATAR_DATA_URI_BYTES ? dataUri : localUri;
}

/**
 * Clear a stored avatar so a moderated or removed photo stops being served.
 *
 * The avatar now lives on the profile document rather than in Storage, so
 * clearing it is a field write. Best-effort: the caller is usually mid-delete
 * and a failure here must not strand the rest of the erasure.
 */
export async function deleteAvatar(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await usersCol().doc(uid).set({ avatarUrl: null }, { merge: true });
  } catch {
    // Already gone, or offline — the profile delete that follows covers it.
  }
}

/** ISO week key like `2026-W30`, matching the weekly XP rollup elsewhere. */
export function currentWeekKey(date = new Date()): string {
  return isoWeekKey(date);
}
