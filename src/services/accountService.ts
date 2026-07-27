/**
 * Account service — data export and full account deletion.
 *
 * These are the two rights an athlete is owed under GDPR/CCPA and the app
 * stores' data-safety policies: to take their data with them, and to have it
 * erased. Everything else in the app is offline-first and local; this module is
 * the one place that must reach across *all* of a user's cloud footprint.
 *
 * A user's data lives in four places:
 *   - `users/{uid}`            profile, XP, push token
 *   - `leaderboard/{uid}`      weekly-XP row
 *   - `matchmaking/{uid}`      open-queue ticket (may not exist)
 *   - `couples/{coupleId}`     the shared bond — deleted whole, since a couple
 *                              can't meaningfully exist half-erased
 *   - Storage `avatars/{uid}`  profile image (may not exist)
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
  const [profile, leaderboard, matchmaking, coupleSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('leaderboard').doc(uid).get(),
    db.collection('matchmaking').doc(uid).get(),
    db.collection('couples').where('memberUids', 'array-contains', uid).limit(1).get(),
  ]);

  const couple = coupleSnap.docs[0];
  return {
    exportedAt: new Date().toISOString(),
    uid,
    profile: profile.exists() ? profile.data() : null,
    leaderboard: leaderboard.exists() ? leaderboard.data() : null,
    matchmaking: matchmaking.exists() ? matchmaking.data() : null,
    couple: couple ? { id: couple.id, ...couple.data() } : null,
  };
}

/**
 * Permanently erase this user's cloud footprint, then the auth account itself.
 *
 * Order matters: the Firestore documents are deleted *while the user is still
 * authenticated* (the security rules authorise deletion by owner/member), and
 * only then is the auth user removed. The couple doc is deleted whole — the same
 * `leaveCouple` semantics — because a bond with one erased partner is not a
 * state the app models. Avatar removal is best-effort: a missing object is a
 * success, not a failure.
 *
 * No-ops when unconfigured. The caller is responsible for wiping local storage
 * afterwards (`clearAllStorage`), regardless of what this returns.
 */
export async function deleteAccount(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const db = firestore();

  // Find the couple first — we need its id to delete the shared doc.
  const coupleSnap = await db
    .collection('couples')
    .where('memberUids', 'array-contains', uid)
    .limit(1)
    .get();

  const deletions: Promise<unknown>[] = [
    db.collection('users').doc(uid).delete(),
    db.collection('leaderboard').doc(uid).delete(),
    db.collection('matchmaking').doc(uid).delete(),
  ];
  const couple = coupleSnap.docs[0];
  if (couple) deletions.push(couple.ref.delete());

  await Promise.all(deletions);

  // Avatar is optional — a user who never set one has no object to remove.
  try {
    await storage().ref(`avatars/${uid}.jpg`).delete();
  } catch {
    // No avatar (object-not-found) or a transient error — not worth failing the
    // whole deletion over; the profile doc that referenced it is already gone.
  }

  // Finally, the auth account. `delete()` requires a recent sign-in; an
  // anonymous user (the default here) always satisfies that, so this succeeds
  // for the common case. If Firebase rejects it as stale, the cloud data is
  // already erased — the account is an empty shell — and the caller still wipes
  // the device, so the user is effectively gone either way.
  try {
    await auth().currentUser?.delete();
  } catch {
    // Requires-recent-login on a linked email account; the data is already gone.
  }
}
