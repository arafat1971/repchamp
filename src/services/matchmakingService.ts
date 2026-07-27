/**
 * Open-matchmaking queue — the Firestore I/O layer over src/domain/matchmaking.ts.
 *
 * The queue is a `matchmaking/{uid}` collection of tickets. Entering the queue is
 * two steps, run best-effort in order:
 *   1. `enqueue` — write my own `waiting` ticket, then
 *   2. `tryPair` — scan for the oldest *other* waiting ticket and, in a single
 *      transaction, mint a real `duels/{id}`, seat both athletes, and stamp both
 *      tickets `matched` with that duelId.
 * Both athletes `watchTicket` their own ticket; whichever one runs `tryPair` first
 * pairs the pair, and the other simply sees its ticket flip to `matched` and
 * follows the same `duelId` into the live session. If nobody's waiting yet, the
 * athlete sits `waiting` until a later entrant pairs *them*.
 *
 * Following every service here, all writes no-op and all reads resolve empty when
 * Firebase isn't configured, so the queue screen degrades to the bot duel.
 *
 * The transaction is what makes the seat-race safe: two seekers can't both claim
 * the same waiting ticket, because the second transaction re-reads it as no longer
 * `waiting` and falls through to sit in the queue itself.
 */

import firestore from '@react-native-firebase/firestore';

import { isFirebaseConfigured } from '@/lib/firebase';
import {
  type QueueTicket,
  buildMatchDuel,
  canPair,
  makeTicket,
} from '@/domain/matchmaking';

const QUEUE = 'matchmaking';
const DUELS = 'duels';

function queueCol() {
  return firestore().collection(QUEUE);
}

function ticketDoc(uid: string) {
  return queueCol().doc(uid);
}

/** The athlete's identity when entering the queue. */
export interface QueueInput {
  uid: string;
  displayName: string;
  avatarUrl?: string | null;
  level?: number;
  exercise?: string;
  duration?: number;
}

/**
 * Drop this athlete's `waiting` ticket in the queue. No-op when unconfigured.
 *
 * Overwrites any stale ticket for the same uid, so re-entering after a prior
 * match or a crash always starts clean at `waiting`.
 */
export async function enqueue(input: QueueInput): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const ticket = makeTicket(input);
  await ticketDoc(input.uid).set({
    ...ticket,
    enqueuedAt: firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Try to pair this athlete with the oldest other waiting athlete.
 *
 * Returns the paired duel's id, or null if nobody was waiting (the athlete stays
 * in the queue) or when unconfigured. Race-safe: the claim runs in a transaction
 * that re-reads the candidate and aborts if it's no longer `waiting`.
 */
export async function tryPair(seeker: QueueInput): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;

  // Find the oldest waiting candidates outside the transaction (queries can't run
  // inside one); the transaction re-validates one before claiming.
  const snap = await queueCol()
    .where('status', '==', 'waiting')
    .orderBy('enqueuedAt', 'asc')
    .limit(5)
    .get();

  const candidates = snap.docs
    .map((d) => d.data() as QueueTicket)
    .filter((t) => canPair(seeker.uid, t));
  if (candidates.length === 0) return null;

  const duelId = firestore().collection(DUELS).doc().id;
  const guest = makeTicket(seeker);

  return firestore().runTransaction(async (tx) => {
    const seekerRef = ticketDoc(seeker.uid);
    const seekerSnap = await tx.get(seekerRef);
    // If someone paired us while we were scanning, follow that duel instead.
    if (seekerSnap.exists()) {
      const mine = seekerSnap.data() as QueueTicket;
      if (mine.status === 'matched' && mine.duelId) return mine.duelId;
    }

    // Claim the first candidate that's still waiting at transaction time.
    for (const candidate of candidates) {
      const candidateRef = ticketDoc(candidate.uid);
      const candidateSnap = await tx.get(candidateRef);
      if (!candidateSnap.exists()) continue;
      const fresh = candidateSnap.data() as QueueTicket;
      if (!canPair(seeker.uid, fresh)) continue;

      // The waiting athlete hosts; the seeker who claimed them guests.
      const duel = buildMatchDuel(duelId, fresh, guest);

      tx.set(firestore().collection(DUELS).doc(duelId), {
        ...duel,
        createdAt: firestore.FieldValue.serverTimestamp(),
        startedAt: firestore.FieldValue.serverTimestamp(),
      });
      tx.update(candidateRef, { status: 'matched', duelId });
      tx.set(seekerRef, {
        ...guest,
        status: 'matched',
        duelId,
        enqueuedAt: firestore.FieldValue.serverTimestamp(),
      });
      return duelId;
    }

    return null; // everyone we found got claimed out from under us; stay queued.
  });
}

/**
 * Subscribe to this athlete's own ticket. Fires on every change; the queue screen
 * routes into the session when it sees `matched`. Returns an unsubscribe; no-ops
 * (noop unsubscribe, one null callback) when unconfigured.
 */
export function watchTicket(
  uid: string,
  onChange: (ticket: QueueTicket | null) => void,
): () => void {
  if (!isFirebaseConfigured()) {
    onChange(null);
    return () => {};
  }
  return ticketDoc(uid).onSnapshot(
    (snap) => onChange(snap?.exists() ? (snap.data() as QueueTicket) : null),
    () => onChange(null),
  );
}

/**
 * Leave the queue — delete this athlete's ticket. Best-effort; no-op when
 * unconfigured. Called when the athlete cancels or the screen unmounts before a
 * match, so abandoned `waiting` tickets don't accumulate.
 */
export async function leaveQueue(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await ticketDoc(uid).delete();
  } catch {
    // A racing pairing may have matched us first; harmless to leave it.
  }
}
