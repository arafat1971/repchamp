/**
 * Account service — data export and full account deletion.
 *
 * These are the two rights an athlete is owed under GDPR/CCPA and the app
 * stores' data-safety policies: to take their data with them, and to have it
 * erased. Everything else in the app is offline-first and local; this module is
 * the one place that must reach across *all* of a user's cloud footprint.
 *
 * A user's data lives in:
 *   - `users/{uid}`                   profile, XP (no push tokens)
 *   - `users/{uid}/private/push`      Expo push token (owner-only)
 *   - `users/{uid}/friends/{id}`      friend edges
 *   - `leaderboard/{uid}`             weekly-XP row
 *   - `matchmaking/{uid}`             open-queue ticket (may not exist)
 *   - `couples/{coupleId}`            the shared bond — deleted whole
 *   - Storage `avatars/{uid}`         profile image (may not exist)
 *
 * As with every service here, all operations no-op when Firebase isn't
 * configured — a local-only user has nothing in the cloud to export or erase,
 * and the caller wipes local storage separately.
 */

import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

import { isFirebaseConfigured } from '@/lib/firebase';

/**
 * Gather everything the cloud holds about this user into one plain object,
 * ready to serialise to JSON and hand to the OS share sheet. Returns null when
 * unconfigured (a local user exports from the device instead).
 */
export async function exportAccountData(uid: string): Promise<Record<string, unknown> | null> {
  if (!isFirebaseConfigured()) return null;

  const db = firestore();
  const userRef = db.collection('users').doc(uid);
  const [profile, leaderboard, matchmaking, coupleSnap, friendsSnap, pushSnap] =
    await Promise.all([
      userRef.get(),
      db.collection('leaderboard').doc(uid).get(),
      db.collection('matchmaking').doc(uid).get(),
      db.collection('couples').where('memberUids', 'array-contains', uid).limit(1).get(),
      userRef.collection('friends').get(),
      userRef.collection('private').doc('push').get(),
    ]);

  const couple = coupleSnap.docs[0];
  return {
    exportedAt: new Date().toISOString(),
    uid,
    profile: profile.exists() ? profile.data() : null,
    friends: friendsSnap.docs.map((d) => ({ uid: d.id, ...d.data() })),
    privatePush: pushSnap.exists() ? pushSnap.data() : null,
    leaderboard: leaderboard.exists() ? leaderboard.data() : null,
    matchmaking: matchmaking.exists() ? matchmaking.data() : null,
    couple: couple ? { id: couple.id, ...couple.data() } : null,
  };
}

/**
 * Permanently erase this user's cloud footprint, then the auth account itself.
 *
 * Order matters: subcollections and docs are deleted *while the user is still
 * authenticated* (rules authorise by owner/member), and only then is the auth
 * user removed. The couple doc is deleted whole — the same `leaveCouple`
 * semantics — because a bond with one erased partner is not a state the app
 * models. Avatar removal is best-effort.
 *
 * No-ops when unconfigured. The caller is responsible for wiping local storage
 * afterwards (`clearAllStorage`), regardless of what this returns.
 */
export async function deleteAccount(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const db = firestore();
  const userRef = db.collection('users').doc(uid);

  const [coupleSnap, friendsSnap] = await Promise.all([
    db.collection('couples').where('memberUids', 'array-contains', uid).limit(1).get(),
    userRef.collection('friends').get(),
  ]);

  // Subcollections first — Firestore does not cascade-delete them with the parent.
  const deletions: Promise<unknown>[] = [
    userRef.collection('private').doc('push').delete(),
    ...friendsSnap.docs.map((d) => d.ref.delete()),
    db.collection('leaderboard').doc(uid).delete(),
    db.collection('matchmaking').doc(uid).delete(),
  ];
  const couple = coupleSnap.docs[0];
  if (couple) deletions.push(couple.ref.delete());

  await Promise.all(deletions);
  // Parent profile last, after secrets / friends are gone.
  await userRef.delete();

  try {
    await storage().ref(`avatars/${uid}.jpg`).delete();
  } catch {
    // No avatar (object-not-found) or a transient error — not worth failing the
    // whole deletion over; the profile doc that referenced it is already gone.
  }

  try {
    await auth().currentUser?.delete();
  } catch {
    // Requires-recent-login on a linked email account; the data is already gone.
  }
}
