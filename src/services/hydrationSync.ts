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

import { partnerStepsToday, partnerWaterToday } from '@/domain/couple';
import { recordCoupleHydration, recordCoupleSteps } from '@/services/coupleService';
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
  lastSteps = null;
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

/**
 * Last published step count, kept separately from water.
 *
 * Separate because the two move on completely different schedules — water on
 * a tap, steps on a foreground read — and one memo would make each suppress
 * the other's write.
 */
let lastSteps: { day: string; steps: number } | null = null;

/**
 * Publish today's step count if it has moved.
 *
 * Only ever called with a real count, so there is no "publish a zero" case to
 * guard: a phone that cannot count steps must leave the field absent rather
 * than claim the athlete did not walk.
 */
export async function syncStepsNow(
  coupleId: string | null | undefined,
  uid: string | null | undefined,
  steps: number,
): Promise<void> {
  if (!coupleId || !uid) return;
  if (!Number.isFinite(steps) || steps <= 0) return;

  const today = dayKey();
  if (lastSteps && lastSteps.day === today && lastSteps.steps === steps) return;

  try {
    await recordCoupleSteps(coupleId, uid, today, steps);
    lastSteps = { day: today, steps };
  } catch {
    // Best-effort; the next foreground read repairs it.
  }
}

/** Re-export so callers reading the partner's values have one import site. */
export { partnerStepsToday, partnerWaterToday };
