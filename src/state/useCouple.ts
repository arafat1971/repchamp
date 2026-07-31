/**
 * The athlete's couple bond, live.
 *
 * Subscribes to whichever couple this uid belongs to and hands the screens a
 * ready-made view of it: the partner, the shared streak, the combined total and
 * whether the streak is about to lapse. All of the actual rules live in the pure
 * `domain/couple.ts` (and are tested there) — this hook only wires the
 * subscription and derives.
 *
 * Resolves to "not paired" when Firebase is unconfigured, so every couple
 * surface degrades to an invite prompt rather than erroring.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  calculateCoupleStreak,
  combinedReps,
  coupleBadges,
  coupleLevel,
  isPaired,
  nextMilestone,
  nudgeAt,
  partnerOf,
  streakAtRisk,
  type Couple,
  type CoupleBadge,
  type CoupleLevel,
  type CoupleMember,
} from '@/domain/couple';
import { dayKey } from '@/domain/progression';
import { presentNudge } from '@/lib/notifications';
import {
  flushCoupleCreditOutbox,
  promotePendingCoupleCredit,
} from '@/services/coupleCreditOutbox';
import { syncCouplePushToken, watchMyCouple } from '@/services/coupleService';
import { fetchExpoPushToken } from '@/services/userService';
import { useAuthStore } from '@/state/authStore';
import { useProfileStore } from '@/state/profileStore';

/** Free Pro days granted to both partners when a couple pairs — the invite reward. */
const PAIRING_BONUS_DAYS = 7;

export interface CoupleView {
  /** The raw bond, or null when this athlete has not paired with anyone. */
  couple: Couple | null;
  /** True only once both seats are filled. */
  paired: boolean;
  /** Set while an invite exists but nobody has claimed the second seat. */
  awaitingPartner: boolean;
  partner: CoupleMember | null;
  me: CoupleMember | null;
  /** Days in a row both partners trained. */
  streak: number;
  /** True when today still needs a session from one of them to keep the streak. */
  atRisk: boolean;
  /** Every rep the two of them have logged, all time. */
  combined: number;
  /** The next shareable combined-rep milestone, or null past the last one. */
  milestone: number | null;
  /** The couple's shared level from combined reps + streak. */
  level: CoupleLevel;
  /** The badge shelf, each marked earned or not. */
  badges: CoupleBadge[];
  /** The pair code to share, when there is a bond at all. */
  code: string | null;
  loading: boolean;
}

const EMPTY: CoupleView = {
  couple: null,
  paired: false,
  awaitingPartner: false,
  partner: null,
  me: null,
  streak: 0,
  atRisk: false,
  combined: 0,
  milestone: null,
  level: coupleLevel(0, 0),
  badges: coupleBadges(0, 0),
  code: null,
  loading: false,
};

export function useCouple(): CoupleView {
  const uid = useAuthStore((s) => s.user?.uid);
  const [couple, setCouple] = useState<Couple | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * Newest nudge already shown. Seeded on the first snapshot so opening the app
   * does not replay an old poke as if it just arrived.
   */
  const seenNudgeAt = useRef<number | null>(null);
  const seededNudge = useRef(false);
  /** Whether this device has already granted the pairing bonus for this bond. */
  const rewardedPairing = useRef(false);

  useEffect(() => {
    if (!uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCouple(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = watchMyCouple(uid, (next) => {
      setCouple(next);
      setLoading(false);

      // Reward the invite loop once: first time a bond is fully paired on this
      // device. `grantPairingBonus` is a lifetime latch — leave/re-pair after
      // expiry must not farm another free Pro week.
      const fullyPaired = !!next && next.memberUids.length >= 2 && next.pending === false;
      if (fullyPaired && !rewardedPairing.current) {
        rewardedPairing.current = true;
        useProfileStore.getState().grantPairingBonus(PAIRING_BONUS_DAYS);
        // Persist the lifetime latch + until stamp before the next device can re-farm.
        void useAuthStore.getState().pushProfile();
      }

      // Surface a nudge the *partner* sent, once. The first snapshot only seeds
      // the baseline, so a poke from yesterday doesn't fire on every launch.
      const at = nudgeAt(next);
      const from = next?.nudge?.fromUid;
      if (!seededNudge.current) {
        seededNudge.current = true;
        seenNudgeAt.current = at;
        return;
      }
      if (at !== null && at !== seenNudgeAt.current && from && from !== uid) {
        seenNudgeAt.current = at;
        const sender = next?.members.find((m) => m.uid === from);
        // Foreground presentation. A recent presentNudge briefly suppresses the
        // twin FCM banner (see `installForegroundNudgeSuppressor`); if Firestore
        // is slow, the push still shows. When the app is closed, Expo push lands.
        void presentNudge(sender?.displayName ?? 'Your partner');
      }
    });
    return unsubscribe;
  }, [uid]);

  // Promote a together-set credit parked before the bond hydrated (session → result).
  useEffect(() => {
    if (!uid || !couple?.id) return;
    const creditId = promotePendingCoupleCredit(couple.id, uid);
    if (creditId) void flushCoupleCreditOutbox();
  }, [uid, couple?.id]);

  // When a bond appears (or this device already had a private token before pairing),
  // publish the token onto our member slice so the partner can nudge remotely.
  useEffect(() => {
    if (!uid || !couple?.id) return;
    let cancelled = false;
    void (async () => {
      const token = await fetchExpoPushToken(uid);
      if (!token || cancelled) return;
      await syncCouplePushToken(couple.id, uid, token);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, couple?.id]);

  return useMemo(() => {
    if (!couple || !uid) return { ...EMPTY, loading };

    const today = dayKey();
    const paired = isPaired(couple);
    const combined = combinedReps(couple);
    const streak = calculateCoupleStreak(couple, today);

    return {
      couple,
      paired,
      awaitingPartner: !paired,
      partner: partnerOf(couple, uid),
      me: couple.members.find((m) => m.uid === uid) ?? null,
      streak,
      atRisk: streakAtRisk(couple, today),
      combined,
      milestone: nextMilestone(combined),
      level: coupleLevel(combined, streak),
      badges: coupleBadges(combined, streak),
      code: couple.id,
      loading,
    };
  }, [couple, uid, loading]);
}
