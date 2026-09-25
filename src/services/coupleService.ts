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
import type { WaterWidgetSnapshot } from '@/domain/waterWidget';
import {
  extractPairCode,
  makePairCode,
  type Couple,
  type CoupleDailyMetrics,
  type CoupleMember,
  type DrinkLast,
} from '@/domain/couple';
import { MAX_DAILY_GOAL_ML, MAX_DAILY_ML, MIN_DAILY_GOAL_ML } from '@/domain/hydration';
import { reminderNotification, type ReminderKind } from '@/domain/partnerReminder';
import { cleanPoke, cleanTicks } from '@/domain/ritual';
import { MAX_DAILY_STEPS } from '@/domain/steps';
import {
  assertClientRateLimit,
  commitClientRateLimit,
  isBlockedByMe,
} from '@/services/safetyService';

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
 * True when this athlete already sits on any couple doc (pending or paired).
 * Used to refuse a second membership so `watchMyCouple` can't pick the wrong bond.
 */
async function findMembershipId(uid: string): Promise<string | null> {
  const snap = await couplesCol().where('memberUids', 'array-contains', uid).limit(1).get();
  return snap.docs[0]?.id ?? null;
}

/**
 * Tells the partner's phone this build handles the silent widget push.
 *
 * Older builds hand an untitled push to the foreground handler, which shows
 * it as a blank banner — so a sender only sends one to a partner advertising
 * this. Published with the push token, the one write every build makes.
 */
export const WIDGET_PUSH_VERSION = 1;

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
      m.uid === uid ? { ...m, expoPushToken: token, widgetPush: WIDGET_PUSH_VERSION } : m,
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

  const existing = await findMembershipId(input.uid);
  if (existing) {
    throw new Error('Leave your current couple before creating a new invite.');
  }

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

  const code = extractPairCode(rawCode);
  if (!code) throw new Error('That pair code does not look right.');

  const membershipId = await findMembershipId(input.uid);
  if (membershipId && membershipId !== code) {
    /* An empty invite of my own is not a bond, it is an open door. The invite
       screen mints one on arrival, so two partners who both tapped "invite"
       each hold one — and refusing here left neither able to redeem the
       other's code. Close mine and take their seat; a real bond still blocks. */
    const outcome = await cancelCoupleInvite(membershipId);
    if (outcome === 'paired') {
      throw new Error('Leave your current couple before joining another.');
    }
  }

  const ref = coupleDoc(code);

  // Block check outside the transaction (same pattern as joinDuel).
  const peek = await ref.get();
  if (peek.exists()) {
    const hostUid = (peek.data() as Couple).memberUids[0];
    if (hostUid && hostUid !== input.uid && (await isBlockedByMe(input.uid, hostUid))) {
      throw new Error('You can’t join this couple.');
    }
  }

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
    const memberUids = [...couple.memberUids, input.uid];

    // Send *only* the keys a join is allowed to move. The rules cap this write
    // to memberUids/members/pending/pairedAt, so spreading the whole document
    // back — which re-sent `id` and `createdAt` — would now be rejected
    // wholesale. The full object is still returned to callers below; it is only
    // the payload that is narrowed.
    tx.set(
      ref,
      {
        memberUids,
        members,
        pending: false,
        pairedAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { ...couple, memberUids, members, pending: false };
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
 * How many applied credit ids the couple doc remembers.
 *
 * This is the server-side replay guard, so it must outlive the client's own
 * "already flushed" memory in `coupleCreditOutbox.ts` (capped at 200) — not
 * the other way round. It previously kept only 40, so an id could age out
 * here while the outbox still held it, and a replayed credit would be applied
 * twice. Kept comfortably above the client's cap.
 */
const CREDIT_HISTORY_LIMIT = 250;

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
  /** Durable outbox id — skips the increment when already applied. */
  creditId?: string,
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  // Zero-rep / give-up sets must not farm the shared streak.
  if (!Number.isFinite(reps) || reps <= 0) return;

  const ref = coupleDoc(coupleId);
  await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;

    const couple = snap.data() as Couple;
    const members = couple.members.map((m) => {
      if (m.uid !== uid) return m;
      const credited = Array.isArray(m.creditedIds) ? m.creditedIds : [];
      if (creditId && credited.includes(creditId)) return m;
      return {
        ...m,
        totalReps: m.totalReps + reps,
        trainedDays: m.trainedDays.includes(day) ? m.trainedDays : [...m.trainedDays, day],
        ...(creditId
          ? { creditedIds: [...credited, creditId].slice(-CREDIT_HISTORY_LIMIT) }
          : {}),
      };
    });
    tx.set(ref, { members }, { merge: true });
  });
}

/**
 * Publish today's water total onto this member's slice.
 *
 * Set-to-value, not incremented: the caller passes the whole day's total read
 * back out of the store, so a retry writes the same number twice and nothing
 * double-counts. That is why this needs none of the `creditedIds` bookkeeping
 * `recordCoupleSession` carries above.
 *
 * Same-day writes take the larger of the two. Two devices on one account both
 * publish set-to-value, and without this a phone that has been asleep could
 * clobber a live total with a stale smaller one.
 *
 * Keep the max. A downward correction — an undo — goes through
 * `lowerCoupleHydration` instead, which subtracts what was undone rather
 * than writing a smaller total, so a stale phone still cannot zero a live one.
 *
 * A write for a different day replaces the object outright rather than
 * merging, so yesterday's numbers cannot survive into today.
 */
export async function recordCoupleHydration(
  coupleId: string,
  uid: string,
  day: string,
  waterMl: number,
  extras: HydrationExtras = {},
): Promise<void> {
  if (!Number.isFinite(waterMl) || waterMl < 0 || waterMl > MAX_DAILY_ML) return;
  await recordCoupleDaily(coupleId, uid, day, { waterMl, ...cleanExtras(extras) });
}

/** The goal and drink layers that ride along with a water total. */
export interface HydrationExtras {
  goalMl?: number;
  layers?: { k: string; ml: number }[];
  /** The latest drink still on the total; `null` when there is none. */
  last?: DrinkLast | null;
  /** When this state was written, epoch ms — see `CoupleDailyMetrics.rev`. */
  rev?: number;
}

/**
 * Only sane extras reach the document: a goal inside the app's band, at
 * most six layers, each a short kind with a positive, finite volume.
 */
function cleanExtras(extras: HydrationExtras): HydrationExtras {
  const out: HydrationExtras = {};
  const g = extras.goalMl;
  if (typeof g === 'number' && Number.isFinite(g) && g >= MIN_DAILY_GOAL_ML && g <= MAX_DAILY_GOAL_ML) {
    out.goalMl = Math.round(g);
  }
  if (Array.isArray(extras.layers)) {
    out.layers = extras.layers
      .filter((l) => typeof l.k === 'string' && l.k.length <= 12 && Number.isFinite(l.ml) && l.ml > 0 && l.ml <= MAX_DAILY_ML)
      .slice(-6)
      .map((l) => ({ k: l.k, ml: Math.round(l.ml) }));
  }
  const last = extras.last;
  if (
    last &&
    typeof last.k === 'string' &&
    last.k.length <= 12 &&
    Number.isFinite(last.ml) &&
    last.ml > 0 &&
    last.ml <= MAX_DAILY_ML &&
    Number.isFinite(last.at)
  ) {
    out.last = { k: last.k, ml: Math.round(last.ml), at: Math.round(last.at) };
  }
  if (typeof extras.rev === 'number' && Number.isFinite(extras.rev) && extras.rev > 0) {
    out.rev = Math.round(extras.rev);
  }
  return out;
}

/**
 * Publish today's step count onto this member's slice.
 *
 * Same set-to-value contract as water. Android never calls this — it cannot
 * answer "steps today" — so an absent value on a partner's slice means "their
 * phone cannot count", not "they did not walk.
 */
export async function recordCoupleSteps(
  coupleId: string,
  uid: string,
  day: string,
  steps: number,
  /** The state's version, for the partner's widget — see `CoupleDailyMetrics.rev`. */
  rev?: number,
): Promise<void> {
  if (!Number.isFinite(steps) || steps < 0 || steps > MAX_DAILY_STEPS) return;
  await recordCoupleDaily(coupleId, uid, day, { steps, ...(validRev(rev) ? { rev } : {}) });
}

/** Today's reps, main movement and last set, as they ride on the daily slice. */
export interface RepsPatch {
  reps?: number;
  topEx?: string;
  trainedAt?: number;
}

export interface RitualPatch {
  habits?: string[];
  hereAt?: number;
  poke?: { e: string; at: number };
}

/**
 * Today's ritual ticks, heartbeat and live poke, into this member's slice —
 * the same own-slice transaction as water and reps, so the rules that pin the
 * partner's slice cover these too. Inputs are cleaned here; the reader cleans
 * again, because a document is only as tidy as its oldest writer.
 */
export async function recordCoupleRitual(coupleId: string, uid: string, day: string, patch: RitualPatch): Promise<void> {
  const clean: RitualPatch = {};
  if (patch.habits) clean.habits = cleanTicks(patch.habits);
  if (typeof patch.hereAt === 'number' && Number.isFinite(patch.hereAt) && patch.hereAt > 0) clean.hereAt = Math.round(patch.hereAt);
  const poke = cleanPoke(patch.poke);
  if (poke) clean.poke = poke;
  if (Object.keys(clean).length === 0) return;
  await recordCoupleDaily(coupleId, uid, day, clean);
}

/** Most reps a day can plausibly hold; anything above is a bug, not a workout. */
const MAX_DAILY_REPS = 20000;

const validRev = (rev: number | undefined): rev is number =>
  typeof rev === 'number' && Number.isFinite(rev) && rev > 0;

/**
 * Publish today's reps onto this member's slice, for the partner's rings.
 *
 * Same set-to-value, same-day-max contract as steps: a total recomputed from
 * the local log, so a retry is harmless and a stale device cannot walk it
 * back. Workouts are always shared — the streak already depends on them.
 */
export async function recordCoupleReps(
  coupleId: string,
  uid: string,
  day: string,
  patch: { reps: number; topEx?: string | null; trainedAt?: number | null; rev?: number },
): Promise<void> {
  const { reps } = patch;
  if (!Number.isFinite(reps) || reps < 0 || reps > MAX_DAILY_REPS) return;
  const clean: RepsPatch & { rev?: number } = { reps: Math.round(reps) };
  if (typeof patch.topEx === 'string' && patch.topEx.length > 0 && patch.topEx.length <= 24) clean.topEx = patch.topEx;
  if (typeof patch.trainedAt === 'number' && Number.isFinite(patch.trainedAt) && patch.trainedAt > 0) {
    clean.trainedAt = Math.round(patch.trainedAt);
  }
  if (validRev(patch.rev)) clean.rev = Math.round(patch.rev);
  await recordCoupleDaily(coupleId, uid, day, clean);
}

/**
 * Merge one or more daily metrics into this member's slice.
 *
 * Shared by water and steps so the same-day max, the new-day replace and the
 * byte-identical partner entry are written once rather than twice. Only the
 * keys passed are touched, so a steps write cannot drop a water total
 * published a moment earlier from the same phone.
 */
async function recordCoupleDaily(
  coupleId: string,
  uid: string,
  day: string,
  patch: { waterMl?: number; steps?: number } & HydrationExtras & RepsPatch & RitualPatch,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const ref = coupleDoc(coupleId);
  await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;

    const couple = snap.data() as Couple;
    const members = couple.members.map((m) => {
      // Byte-identical, or `onlyOwnMemberStatsChanged` rejects the write.
      if (m.uid !== uid) return m;
      const prev = m.daily;
      const sameDay = prev && prev.day === day;

      /* Same day takes the max so a stale device cannot walk a live figure
         backwards; a new day replaces outright so yesterday's totals cannot
         become today's floor. */
      const merged: CoupleDailyMetrics = sameDay ? { ...prev, day } : { day };
      if (patch.waterMl !== undefined) {
        merged.waterMl = sameDay
          ? Math.max(prev?.waterMl ?? 0, patch.waterMl)
          : patch.waterMl;
      }
      if (patch.steps !== undefined) {
        merged.steps = sameDay ? Math.max(prev?.steps ?? 0, patch.steps) : patch.steps;
      }
      /* Goal and layers describe *now*, not a running total, so the newest
         write simply wins — no max. */
      if (patch.goalMl !== undefined) merged.goalMl = patch.goalMl;
      if (patch.layers !== undefined) merged.layers = patch.layers;
      if (patch.last) merged.last = patch.last;
      if (patch.rev !== undefined) merged.rev = Math.max(prev && sameDay ? (prev.rev ?? 0) : 0, patch.rev);
      if (patch.reps !== undefined) {
        merged.reps = sameDay ? Math.max(prev?.reps ?? 0, patch.reps) : patch.reps;
      }
      if (patch.topEx !== undefined) merged.topEx = patch.topEx;
      if (patch.trainedAt !== undefined) merged.trainedAt = patch.trainedAt;
      /* Ticks can be taken back, so the newest list wins; the heartbeat only
         moves forward; a poke is simply the latest. */
      if (patch.habits !== undefined) merged.habits = patch.habits;
      if (patch.hereAt !== undefined) merged.hereAt = Math.max(sameDay ? (prev?.hereAt ?? 0) : 0, patch.hereAt);
      if (patch.poke !== undefined) merged.poke = patch.poke;

      return { ...m, daily: merged };
    });
    tx.set(ref, { members }, { merge: true });
  });
}

/**
 * Take an undone drink back off today's published water.
 *
 * `recordCoupleHydration` keeps the larger of two same-day totals, so a
 * smaller total can never correct it — which is right, because a smaller total
 * is usually a stale phone, not an undo. An undo is different: the device that
 * made it knows exactly how much it took back. So this subtracts that amount
 * from whatever is published, rather than writing a new total. Water logged
 * from another device survives, and a phone with a stale total has no undo to
 * send and so cannot lower anything.
 *
 * Nothing to lower (another day, or no water published) is a no-op. Reaching
 * zero removes the key, keeping "absent means nothing to say" intact.
 */
export async function lowerCoupleHydration(
  coupleId: string,
  uid: string,
  day: string,
  byMl: number,
  extras: HydrationExtras = {},
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  if (!Number.isFinite(byMl) || byMl <= 0) return;
  const clean = cleanExtras(extras);

  const ref = coupleDoc(coupleId);
  await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;

    const couple = snap.data() as Couple;
    const mine = couple.members.find((m) => m.uid === uid);
    const current = mine?.daily?.day === day ? mine.daily.waterMl : undefined;
    if (typeof current !== 'number') return;

    const next = current - byMl;
    const members = couple.members.map((m) => {
      if (m.uid !== uid || !m.daily) return m;
      const daily: CoupleDailyMetrics = { ...m.daily };
      if (clean.goalMl !== undefined) daily.goalMl = clean.goalMl;
      if (next > 0) {
        daily.waterMl = next;
        if (clean.layers !== undefined) daily.layers = clean.layers;
        /* An undo can take the latest drink with it; whatever is newest now
           replaces it, and nothing left means no "last" to report. */
        if (clean.last) daily.last = clean.last;
        else delete daily.last;
        if (clean.rev !== undefined) daily.rev = clean.rev;
        return { ...m, daily };
      }
      delete daily.waterMl;
      delete daily.layers;
      delete daily.last;
      delete daily.rev;
      if (daily.steps !== undefined) return { ...m, daily };
      const { daily: _gone, ...withoutDaily } = m;
      return withoutDaily;
    });
    tx.set(ref, { members }, { merge: true });
  });
}

/**
 * Take one daily metric back off this member's slice.
 *
 * The counterpart to the sharing switches in `partnerSharing`. Stopping future
 * writes is not enough on its own: today's figure is already on the couple
 * document, and turning a switch off must mean the partner stops seeing it,
 * not that it freezes where it was. `recordCoupleDaily` cannot do this — its
 * same-day max refuses to walk a value down — so removal is its own write.
 *
 * Removing the key rather than writing 0 keeps the "absent means nothing
 * honest to say" contract `partnerWaterToday` / `partnerStepsToday` rely on.
 * When nothing but the day stamp would remain, the whole object goes.
 */
export async function withdrawCoupleDaily(
  coupleId: string,
  uid: string,
  key: 'waterMl' | 'steps',
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const ref = coupleDoc(coupleId);
  await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;

    const couple = snap.data() as Couple;
    const mine = couple.members.find((m) => m.uid === uid);
    if (!mine?.daily || !(key in mine.daily)) return;

    const members = couple.members.map((m) => {
      if (m.uid !== uid || !m.daily) return m;
      const rest: CoupleDailyMetrics = { ...m.daily };
      delete rest[key];
      // Water's goal and layers go with it: not sharing water means none of it.
      if (key === 'waterMl') {
        delete rest.goalMl;
        delete rest.layers;
        delete rest.last;
        delete rest.rev;
      }
      const hasOther = rest.waterMl !== undefined || rest.steps !== undefined;
      if (hasOther) return { ...m, daily: rest };
      const { daily: _gone, ...withoutDaily } = m;
      return withoutDaily;
    });
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
  /** What the reminder is for; the default is the original "come train". */
  kind: ReminderKind = 'train',
  options: {
    /** For `drank`: the amount just logged. */
    ml?: number;
    /** For `drank`: the drink kind, when it wasn't water. */
    drink?: string;
    /** For `drank`: a half-goal or goal crossing. */
    milestone?: 'half' | 'goal' | null;
    /** A reaction ("❤️") sent from the widget: carried on the nudge, and the push says so. */
    emoji?: string;
    /** Which spam bucket this spends; automatic updates use their own. */
    limit?: 'coupleNudge' | 'waterShare' | 'waterMilestone';
  } = {},
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const limit = options.limit ?? 'coupleNudge';
  const ml = typeof options.ml === 'number' && options.ml > 0 ? Math.round(options.ml) : undefined;

  // Cap spam — friend-add / duel-invite already rate-limit; nudges did not.
  assertClientRateLimit(limit, fromUid);

  // (1) In-app path — the record the partner's subscription watches.
  await coupleDoc(coupleId).set(
    {
      nudge: {
        fromUid,
        kind,
        ...(ml ? { ml } : {}),
        ...(options.drink && options.drink !== 'water' ? { drink: options.drink } : {}),
        ...(options.milestone ? { milestone: options.milestone } : {}),
        ...(options.emoji ? { emoji: options.emoji.slice(0, 8) } : {}),
        at: firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  );
  commitClientRateLimit(limit, fromUid);

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
        ...(options.emoji
          ? { title: `${senderName} sent you ${options.emoji.slice(0, 8)}`, body: 'Tap to send one back.' }
          : reminderNotification(kind, senderName, ml, {
              drink: options.drink,
              milestone: options.milestone,
            })),
        // Tagged so the foreground handler can suppress the duplicate (the in-app
        // nudge already showed it) — see `installForegroundNudgeSuppressor`.
        data: { type: 'couple-nudge', coupleId, kind, ...(ml ? { ml } : {}) },
        channelId: 'social',
        priority: 'high',
      }),
    });
  } catch {
    // The push is best-effort; the in-app nudge in (1) is the guarantee.
  }
}

/**
 * Move the partner's home-screen bear, silently.
 *
 * A data-only push — no title, no body, so no banner — carrying the finished
 * widget payload built from *my* numbers as my partner should see them. Their
 * native messaging service writes it into the widget's storage and redraws,
 * which is what makes the widget live while their app is closed. `null`
 * empties their widget (I stopped sharing water).
 *
 * Only sent to a partner whose build advertises `widgetPush`; an older build
 * would surface the untitled push as a blank banner. Best-effort throughout:
 * their app refreshes the widget from the couple document when it next runs.
 */
export async function pushPartnerWaterWidget(
  coupleId: string,
  fromUid: string,
  build: ((me: CoupleMember) => WaterWidgetSnapshot) | null,
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    /* Cache first: the live subscription on Home keeps this document in the
       local cache, so a drink costs no server read. The server is asked only
       when the cache has nothing (a cold start straight into a sync). */
    let snap = await coupleDoc(coupleId)
      .get({ source: 'cache' })
      .catch(() => null);
    if (!snap?.exists()) snap = await coupleDoc(coupleId).get();
    if (!snap.exists()) return;
    const couple = snap.data() as Couple;
    const me = couple.members.find((m) => m.uid === fromUid);
    const partner = couple.members.find((m) => m.uid !== fromUid);
    if (!me || !partner) return;
    if ((partner.widgetPush ?? 0) < WIDGET_PUSH_VERSION) return;
    const token = partner.expoPushToken ?? null;
    if (!token || !token.startsWith('ExponentPushToken')) return;

    await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        data: { type: 'partner-water', coupleId, widget: build ? build(me) : null },
        priority: 'high',
      }),
    });
  } catch {
    // Best-effort; see above.
  }
}

/** Break the bond. Both seats go, so neither side is left half-paired. */
export async function leaveCouple(coupleId: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await coupleDoc(coupleId).delete();
}

/**
 * Cancel an open pair invite without wiping a bond that just got claimed.
 * Deletes only while still `pending` with a single member.
 * @returns `'cancelled'` | `'paired'` (partner joined) | `'missing'`
 */
export async function cancelCoupleInvite(
  coupleId: string,
): Promise<'cancelled' | 'paired' | 'missing'> {
  if (!isFirebaseConfigured()) return 'missing';
  try {
    return await firestore().runTransaction(async (tx) => {
      const ref = coupleDoc(coupleId);
      const snap = await tx.get(ref);
      if (!snap.exists()) return 'missing' as const;
      const couple = snap.data() as Couple;
      if (!couple.pending || couple.memberUids.length >= 2) {
        return 'paired' as const;
      }
      tx.delete(ref);
      return 'cancelled' as const;
    });
  } catch {
    return 'missing';
  }
}
