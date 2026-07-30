/**
 * Couple service — the Firestore I/O layer over the pure `couple.ts` core.
 *
 * `src/domain/couple.ts` owns the document shape, the pair code, the shared
 * streak and the milestone maths with no Firebase dependency; this module is the
 * thin wire on top. It mints a couple with a short human-typed pair code, lets a
 * partner claim the empty seat, subscribes to the bond, and records each
 * finished session against the member who did it.
 *
 * Following every other service here, all writes are no-ops and all reads
 * resolve empty when Firebase isn't configured, so the UI can wire this
 * unconditionally and simply show the "not paired yet" state offline. See
 * FIREBASE_SETUP.md for the seam.
 */

import firestore from '@react-native-firebase/firestore';

import { isFirebaseConfigured } from '@/lib/firebase';
import {
  makePairCode,
  normalizePairCode,
  type Couple,
  type CoupleMember,
} from '@/domain/couple';

const COUPLES = 'couples';

function couplesCol() {
  return firestore().collection(COUPLES);
}

function coupleDoc(id: string) {
  return couplesCol().doc(id);
}

export interface CoupleMemberInput {
  uid: string;
  displayName: string;
  avatarUrl?: string | null;
}

function makeMember(input: CoupleMemberInput): CoupleMember {
  return {
    uid: input.uid,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl ?? null,
    trainedDays: [],
    totalReps: 0,
  };
}

/**
 * Write this athlete's Expo push token onto their own couple-member slice so the
 * partner can nudge without reading a world-readable profile field.
 */
export async function syncCouplePushToken(
  coupleId: string,
  uid: string,
  token: string,
): Promise<void> {
  if (!isFirebaseConfigured() || !token.startsWith('ExponentPushToken')) return;

  const ref = coupleDoc(coupleId);
  await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const couple = snap.data() as Couple;
    if (!couple.memberUids.includes(uid)) return;
    const members = couple.members.map((m) =>
      m.uid === uid ? { ...m, expoPushToken: token } : m,
    );
    tx.set(ref, { members }, { merge: true });
  });
}

/** Look up this athlete's couple (if any) and publish their push token onto it. */
export async function syncMyCouplePushToken(uid: string, token: string): Promise<void> {
  if (!isFirebaseConfigured() || !token.startsWith('ExponentPushToken')) return;
  const snap = await couplesCol()
    .where('memberUids', 'array-contains', uid)
    .limit(1)
    .get();
  const doc = snap.docs?.[0];
  if (!doc) return;
  await syncCouplePushToken(doc.id, uid, token);
}

/**
 * Mint a couple with an open seat and return its pair code, or null when
 * unconfigured.
 *
 * The pair code *is* the document id, so redeeming a code is a direct document
 * read rather than a query — the same trick `joinDuelByCode` uses for duels. Six
 * characters is short enough to read aloud but leaves ~10^9 possibilities, and
 * the transaction below refuses to overwrite an existing code, so the rare
 * collision costs a retry rather than someone else's couple.
 */
export async function createCouple(input: CoupleMemberInput): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makePairCode();
    const ref = coupleDoc(code);

    const claimed = await firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) return false;

      const couple: Couple = {
        id: code,
        memberUids: [input.uid],
        members: [makeMember(input)],
        pending: true,
      };
      tx.set(ref, { ...couple, createdAt: firestore.FieldValue.serverTimestamp() });
      return true;
    });

    if (claimed) return code;
  }
  return null;
}

/**
 * Take the open seat on a couple, returning the paired couple.
 *
 * Runs in a transaction so two people racing the same code can't both land in
 * the second seat. Throws a message the invite screen can surface directly when
 * the code is unknown, already full, or the caller's own.
 */
export async function joinCoupleByCode(
  rawCode: string,
  input: CoupleMemberInput,
): Promise<Couple | null> {
  if (!isFirebaseConfigured()) return null;

  const code = normalizePairCode(rawCode);
  if (!code) throw new Error('That pair code does not look right.');

  const ref = coupleDoc(code);

  return firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No couple found for that code.');

    const couple = snap.data() as Couple;
    if (couple.memberUids.includes(input.uid)) {
      // Re-scanning your own code is a no-op, not an error.
      return couple;
    }
    if (couple.memberUids.length >= 2) {
      throw new Error('That couple is already paired up.');
    }

    const members = [...couple.members, makeMember(input)];
    const paired: Couple = {
      ...couple,
      memberUids: [...couple.memberUids, input.uid],
      members,
      pending: false,
    };
    tx.set(ref, { ...paired, pairedAt: firestore.FieldValue.serverTimestamp() }, { merge: true });
    return paired;
  });
}

/**
 * Subscribe to a couple document. Fires immediately and on every change;
 * returns an unsubscribe. No-ops when unconfigured so callers wire it
 * unconditionally.
 */
export function watchCouple(coupleId: string, onChange: (couple: Couple | null) => void): () => void {
  if (!isFirebaseConfigured()) {
    onChange(null);
    return () => {};
  }
  return coupleDoc(coupleId).onSnapshot(
    (snap) => onChange(snap?.exists() ? (snap.data() as Couple) : null),
    () => onChange(null),
  );
}

/**
 * Subscribe to whichever couple this athlete belongs to.
 *
 * `memberUids` is denormalised onto the document precisely so this is a single
 * `array-contains` query — which needs no composite index — and so the security
 * rules can authorise on membership without reading the nested member objects.
 */
export function watchMyCouple(uid: string, onChange: (couple: Couple | null) => void): () => void {
  if (!isFirebaseConfigured()) {
    onChange(null);
    return () => {};
  }
  return couplesCol()
    .where('memberUids', 'array-contains', uid)
    .limit(1)
    .onSnapshot(
      (snap) => {
        const doc = snap?.docs?.[0];
        onChange(doc ? (doc.data() as Couple) : null);
      },
      () => onChange(null),
    );
}

/**
 * Credit a finished session to one member: their reps go up and today is added
 * to the days that feed the shared streak.
 *
 * The day is recorded with `arrayUnion` so two sessions on the same day count
 * once — the streak asks whether you trained that day, not how often — and so
 * two devices writing concurrently can't clobber each other's history.
 */
export async function recordCoupleSession(
  coupleId: string,
  uid: string,
  reps: number,
  day: string,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const ref = coupleDoc(coupleId);
  await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;

    const couple = snap.data() as Couple;
    const members = couple.members.map((m) =>
      m.uid === uid
        ? {
            ...m,
            totalReps: m.totalReps + reps,
            trainedDays: m.trainedDays.includes(day) ? m.trainedDays : [...m.trainedDays, day],
          }
        : m,
    );
    tx.set(ref, { members }, { merge: true });
  });
}

/** Expo's push endpoint — free, no Blaze plan, delivers to a closed app. */
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/**
 * Poke the partner to come train.
 *
 * Two deliveries, both from the *sender's* device — no Cloud Function, so no
 * Blaze plan:
 *  1. Writes the nudge onto the couple document, so the partner's live
 *     subscription surfaces it in-app if they're already looking.
 *  2. Reads the partner's Expo push token and POSTs to Expo's push service,
 *     which delivers even when their app is closed. Best-effort: a stale token
 *     or offline sender just means (1) still stands.
 *
 * `senderName` rides along so the push reads "Ada is training" rather than a
 * generic line.
 */
export async function nudgePartner(
  coupleId: string,
  fromUid: string,
  senderName: string,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  // (1) In-app path — the record the partner's subscription watches.
  await coupleDoc(coupleId).set(
    { nudge: { fromUid, at: firestore.FieldValue.serverTimestamp() } },
    { merge: true },
  );

  // (2) Remote path — push to the partner's device via Expo.
  try {
    const snap = await coupleDoc(coupleId).get();
    if (!snap.exists()) return;
    const couple = snap.data() as Couple;
    const partner = couple.members.find((m) => m.uid !== fromUid);
    if (!partner) return;

    // Prefer the token the partner wrote onto the couple doc (partner-readable).
    // Fall back to their private doc only works when reading yourself — skip.
    const token = partner.expoPushToken ?? null;
    // Only real Expo tokens are worth a POST; anything else Expo would reject.
    if (!token || !token.startsWith('ExponentPushToken')) return;

    await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        title: `${senderName} is training`,
        body: 'Jump in and keep your streak alive.',
        // Tagged so the foreground handler can suppress the duplicate (the in-app
        // nudge already showed it) — see `installForegroundNudgeSuppressor`.
        data: { type: 'couple-nudge', coupleId },
        channelId: 'social',
        priority: 'high',
      }),
    });
  } catch {
    // The push is best-effort; the in-app nudge in (1) is the guarantee.
  }
}

/** Break the bond. Both seats go, so neither side is left half-paired. */
export async function leaveCouple(coupleId: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await coupleDoc(coupleId).delete();
}
