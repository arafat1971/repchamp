/**
 * Getting today's water onto the couple document.
 *
 * Deliberately not an outbox. `recordCoupleHydration` is set-to-value, so the
 * next successful write carries the whole day's total and a dropped one loses
 * nothing — the partner's card is briefly behind and then it is not. That is a
 * much weaker guarantee than `coupleCreditOutbox` gives reps, and it is the
 * right one here: reps are incremented and cannot be replayed safely, water is
 * a total and can be replayed all day.
 *
 * So instead of a durable queue there is one function, called at the two
 * moments a missed write is most likely and most worth repairing: coming back
 * to the foreground, and the bond finishing hydration.
 */

import { partnerWaterToday } from '@/domain/couple';
import { recordCoupleHydration } from '@/services/coupleService';
import { selectTodayMl, useHydrationStore } from '@/state/hydrationStore';
import { dayKey } from '@/domain/progression';

/**
 * What we last published, so a quiet foreground writes nothing.
 *
 * Module-level rather than persisted: forgetting it across a restart costs one
 * redundant write of a value that is already correct, which is cheaper than
 * another key in storage to keep consistent.
 */
let lastPublished: { day: string; ml: number } | null = null;

/** Forget the publish memo — for tests, and for a uid change. */
export function resetHydrationSyncMemo(): void {
  lastPublished = null;
}

/**
 * Publish today's total if it has moved since the last publish.
 *
 * Never throws: a water number failing to sync is not worth interrupting
 * anything for, and the next call repairs it.
 */
export async function syncHydrationNow(
  coupleId: string | null | undefined,
  uid: string | null | undefined,
): Promise<void> {
  if (!coupleId || !uid) return;

  const today = dayKey();
  const ml = selectTodayMl(useHydrationStore.getState(), today);

  /* Nothing logged today is not the same as "sync a zero": a fresh day has
     no claim to make, and writing 0 would overwrite a total this athlete
     published from another device. */
  if (ml <= 0) return;
  if (lastPublished && lastPublished.day === today && lastPublished.ml === ml) return;

  try {
    await recordCoupleHydration(coupleId, uid, today, ml);
    lastPublished = { day: today, ml };
  } catch {
    // Best-effort; the next foreground repairs it.
  }
}

/** Re-export so callers reading the partner's value have one import site. */
export { partnerWaterToday };
