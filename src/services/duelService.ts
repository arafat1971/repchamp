/**
 * Live 1v1 duel service — the Firestore I/O layer over the pure `duel.ts` core.
 *
 * `src/domain/duel.ts` owns the document shape, status transitions, and winner
 * resolution with no Firebase dependency. This module is the thin wire on top:
 * it creates a duel, lets a friend join it, streams each athlete's live rep
 * count a few times a second, and subscribes to the opposing player's slice so
 * the session HUD can render a real rival instead of a bot pacer.
 *
 * Following every other service here, all writes are no-ops and all reads resolve
 * empty when Firebase isn't configured — the caller falls back to `OpponentPacer`
 * (see src/domain/opponent.ts) and never has to branch. That's the whole point of
 * the seam described in FIREBASE_SETUP.md: the same session code path runs a bot
 * duel offline and a live duel once provisioned.
 *
 * Sync budget: a client writes its own slice at most every `DUEL_SYNC_INTERVAL_MS`
 * (~3 Hz, from duel.ts) so a full 60s set is well under 200 writes per player.
 */

import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

import { clampDuelReps, clampFormScore } from '@/domain/fairPlay';
import { isFirebaseConfigured } from '@/lib/firebase';
import {
  type Duel,
  type DuelPlayer,
  type DuelSeat,
  canForfeitOpenOpponent,
  makePlayer,
  opponentOf,
  resolveWinner,
  seatOf,
} from '@/domain/duel';
import { parseInviteKind, type InviteKind } from '@/domain/presence';
import { isBlockedEither } from '@/services/safetyService';

const DUELS = 'duels';

function duelsCol() {
  return firestore().collection(DUELS);
}

function duelDoc(id: string) {
  return duelsCol().doc(id);
}

/** The host's identity when opening a duel. */
export interface DuelHostInput {
  uid: string;
  displayName: string;
  avatarUrl?: string | null;
  level?: number;
  exercise: string;
  duration: number;
  /**
   * The friend this challenge is addressed to. When set, the duel surfaces in
   * that friend's inbox (`fetchIncomingDuels`); when omitted it's an open duel
   * joinable by anyone with the code.
   */
  targetUid?: string | null;
  /** Open a couple's cooperative *together* set instead of a competitive duel. */
  cooperative?: boolean;
  /** Inbox flavor — duel / train together / weekly compete. */
  kind?: InviteKind;
}

/**
 * Open a `pending` duel and return its id, or null when unconfigured.
 *
 * The guest seat is left empty until a friend joins via `joinDuel`. The document
 * is created with a fresh host player slice (0 reps, not done) so the writer and
 * the domain agree on the starting state without a round trip.
 */
export async function createDuel(input: DuelHostInput): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;

  const ref = duelDoc(firestore().collection(DUELS).doc().id);
  const host = makePlayer({
    uid: input.uid,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
    level: input.level,
  });

  const kind = input.kind ?? (input.cooperative ? 'train' : 'duel');
  const cooperative = input.cooperative ?? kind === 'train';

  const duel: Duel = {
    id: ref.id,
    exercise: input.exercise,
    duration: input.duration,
    status: 'pending',
    hostUid: input.uid,
    guestUid: null,
    targetUid: input.targetUid ?? null,
    host,
    guest: null,
    winnerUid: null,
    cooperative,
    kind,
  };

  await ref.set({ ...duel, createdAt: firestore.FieldValue.serverTimestamp() });
  return ref.id;
}

/**
 * Take the guest seat and flip the duel to `active`, returning the seated duel.
 *
 * Runs in a transaction so two devices racing for the same open duel can't both
 * claim the guest seat — the second read sees a non-`pending` status and throws
 * a friendly error the lobby can surface. Returns null when unconfigured.
 */
export async function joinDuel(
  duelId: string,
  input: {
    uid: string;
    displayName: string;
    avatarUrl?: string | null;
    level?: number;
  },
): Promise<Duel | null> {
  if (!isFirebaseConfigured()) return null;

  const ref = duelDoc(duelId);
  // Block check outside the transaction (extra reads); refuse before seating.
  const peek = await ref.get();
  if (peek.exists()) {
    const hostUid = (peek.data() as Duel).hostUid;
    if (hostUid && (await isBlockedEither(input.uid, hostUid))) {
      throw new Error('You can’t join this challenge.');
    }
  }

  return firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That duel no longer exists.');

    const duel = snap.data() as Duel;
    if (duel.hostUid === input.uid) throw new Error("You can't join your own duel.");
    if (duel.status !== 'pending' || duel.guestUid) {
      throw new Error('Someone already joined that duel.');
    }

    const guest = makePlayer({
      uid: input.uid,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      level: input.level,
    });

    tx.update(ref, {
      status: 'active',
      guestUid: input.uid,
      guest,
      startedAt: firestore.FieldValue.serverTimestamp(),
    });

    return { ...duel, status: 'active', guestUid: input.uid, guest };
  });
}

/**
 * Push this athlete's live slice — reps and rolling form — to their seat.
 *
 * Writes only the caller's own `host`/`guest` sub-fields, so the two players
 * never clobber each other and the security rules can scope each write to its
 * owner. Throttle at the call site to `DUEL_SYNC_INTERVAL_MS`; this method does
 * not rate-limit. No-op when unconfigured.
 */
export async function pushLiveState(
  duelId: string,
  seat: DuelSeat,
  slice: { reps: number; formScore: number },
): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;
  try {
    const snap = await duelDoc(duelId).get();
    if (!snap.exists()) return false;
    const duel = snap.data() as Duel;
    if (duel.status === 'finished') return false;
    const player = duel[seat];
    if (!player || player.done) return false;

    await duelDoc(duelId).update({
      [`${seat}.reps`]: clampDuelReps(slice.reps),
      [`${seat}.formScore`]: clampFormScore(slice.formScore),
    });
    return true;
  } catch {
    // Offline / App Check / transient — drop this tick; the next push retries.
    return false;
  }
}

/**
 * Upload this athlete's captured action-shot for a finished duel/together set
 * and write the resulting download URL onto their own seat.
 *
 * Fire only once, after the set ends — the local snapshot changes on every
 * rep, but only the final frame is worth the round trip. Best-effort: a failed
 * upload just leaves the opponent without a photo, which the share card
 * already tolerates. No-op when unconfigured.
 */
export async function pushDuelPhoto(
  duelId: string,
  seat: DuelSeat,
  localUri: string,
): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;
  try {
    const ref = storage().ref(`duelPhotos/${duelId}/${seat}.jpg`);
    await ref.putFile(localUri, { contentType: 'image/jpeg' });
    const url = await ref.getDownloadURL();
    await duelDoc(duelId).update({ [`${seat}.photoUrl`]: url });
    return true;
  } catch {
    return false;
  }
}

/**
 * Mark this athlete finished (clock out or forfeit) and settle the winner if the
 * opponent is already done.
 *
 * Settlement is a transaction: we re-read the live doc, stamp this seat `done`,
 * and — only when both seats are done — compute the winner with the same pure
 * `resolveWinner` the result screen uses, so the writer and the reader can never
 * disagree. No-op when unconfigured.
 */
export async function finishDuel(
  duelId: string,
  seat: DuelSeat,
  outcome: { reps: number; formScore: number; forfeited?: boolean },
): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;

  const ref = duelDoc(duelId);
  try {
    await firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;

      const duel = snap.data() as Duel;
      // Already settled — never rewrite winnerUid / reps from a late retry.
      if (duel.status === 'finished') return;
      const currentSeat = duel[seat] as DuelPlayer | undefined;
      if (currentSeat?.done) return;

      const updated: Duel = {
        ...duel,
        [seat]: {
          ...(currentSeat as DuelPlayer),
          reps: clampDuelReps(outcome.reps),
          formScore: clampFormScore(outcome.formScore),
          done: true,
          forfeited: outcome.forfeited ?? false,
        },
      };

      const bothDone = updated.host.done && !!updated.guest?.done;
      const patch: Record<string, unknown> = {
        [`${seat}.reps`]: clampDuelReps(outcome.reps),
        [`${seat}.formScore`]: clampFormScore(outcome.formScore),
        [`${seat}.done`]: true,
        [`${seat}.forfeited`]: outcome.forfeited ?? false,
      };

      if (bothDone) {
        patch.status = 'finished';
        // A together set is cooperative — resolving a winner would invent a loser
        // out of the partner who managed fewer reps, which is the opposite of what
        // the mode is for.
        patch.winnerUid = updated.cooperative ? null : resolveWinner(updated);
      }

      tx.update(ref, patch);
    });
    return true;
  } catch {
    // Offline / transient — caller may clear its latch and retry.
    return false;
  }
}

/**
 * Force-settle a duel when the opponent never finishes (crash / disconnect).
 *
 * Marks our seat done with the local outcome. The open opponent seat is only
 * forfeited after match end + calibration grace (`canForfeitOpenOpponent`) so a
 * faster finisher cannot steal a live set mid-rep. Returns true when the duel
 * is `finished` after the call (or already was).
 */
export async function forceSettleAbandoned(
  duelId: string,
  uid: string,
  outcome: { reps: number; formScore: number; forfeited?: boolean },
): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;

  const ref = duelDoc(duelId);
  let finished = false;
  try {
    await firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;

      const duel = snap.data() as Duel;
      if (duel.status === 'finished') {
        finished = true;
        return;
      }

      const seat = seatOf(duel, uid);
      if (!seat) return;
      const otherSeat: DuelSeat = seat === 'host' ? 'guest' : 'host';
      const mine = duel[seat] as DuelPlayer | undefined;
      const other = duel[otherSeat] as DuelPlayer | undefined;
      if (!mine) return;

      const patch: Record<string, unknown> = {};
      const nextMine: DuelPlayer = mine.done
        ? mine
        : {
            ...mine,
            reps: clampDuelReps(outcome.reps),
            formScore: clampFormScore(outcome.formScore),
            done: true,
            forfeited: outcome.forfeited ?? false,
          };
      if (!mine.done) {
        patch[`${seat}.reps`] = nextMine.reps;
        patch[`${seat}.formScore`] = nextMine.formScore;
        patch[`${seat}.done`] = true;
        patch[`${seat}.forfeited`] = nextMine.forfeited;
      }

      let nextOther = other;
      // Never forfeit a still-live opponent before the shared match window ends.
      if (other && !other.done && canForfeitOpenOpponent(duel)) {
        nextOther = { ...other, done: true, forfeited: true };
        patch[`${otherSeat}.done`] = true;
        patch[`${otherSeat}.forfeited`] = true;
      }

      if (nextMine.done && nextOther?.done) {
        const updated: Duel = {
          ...duel,
          [seat]: nextMine,
          [otherSeat]: nextOther,
        };
        patch.status = 'finished';
        patch.winnerUid = updated.cooperative ? null : resolveWinner(updated);
        finished = true;
      }

      if (Object.keys(patch).length > 0) tx.update(ref, patch);
    });
    return finished;
  } catch {
    return false;
  }
}

/**
 * One-shot read of a duel doc. Used when finish must resolve a seat before the
 * watch snapshot has landed. Returns null when unconfigured or missing.
 */
export async function fetchDuel(duelId: string): Promise<Duel | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const snap = await duelDoc(duelId).get();
    return snap.exists() ? (snap.data() as Duel) : null;
  } catch {
    return null;
  }
}

/**
 * Subscribe to a duel document. Fires immediately with the current value and on
 * every change; returns an unsubscribe. No-ops (returns a noop unsubscribe) when
 * unconfigured so the caller can wire it unconditionally.
 */
export function watchDuel(
  duelId: string,
  onChange: (duel: Duel | null) => void,
): () => void {
  if (!isFirebaseConfigured()) {
    onChange(null);
    return () => {};
  }
  return duelDoc(duelId).onSnapshot(
    (snap) => onChange(snap?.exists() ? (snap.data() as Duel) : null),
    // Transient permission/network errors must not look like "doc deleted"
    // (that used to cancel a live waiting room).
    () => {},
  );
}

/**
 * Subscribe to just the opposing player's live slice from `uid`'s viewpoint.
 *
 * This is the seam the session screen consumes: it feeds `setOpponentReps` the
 * real remote rep count in place of `OpponentPacer.repsAt`. Returns an
 * unsubscribe; no-ops when unconfigured.
 */
export function watchOpponent(
  duelId: string,
  uid: string,
  onChange: (opponent: DuelPlayer | null) => void,
): () => void {
  return watchDuel(duelId, (duel) => {
    onChange(duel ? opponentOf(duel, uid) : null);
  });
}

/** The seat a given uid holds in a duel — re-exported so callers need one import. */
export function seatFor(duel: Duel, uid: string): DuelSeat | null {
  return seatOf(duel, uid);
}

/**
 * Delete a duel the host abandoned before anyone joined — or that the
 * addressed target declined from their inbox.
 *
 * Transactional: only deletes when still `pending` with no guest. A guest join
 * between a naive get and delete used to wipe an active match.
 */
export async function cancelDuel(duelId: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await firestore().runTransaction(async (tx) => {
      const ref = duelDoc(duelId);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const duel = snap.data() as Duel;
      if (duel.status !== 'pending' || duel.guestUid) return;
      tx.delete(ref);
    });
  } catch {
    // A guest may have joined between the check and here; leave it to play out.
  }
}

/** A challenge awaiting the athlete's acceptance, shaped for the inbox UI. */
export interface IncomingDuel {
  id: string;
  exercise: string;
  duration: number;
  hostUid: string;
  hostName: string;
  hostAvatarUrl: string | null;
  hostLevel: number;
  kind: InviteKind;
  cooperative: boolean;
}

/**
 * Pending duels addressed to `uid` — the async challenge inbox.
 *
 * Queries the open (`pending`, no guest yet) duels a friend created targeting
 * this athlete, newest first. Returns an empty array when unconfigured or on any
 * query error, so the inbox degrades to the local demo rather than throwing.
 * Requires the composite index in firestore.indexes.json.
 */
export async function fetchIncomingDuels(uid: string, limit = 10): Promise<IncomingDuel[]> {
  if (!isFirebaseConfigured()) return [];
  try {
    const snap = await duelsCol()
      .where('targetUid', '==', uid)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const incoming = snap.docs
      .map((doc) => {
        const d = doc.data() as Duel;
        // A challenge already claimed by a guest is no longer joinable — skip it.
        if (d.guestUid) return null;
        return {
          id: doc.id,
          exercise: d.exercise,
          duration: d.duration,
          hostUid: d.hostUid,
          hostName: d.host?.displayName ?? 'Athlete',
          hostAvatarUrl: d.host?.avatarUrl ?? null,
          hostLevel: d.host?.level ?? 1,
          kind: parseInviteKind(d.kind ?? (d.cooperative ? 'train' : 'duel')),
          cooperative: !!d.cooperative,
        } satisfies IncomingDuel;
      })
      .filter((d): d is IncomingDuel => d !== null);

    // Drop challenges from anyone either side has blocked.
    const visible: IncomingDuel[] = [];
    for (const d of incoming) {
      if (await isBlockedEither(uid, d.hostUid)) continue;
      visible.push(d);
    }
    return visible;
  } catch {
    return [];
  }
}
