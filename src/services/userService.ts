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
import type { ExerciseId } from '@/vision/exercises';

/** The durable, cloud-synced projection of a user. Gameplay history stays local. */
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
}

const USERS = 'users';

function usersCol() {
  return firestore().collection(USERS);
}

/** Read a profile once. Returns null if unconfigured or not yet created. */
export async function fetchProfile(uid: string): Promise<CloudProfile | null> {
  if (!isFirebaseConfigured()) return null;
  const snap = await usersCol().doc(uid).get();
  if (!snap.exists()) return null;
  return snap.data() as CloudProfile;
}

/**
 * Store this device's Expo push token on the user's profile, so a partner's app
 * can look up where to send a nudge.
 *
 * Merge-written and idempotent — a token that hasn't changed simply re-writes
 * the same value. No-ops when unconfigured. It lives on `users/{uid}` (already
 * owner-readable by friends for username lookup) rather than the couple doc,
 * because the *sender* needs to read the *recipient's* token to push — see the
 * `expoPushToken` read allowance in the couples flow.
 */
export async function saveExpoPushToken(uid: string, token: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await usersCol()
    .doc(uid)
    .set(
      { expoPushToken: token, pushUpdatedAt: firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
}

/** Read a user's Expo push token — the sender needs the recipient's to nudge. */
export async function fetchExpoPushToken(uid: string): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;
  const snap = await usersCol().doc(uid).get();
  return snap.exists() ? ((snap.get('expoPushToken') as string | undefined) ?? null) : null;
}

/**
 * Upsert the durable profile slice. Merge so we never clobber fields another
 * device wrote (e.g. a higher personal best) that this device doesn't track.
 */
export async function upsertProfile(
  profile: Omit<CloudProfile, 'updatedAt'>,
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await usersCol()
    .doc(profile.uid)
    .set(
      { ...profile, updatedAt: firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
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
  await firestore()
    .collection('leaderboard')
    .doc(input.uid)
    .set(
      {
        ...input,
        updatedAt: firestore.FieldValue.serverTimestamp(),
        // `weekKey` lets a scheduled function/rule reset stale weekly rows.
        weekKey: currentWeekKey(),
      },
      { merge: true },
    );
}

/**
 * Remove the athlete's leaderboard row entirely — used when they turn on a
 * private profile. Deleting (rather than flagging) is what actually keeps them
 * out of every ranked query, since the board reads the raw collection.
 */
export async function removeScore(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await firestore().collection('leaderboard').doc(uid).delete();
}

/**
 * Upload a local avatar image (file:// or content:// uri) to Storage and return
 * the public download URL. Returns the original uri unchanged when unconfigured
 * so the local avatar keeps working.
 */
export async function uploadAvatar(uid: string, localUri: string): Promise<string> {
  if (!isFirebaseConfigured()) return localUri;
  const ref = storage().ref(`avatars/${uid}.jpg`);
  await ref.putFile(localUri);
  return ref.getDownloadURL();
}

/** ISO week key like `2026-W30`, matching the weekly XP rollup elsewhere. */
export function currentWeekKey(date = new Date()): string {
  // ISO-8601 week number.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
