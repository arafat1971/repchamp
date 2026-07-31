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
 *   - `users/{uid}/blocks/{id}`       block list
 *   - `leaderboard/{uid}`             weekly-XP row
 *   - `matchmaking/{uid}`             open-queue ticket (may not exist)
 *   - `duels/{id}`                    pending / active matches
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

import { seatOf, type Duel } from '@/domain/duel';
import { isFirebaseConfigured } from '@/lib/firebase';
import { cancelDuel, finishDuel } from '@/services/duelService';

/** Thrown when cloud wipe succeeded but Auth still needs a fresh login. */
export const CLOUD_ERASED_REAUTH_MESSAGE =
  'Your cloud data was erased. Confirm your login (Google or email), then tap Delete again to remove the login. Do not log out.';

/**
 * Gather everything the cloud holds about this user into one plain object,
 * ready to serialise to JSON and hand to the OS share sheet. Returns null when
 * unconfigured (a local user exports from the device instead).
 */
export async function exportAccountData(uid: string): Promise<Record<string, unknown> | null> {
  if (!isFirebaseConfigured()) return null;

  const db = firestore();
  const userRef = db.collection('users').doc(uid);
  const [profile, leaderboard, matchmaking, coupleSnap, friendsSnap, blocksSnap, pushSnap] =
    await Promise.all([
      userRef.get(),
      db.collection('leaderboard').doc(uid).get(),
      db.collection('matchmaking').doc(uid).get(),
      db.collection('couples').where('memberUids', 'array-contains', uid).limit(1).get(),
      userRef.collection('friends').get(),
      userRef.collection('blocks').get(),
      userRef.collection('private').doc('push').get(),
    ]);

  const couple = coupleSnap.docs[0];
  return {
    exportedAt: new Date().toISOString(),
    uid,
    profile: profile.exists() ? profile.data() : null,
    friends: friendsSnap.docs.map((d) => ({ uid: d.id, ...d.data() })),
    blocks: blocksSnap.docs.map((d) => ({ uid: d.id, ...d.data() })),
    privatePush: pushSnap.exists() ? pushSnap.data() : null,
    leaderboard: leaderboard.exists() ? leaderboard.data() : null,
    matchmaking: matchmaking.exists() ? matchmaking.data() : null,
    couple: couple ? { id: couple.id, ...couple.data() } : null,
  };
}

/**
 * Cancel pending invites and forfeit active seats so a deleting athlete does
 * not leave partners stuck in a live set against a ghost uid.
 */
/** Cancel pending invites and forfeit active seats for this uid. */
export async function closeOpenDuels(uid: string): Promise<void> {
  const db = firestore();
  try {
    const [pendingHost, pendingTarget, activeHost, activeGuest] = await Promise.all([
      db
        .collection('duels')
        .where('hostUid', '==', uid)
        .where('status', '==', 'pending')
        .limit(25)
        .get(),
      db
        .collection('duels')
        .where('targetUid', '==', uid)
        .where('status', '==', 'pending')
        .limit(25)
        .get(),
      db
        .collection('duels')
        .where('hostUid', '==', uid)
        .where('status', '==', 'active')
        .limit(25)
        .get(),
      db
        .collection('duels')
        .where('guestUid', '==', uid)
        .where('status', '==', 'active')
        .limit(25)
        .get(),
    ]);

    const pendingIds = new Set<string>();
    for (const snap of [pendingHost, pendingTarget]) {
      for (const doc of snap.docs) pendingIds.add(doc.id);
    }
    await Promise.all([...pendingIds].map((id) => cancelDuel(id)));

    const activeSeen = new Set<string>();
    for (const snap of [activeHost, activeGuest]) {
      for (const doc of snap.docs) {
        if (activeSeen.has(doc.id)) continue;
        activeSeen.add(doc.id);
        const duel = doc.data() as Duel;
        const seat = seatOf(duel, uid);
        if (!seat) continue;
        const mine = duel[seat];
        // Forfeit our seat — partner keeps playing and settles when they finish.
        await finishDuel(doc.id, seat, {
          reps: mine?.reps ?? 0,
          formScore: mine?.formScore ?? 0,
          forfeited: true,
        });
      }
    }
  } catch {
    // Missing index / offline — profile wipe still proceeds.
  }
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
 * Throws when Auth delete needs a recent login so the UI can ask the athlete to
 * re-authenticate — cloud data is already erased in that case. Safe to call
 * again after reauth (cloud deletes are idempotent / not-found tolerant).
 *
 * No-ops when unconfigured. The caller should wipe local storage only after
 * Auth delete succeeds — never on the reauth path (that would abandon the login).
 */
export async function deleteAccount(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  if (!uid) throw new Error('Sign in first, then try deleting again.');

  const db = firestore();
  const userRef = db.collection('users').doc(uid);

  const [coupleSnap, friendsSnap, blocksSnap] = await Promise.all([
    db.collection('couples').where('memberUids', 'array-contains', uid).limit(5).get(),
    userRef.collection('friends').get(),
    userRef.collection('blocks').get(),
  ]);

  await closeOpenDuels(uid);

  // Subcollections first — Firestore does not cascade-delete them with the parent.
  const deletions: Promise<unknown>[] = [
    userRef.collection('private').doc('push').delete().catch(() => undefined),
    ...friendsSnap.docs.map((d) => d.ref.delete().catch(() => undefined)),
    ...blocksSnap.docs.map((d) => d.ref.delete().catch(() => undefined)),
    db.collection('leaderboard').doc(uid).delete().catch(() => undefined),
    db.collection('matchmaking').doc(uid).delete().catch(() => undefined),
  ];
  for (const couple of coupleSnap.docs) {
    deletions.push(couple.ref.delete().catch(() => undefined));
  }

  await Promise.all(deletions);
  // Parent profile last, after secrets / friends are gone.
  try {
    await userRef.delete();
  } catch {
    // Already erased on a prior attempt that stopped at Auth reauth.
  }

  try {
    await storage().ref(`avatars/${uid}.jpg`).delete();
  } catch {
    // No avatar (object-not-found) or a transient error — not worth failing the
    // whole deletion over; the profile doc that referenced it is already gone.
  }

  const current = auth().currentUser;
  if (!current || current.uid !== uid) return;

  try {
    await current.delete();
  } catch (error) {
    const code = String((error as { code?: string })?.code ?? '');
    if (code === 'auth/requires-recent-login') {
      throw new Error(CLOUD_ERASED_REAUTH_MESSAGE);
    }
    throw error instanceof Error ? error : new Error('Could not delete the login.');
  }
}
