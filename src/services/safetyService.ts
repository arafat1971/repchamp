/**
 * Safety service — blocks and reports over Firestore.
 *
 * Blocks live under `users/{uid}/blocks/{blockedUid}` (owner-only), matching
 * the friends pattern. Reports go to a create-only `reports/{id}` collection
 * so peers cannot browse the queue; review happens in the Firebase console /
 * support email.
 */

import firestore from '@react-native-firebase/firestore';

import {
  RATE_LIMITS,
  REPORT_NOTE_MAX,
  type ReportReasonId,
  canPassRateLimit,
  recordRateLimitEvent,
} from '@/domain/safety';
import { isFirebaseConfigured } from '@/lib/firebase';
import { storage } from '@/lib/storage';

function blocksCol(uid: string) {
  return firestore().collection('users').doc(uid).collection('blocks');
}

function rateKey(kind: string, uid: string, extra = ''): string {
  return `rate:${kind}:${uid}${extra ? `:${extra}` : ''}`;
}

function readTimestamps(key: string): number[] {
  try {
    const raw = storage.getString(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function writeTimestamps(key: string, stamps: number[]): void {
  storage.set(key, JSON.stringify(stamps));
}

/** Throw if this athlete is over the client rate limit for `kind` (does not consume). */
export function assertClientRateLimit(
  kind: keyof typeof RATE_LIMITS,
  uid: string,
  extra = '',
): void {
  const cfg = RATE_LIMITS[kind];
  const key = rateKey(kind, uid, extra);
  const stamps = readTimestamps(key);
  if (!canPassRateLimit(stamps, cfg.max, cfg.windowMs)) {
    throw new Error('Slow down — try again later.');
  }
}

/** Consume a rate-limit slot after a successful side effect. */
export function commitClientRateLimit(
  kind: keyof typeof RATE_LIMITS,
  uid: string,
  extra = '',
): void {
  const cfg = RATE_LIMITS[kind];
  const key = rateKey(kind, uid, extra);
  const stamps = readTimestamps(key);
  writeTimestamps(key, recordRateLimitEvent(stamps, cfg.windowMs));
}

/** Check + consume in one step (for flows that can't fail after the gate). */
export function takeClientRateLimit(
  kind: keyof typeof RATE_LIMITS,
  uid: string,
  extra = '',
): void {
  assertClientRateLimit(kind, uid, extra);
  commitClientRateLimit(kind, uid, extra);
}

export interface BlockedUser {
  uid: string;
  displayName: string;
  blockedAt: number;
}

/** Cancel pending challenges between these two athletes (best-effort). */
async function cancelPendingDuelsBetween(myUid: string, targetUid: string): Promise<void> {
  const db = firestore();
  try {
    const [asHost, asTarget] = await Promise.all([
      db
        .collection('duels')
        .where('hostUid', '==', myUid)
        .where('status', '==', 'pending')
        .limit(25)
        .get(),
      db
        .collection('duels')
        .where('targetUid', '==', myUid)
        .where('status', '==', 'pending')
        .limit(25)
        .get(),
    ]);
    const ops: Promise<unknown>[] = [];
    for (const doc of asHost.docs) {
      const data = doc.data() as { targetUid?: string | null };
      // We host it, so the rules let us delete it whatever its state.
      if (data.targetUid === targetUid) ops.push(doc.ref.delete());
    }
    for (const doc of asTarget.docs) {
      const data = doc.data() as { hostUid?: string; guestUid?: string | null };
      if (data.hostUid !== targetUid) continue;
      // As the *target* the rules only permit a delete while the seat is still
      // open (`guestUid == null`). Attempting it once someone has joined is
      // rejected, and that rejection lands in the catch below — so the block
      // used to look successful while the challenge stayed live. Skip those
      // here; the inbox filters already hide a blocked athlete's duels.
      if (data.guestUid != null) continue;
      ops.push(doc.ref.delete());
    }
    await Promise.all(ops);
  } catch {
    // Missing index / offline — block still stands; inbox filters hide the rest.
  }
}

/** Leave a couple bond when the blocked uid is the partner (best-effort). */
async function leaveCoupleWith(myUid: string, targetUid: string): Promise<void> {
  try {
    const snap = await firestore()
      .collection('couples')
      .where('memberUids', 'array-contains', myUid)
      .limit(5)
      .get();
    const ops: Promise<unknown>[] = [];
    for (const doc of snap.docs) {
      const data = doc.data() as { memberUids?: string[] };
      if (Array.isArray(data.memberUids) && data.memberUids.includes(targetUid)) {
        ops.push(doc.ref.delete());
      }
    }
    await Promise.all(ops);
  } catch {
    // Offline — block still stands; couple UI will fail closed on next read.
  }
}

/** Block a peer. Also removes them from your friends list when present. */
export async function blockUser(
  myUid: string,
  targetUid: string,
  displayName = 'Athlete',
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  if (!myUid || !targetUid || myUid === targetUid) {
    throw new Error('Invalid block target.');
  }

  const batch = firestore().batch();
  batch.set(blocksCol(myUid).doc(targetUid), {
    displayName,
    blockedAt: Date.now(),
  });
  batch.delete(
    firestore().collection('users').doc(myUid).collection('friends').doc(targetUid),
  );
  await batch.commit();

  // Client-doable cleanup the rules allow — reverse friend edge needs CF.
  await Promise.all([
    cancelPendingDuelsBetween(myUid, targetUid),
    leaveCoupleWith(myUid, targetUid),
  ]);
}

export async function unblockUser(myUid: string, targetUid: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await blocksCol(myUid).doc(targetUid).delete();
}

export async function fetchBlockedUsers(myUid: string): Promise<BlockedUser[]> {
  if (!isFirebaseConfigured()) return [];
  const snap = await blocksCol(myUid).get();
  return snap.docs.map((d) => {
    const data = d.data() as { displayName?: string; blockedAt?: number };
    return {
      uid: d.id,
      displayName: data.displayName ?? 'Athlete',
      blockedAt: data.blockedAt ?? 0,
    };
  });
}

export async function fetchBlockedIds(myUid: string): Promise<Set<string>> {
  const list = await fetchBlockedUsers(myUid);
  return new Set(list.map((b) => b.uid));
}

/**
 * True if `me` has blocked `them`.
 *
 * Only my own list is read, because only my own list is readable: block lists
 * are owner-only in `firestore.rules`, deliberately, so that nobody can probe
 * who has blocked whom. This used to check both directions and threw
 * `permission-denied` on the second read — which surfaced as "Could not add"
 * on Friends, and silently broke duel joins, matchmaking and couple pairing
 * too, since every caller funnels through here.
 *
 * The other direction is not lost, it moves server-side: an athlete who
 * blocked me cannot be duelled, matched or paired with me because those
 * writes touch documents their own rules guard. What changes is that I can
 * now add someone to my friend list who has blocked me — a list that only I
 * see, and that grants no ability to contact them.
 */
export async function isBlockedByMe(me: string, them: string): Promise<boolean> {
  if (!isFirebaseConfigured() || !me || !them || me === them) return false;
  const mine = await blocksCol(me).doc(them).get();
  return mine.exists();
}

export interface CreateReportInput {
  reporterUid: string;
  targetUid: string;
  reason: ReportReasonId;
  note?: string;
  context?: string;
}

/** File a report. Rate-limited; create-only on the server. */
export async function createReport(input: CreateReportInput): Promise<void> {
  if (!isFirebaseConfigured()) {
    throw new Error('Reporting needs a cloud connection.');
  }
  if (!input.reporterUid || !input.targetUid || input.reporterUid === input.targetUid) {
    throw new Error('Invalid report target.');
  }

  assertClientRateLimit('report', input.reporterUid);
  assertClientRateLimit('reportSameTarget', input.reporterUid, input.targetUid);

  const note = (input.note ?? '').trim().slice(0, REPORT_NOTE_MAX);
  await firestore().collection('reports').add({
    reporterUid: input.reporterUid,
    targetUid: input.targetUid,
    reason: input.reason,
    note,
    context: (input.context ?? '').slice(0, 80),
    createdAt: firestore.FieldValue.serverTimestamp(),
    clientAt: Date.now(),
  });
  // Only burn the slot after a successful write so offline/rules failures can retry.
  commitClientRateLimit('report', input.reporterUid);
  commitClientRateLimit('reportSameTarget', input.reporterUid, input.targetUid);
}
