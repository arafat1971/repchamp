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
 *   - `duels/{id}`                    pending / active / finished matches (name, uid, score)
 *   - `couples/{coupleId}`            the shared bond — deleted whole
 *
 * Nothing lives in Firebase Storage: that needs a paid plan, so the avatar is a
 * base64 field on the profile document and goes with it.
 *
 * As with every service here, all operations no-op when Firebase isn't
 * configured — a local-only user has nothing in the cloud to export or erase,
 * and the caller wipes local storage separately.
 */

import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

import { seatOf, type Duel } from '@/domain/duel';
import { captureError } from '@/lib/crash';
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
  const [
    profile,
    leaderboard,
    matchmaking,
    coupleSnap,
    friendsSnap,
    blocksSnap,
    pushSnap,
    hostedDuels,
    guestDuels,
  ] =
    await Promise.all([
      userRef.get(),
      db.collection('leaderboard').doc(uid).get(),
      db.collection('matchmaking').doc(uid).get(),
      db.collection('couples').where('memberUids', 'array-contains', uid).limit(1).get(),
      userRef.collection('friends').get(),
      userRef.collection('blocks').get(),
      userRef.collection('private').doc('push').get(),
      db.collection('duels').where('hostUid', '==', uid).limit(EXPORT_DUEL_LIMIT).get(),
      db.collection('duels').where('guestUid', '==', uid).limit(EXPORT_DUEL_LIMIT).get(),
    ]);

  const duels = new Map<string, Record<string, unknown>>();
  for (const snap of [hostedDuels, guestDuels]) {
    for (const d of snap.docs) duels.set(d.id, { id: d.id, ...d.data() });
  }

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
    duels: [...duels.values()],
  };
}

/** Per-side ceiling on duels included in a data export. */
const EXPORT_DUEL_LIMIT = 500;

/** Most open duels one athlete can realistically hold; a per-query ceiling. */
const OPEN_DUEL_QUERY_LIMIT = 100;

/**
 * Cancel pending invites and forfeit active seats, reporting how many could not
 * be closed. Account deletion needs the count: a deleted athlete left holding a
 * live seat strands the opponent against a ghost uid, and swallowing the error
 * told the athlete everything had been erased when it had not.
 */
async function closeOpenDuelsCounted(uid: string): Promise<number> {
  const db = firestore();
  let failures = 0;
  try {
    const [pendingHost, pendingTarget, activeHost, activeGuest] = await Promise.all([
      db
        .collection('duels')
        .where('hostUid', '==', uid)
        .where('status', '==', 'pending')
        .limit(OPEN_DUEL_QUERY_LIMIT)
        .get(),
      db
        .collection('duels')
        .where('targetUid', '==', uid)
        .where('status', '==', 'pending')
        .limit(OPEN_DUEL_QUERY_LIMIT)
        .get(),
      db
        .collection('duels')
        .where('hostUid', '==', uid)
        .where('status', '==', 'active')
        .limit(OPEN_DUEL_QUERY_LIMIT)
        .get(),
      db
        .collection('duels')
        .where('guestUid', '==', uid)
        .where('status', '==', 'active')
        .limit(OPEN_DUEL_QUERY_LIMIT)
        .get(),
    ]);

    const pendingIds = new Set<string>();
    for (const snap of [pendingHost, pendingTarget]) {
      for (const doc of snap.docs) pendingIds.add(doc.id);
    }
    const cancelled = await Promise.allSettled([...pendingIds].map((id) => cancelDuel(id)));
    failures += cancelled.filter((r) => r.status === 'rejected').length;

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
        try {
          await finishDuel(doc.id, seat, {
            reps: mine?.reps ?? 0,
            formScore: mine?.formScore ?? 0,
            forfeited: true,
          });
        } catch {
          failures += 1;
        }
      }
    }
  } catch {
    // The queries themselves failed (offline / missing index): nothing was closed.
    failures += 1;
  }
  return failures;
}

/** Page size for the finished-duel sweep. */
const ERASE_DUEL_PAGE = 100;
/** Safety bound on sweep rounds so a stuck delete cannot loop forever. */
const ERASE_DUEL_MAX_ROUNDS = 50;

/**
 * Delete every *finished* duel this athlete played, on either side.
 *
 * A settled duel keeps the athlete's name, uid and score on a document the
 * opponent also reads, and nothing else ever removes it — so account deletion
 * used to leave their match history behind while telling them it was erased.
 * The rules let either player delete a finished duel for exactly this reason.
 *
 * Each round deletes what it found and queries again, so an athlete with more
 * than one page of history is fully cleared. Rejects if any delete fails, so
 * the caller reports it rather than claiming a clean erase.
 */
export async function eraseFinishedDuels(uid: string): Promise<void> {
  const db = firestore();
  for (let round = 0; round < ERASE_DUEL_MAX_ROUNDS; round++) {
    const [asHost, asGuest] = await Promise.all([
      db
        .collection('duels')
        .where('hostUid', '==', uid)
        .where('status', '==', 'finished')
        .limit(ERASE_DUEL_PAGE)
        .get(),
      db
        .collection('duels')
        .where('guestUid', '==', uid)
        .where('status', '==', 'finished')
        .limit(ERASE_DUEL_PAGE)
        .get(),
    ]);
    const refs = new Map<string, (typeof asHost.docs)[number]['ref']>();
    for (const snap of [asHost, asGuest]) {
      for (const d of snap.docs) refs.set(d.id, d.ref);
    }
    if (refs.size === 0) return;
    const results = await Promise.allSettled([...refs.values()].map((r) => r.delete()));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) throw new Error(`${failed} finished duel(s) could not be deleted`);
  }
}

/** Cancel pending invites and forfeit active seats for this uid. Best-effort. */
export async function closeOpenDuels(uid: string): Promise<void> {
  await closeOpenDuelsCounted(uid);
}

/**
 * Permanently erase this user's cloud footprint, then the auth account itself.
 *
 * Order matters: subcollections and docs are deleted *while the user is still
 * authenticated* (rules authorise by owner/member), and only then is the auth
 * user removed. The couple doc is deleted whole — the same `leaveCouple`
 * semantics — because a bond with one erased partner is not a state the app
 * models.
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

  const openDuelFailures = await closeOpenDuelsCounted(uid);

  /**
   * Track which erasures actually landed.
   *
   * Every delete below used to swallow its own rejection, so `Promise.all`
   * always resolved and the athlete was told their account was deleted even
   * when their profile and leaderboard row were still live — a privacy
   * promise we could not actually keep. Failures are still tolerated
   * individually (one rejected delete must not abandon the rest), but they
   * are now recorded and raised at the end so the caller can report the
   * truth and let the athlete retry.
   */
  const failed: string[] = [];
  // Reported, not blocking: a duel that cannot be closed (already settled by
  // the opponent, say) must not trap an athlete in an account they asked to
  // delete. The profile and every other record below are still erased.
  if (openDuelFailures > 0) {
    captureError(new Error(`deleteAccount: ${openDuelFailures} open duel(s) not closed`));
  }
  const attempt = (label: string, work: Promise<unknown>): Promise<unknown> =>
    work.catch(() => {
      failed.push(label);
    });

  // Subcollections first — Firestore does not cascade-delete them with the parent.
  const deletions: Promise<unknown>[] = [
    attempt('push token', userRef.collection('private').doc('push').delete()),
    ...friendsSnap.docs.map((d) => attempt('friends', d.ref.delete())),
    ...blocksSnap.docs.map((d) => attempt('blocks', d.ref.delete())),
    attempt('leaderboard row', db.collection('leaderboard').doc(uid).delete()),
    attempt('matchmaking ticket', db.collection('matchmaking').doc(uid).delete()),
    // After `closeOpenDuelsCounted`, so duels forfeited above are now finished
    // and fall inside the sweep.
    attempt('duel history', eraseFinishedDuels(uid)),
  ];
  for (const couple of coupleSnap.docs) {
    deletions.push(attempt('couple record', couple.ref.delete()));
  }

  await Promise.all(deletions);
  // Parent profile last, after secrets / friends are gone.
  try {
    await userRef.delete();
  } catch (error) {
    // A not-found here is the expected resume path: a previous attempt erased
    // the cloud data and stopped at the Auth reauth step. Anything else is a
    // real failure and must not be reported as a successful deletion.
    const code = String((error as { code?: string })?.code ?? '');
    if (code !== 'firestore/not-found' && code !== 'not-found') {
      failed.push('profile');
    }
  }

  if (failed.length > 0) {
    const unique = [...new Set(failed)];
    throw new Error(
      `Some of your data could not be deleted (${unique.join(', ')}). ` +
        'Nothing else was changed — please check your connection and try again.',
    );
  }

  // No separate avatar erase: the image is a base64 field on the profile
  // document, so `userRef.delete()` above already removed it. Firebase Storage
  // needs a paid plan and this app no longer uses it at all.

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
