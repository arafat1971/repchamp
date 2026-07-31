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
 * `waiting` and falls through to sit in the queue itself. Firestore rules further
 * require a real duel (host = waiting athlete, guest = seeker) before any foreign
 * ticket can flip to `matched`, so a client can't stamp a fake duelId alone.
 */

import firestore from '@react-native-firebase/firestore';

import { isFirebaseConfigured } from '@/lib/firebase';
import {
  OPEN_MATCH_DURATION,
  OPEN_MATCH_EXERCISE,
  type QueueTicket,
  buildMatchDuel,
  canPair,
  makeTicket,
} from '@/domain/matchmaking';
import { isBlockedEither } from '@/services/safetyService';

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
 * If the ticket is already `matched` to a still-live duel (`active`/`pending`),
 * returns that `duelId` so a foreground resume cannot wipe the pairing.
 * Finished / missing duels are treated as stale — the ticket is rewritten to
 * `waiting` so Quick Match cannot relaunch an old match.
 *
 * @returns existing live duel id when already matched to an open duel, else null.
 */
export async function enqueue(input: QueueInput): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    return await firestore().runTransaction(async (tx) => {
      const ref = ticketDoc(input.uid);
      const snap = await tx.get(ref);
      if (snap.exists()) {
        const existing = snap.data() as QueueTicket;
        if (existing.status === 'matched' && existing.duelId) {
          const duelSnap = await tx.get(firestore().collection(DUELS).doc(existing.duelId));
          if (duelSnap.exists()) {
            const duel = duelSnap.data() as { status?: string };
            if (duel.status === 'active' || duel.status === 'pending') {
              return existing.duelId;
            }
          }
          // Stale matched pointer — fall through and rewrite as waiting.
        }
      }
      const ticket = makeTicket(input);
      tx.set(ref, {
        ...ticket,
        enqueuedAt: firestore.FieldValue.serverTimestamp(),
      });
      return null;
    });
  } catch {
    // Offline — queue UI falls back to AI rival on timeout.
    return null;
  }
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

  try {
    // Find the oldest waiting candidates outside the transaction (queries can't run
    // inside one); the transaction re-validates one before claiming.
    const snap = await queueCol()
      .where('status', '==', 'waiting')
      .orderBy('enqueuedAt', 'asc')
      .limit(5)
      .get();

    const format = {
      exercise: seeker.exercise ?? OPEN_MATCH_EXERCISE,
      duration: seeker.duration ?? OPEN_MATCH_DURATION,
    };
    const formatCandidates = snap.docs
      .map((d) => d.data() as QueueTicket)
      .filter((t) => canPair(seeker.uid, t, format));
    // Skip anyone either side has blocked — Quick Match must honor the block list.
    const candidates: QueueTicket[] = [];
    for (const t of formatCandidates) {
      if (await isBlockedEither(seeker.uid, t.uid)) continue;
      candidates.push(t);
    }
    if (candidates.length === 0) return null;

    const duelId = firestore().collection(DUELS).doc().id;
    const guest = makeTicket(seeker);

    return await firestore().runTransaction(async (tx) => {
      const seekerRef = ticketDoc(seeker.uid);
      const seekerSnap = await tx.get(seekerRef);
      // If someone paired us while we were scanning, follow that duel instead —
      // but only if it's still live (not a finished leftover ticket).
      if (seekerSnap.exists()) {
        const mine = seekerSnap.data() as QueueTicket;
        if (mine.status === 'matched' && mine.duelId) {
          const duelSnap = await tx.get(firestore().collection(DUELS).doc(mine.duelId));
          if (duelSnap.exists()) {
            const duel = duelSnap.data() as { status?: string };
            if (duel.status === 'active' || duel.status === 'pending') return mine.duelId;
          }
        }
      }

      // Claim the first candidate that's still waiting at transaction time.
      for (const candidate of candidates) {
        const candidateRef = ticketDoc(candidate.uid);
        const candidateSnap = await tx.get(candidateRef);
        if (!candidateSnap.exists()) continue;
        const fresh = candidateSnap.data() as QueueTicket;
        if (!canPair(seeker.uid, fresh, format)) continue;

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
  } catch {
    return null;
  }
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

/** Result of leaving the open-match queue. */
export type LeaveQueueResult =
  | { outcome: 'left' }
  | { outcome: 'matched'; duelId: string }
  | { outcome: 'missing' }
  /** Transient failure — caller must NOT invent an AI rival. */
  | { outcome: 'error' };

/**
 * Leave the queue — delete this athlete's ticket if still waiting.
 *
 * Transactional: re-reads before delete so a racing `tryPair` that flips the
 * ticket to `matched` cannot be wiped. Returns `matched` + duelId when that
 * duel is still live so the caller can launch instead of inventing an AI rival.
 * Finished / missing duel pointers are cleared as a normal leave.
 * Transaction failures return `error` (or `matched` after a re-read) — never a
 * false `missing` that would orphan a live partner into an AI duel.
 */
export async function leaveQueue(uid: string): Promise<LeaveQueueResult> {
  if (!isFirebaseConfigured()) return { outcome: 'missing' };
  try {
    return await firestore().runTransaction(async (tx) => {
      const ref = ticketDoc(uid);
      const snap = await tx.get(ref);
      if (!snap.exists()) return { outcome: 'missing' as const };
      const ticket = snap.data() as QueueTicket;
      if (ticket.status === 'matched' && ticket.duelId) {
        const duelSnap = await tx.get(firestore().collection(DUELS).doc(ticket.duelId));
        if (duelSnap.exists()) {
          const duel = duelSnap.data() as { status?: string };
          if (duel.status === 'active' || duel.status === 'pending') {
            return { outcome: 'matched' as const, duelId: ticket.duelId };
          }
        }
        // Stale matched pointer — clear so AI fallback can proceed.
      }
      tx.delete(ref);
      return { outcome: 'left' as const };
    });
  } catch {
    // Don't treat a failed transaction as "ticket gone" — re-read first.
    try {
      const snap = await ticketDoc(uid).get();
      if (!snap.exists()) return { outcome: 'missing' };
      const ticket = snap.data() as QueueTicket;
      if (ticket.status === 'matched' && ticket.duelId) {
        return { outcome: 'matched', duelId: ticket.duelId };
      }
      // Still waiting (or unmatched) — stay in queue UI, never AI-fallback.
      return { outcome: 'error' };
    } catch {
      return { outcome: 'error' };
    }
  }
}
/**
 * One-shot read of this athlete's queue ticket.
 */
export async function fetchTicket(uid: string): Promise<QueueTicket | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const snap = await ticketDoc(uid).get();
    return snap.exists() ? (snap.data() as QueueTicket) : null;
  } catch {
    return null;
  }
}

/**
 * Delete this athlete's queue ticket after a successful live launch.
 *
 * Unlike `leaveQueue`, this clears `matched` tickets too — once both athletes
 * are in the session the ticket is only a stale pointer that would otherwise
 * relaunch a finished duel on the next Quick Match.
 */
export async function clearQueueTicket(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await ticketDoc(uid).delete();
  } catch {
    // Best-effort — a missing ticket is already cleared.
  }
}

/**
 * How many athletes are sitting in open matchmaking right now (excluding self).
 * Caps the scan so Home's activity pill stays cheap.
 */
export async function countWaitingTickets(excludeUid?: string, limit = 20): Promise<number> {
  if (!isFirebaseConfigured()) return 0;
  try {
    const snap = await firestore()
      .collection(QUEUE)
      .where('status', '==', 'waiting')
      .limit(limit)
      .get();
    return snap.docs.filter((d) => d.id !== excludeUid).length;
  } catch {
    return 0;
  }
}
