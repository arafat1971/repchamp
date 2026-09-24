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
import { METRIC_FIELD, type SharedMetricKey } from '@/domain/partnerSharing';
import { drinkLayers } from '@/domain/drinkKinds';
import { planDrinkNotice } from '@/domain/waterShare';
import {
  lowerCoupleHydration,
  nudgePartner,
  recordCoupleHydration,
  recordCoupleSteps,
  withdrawCoupleDaily,
} from '@/services/coupleService';
import { sharingPrefs, useSharingStore } from '@/state/sharingStore';
import { selectTodayMl, useHydrationStore } from '@/state/hydrationStore';
import { dayKey } from '@/domain/progression';

/**
 * What we last published, so a quiet foreground writes nothing.
 *
 * Module-level rather than persisted: forgetting it across a restart costs one
 * redundant write of a value that is already correct, which is cheaper than
 * another key in storage to keep consistent.
 */
let lastPublished: { day: string; ml: number; sig: string } | null = null;

/**
 * My goal and today's drink layers, as they go onto the couple document —
 * so my partner's jar fills against my own goal, in my drinks' colours.
 */
function hydrationExtras(today: string): { goalMl: number; layers: { k: string; ml: number }[] } {
  const state = useHydrationStore.getState();
  const layers = drinkLayers(state.drinks.filter((d) => d.day === today)).map((l) => ({ k: l.kind, ml: l.ml }));
  return { goalMl: state.goalMl, layers };
}

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
/**
 * Syncs run one at a time. Two quick taps each started a sync, both measured
 * the undo from the same stale `lastPublished`, and the partner's total was
 * lowered twice for one change — seen on device: two undos of 500 ml took
 * the published figure 500 ml below the real one. Chaining makes each sync
 * see the previous one's memo.
 */
let syncChain: Promise<void> = Promise.resolve();

export function syncHydrationNow(
  coupleId: string | null | undefined,
  uid: string | null | undefined,
): Promise<void> {
  const run = syncChain.then(() => syncHydrationOnce(coupleId, uid));
  syncChain = run.catch(() => {});
  return run;
}

async function syncHydrationOnce(
  coupleId: string | null | undefined,
  uid: string | null | undefined,
): Promise<void> {
  if (!coupleId || !uid) return;
  if (!sharingPrefs().water) return;

  const today = dayKey();
  const ml = selectTodayMl(useHydrationStore.getState(), today);
  const extras = hydrationExtras(today);
  /* The goal and layers can change without the total — a goal step, or a
     coffee swapped for a water of the same size — so they are part of what
     "unchanged" means. */
  const sig = JSON.stringify(extras);

  /* Less than this phone itself published earlier today can only mean an undo
     here — the local store never shrinks any other way. Send the difference,
     not the new total: the doc keeps the max of totals, so only a subtraction
     can bring it down, and a subtraction leaves water logged elsewhere alone.
     Checked before the zero guard below, because undoing the only drink of
     the day is exactly the case that must reach the partner. */
  if (lastPublished && lastPublished.day === today && ml < lastPublished.ml) {
    try {
      await lowerCoupleHydration(coupleId, uid, today, lastPublished.ml - ml, extras);
      lastPublished = { day: today, ml, sig };
    } catch {
      // Best-effort; the next call retries the same difference.
    }
    return;
  }

  /* Nothing logged today is not the same as "sync a zero": a fresh day has
     no claim to make, and writing 0 would overwrite a total this athlete
     published from another device. */
  if (ml <= 0) return;
  if (lastPublished && lastPublished.day === today && lastPublished.ml === ml && lastPublished.sig === sig) {
    return;
  }

  try {
    await recordCoupleHydration(coupleId, uid, today, ml, extras);
    lastPublished = { day: today, ml, sig };
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
  if (!sharingPrefs().steps) return;
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

/**
 * Flip one sharing switch and make the couple document agree with it.
 *
 * Off withdraws today's figure straight away — a switch that only stopped
 * *future* writes would leave the partner looking at a number the athlete
 * just said they did not want shown. On clears the publish memo, so the next
 * sync writes even a value identical to the one published before it was
 * turned off (the memo would otherwise swallow it as "unchanged"), and
 * republishes water at once since its total is local and to hand. Steps wait
 * for the next count read, which Home does on focus.
 *
 * The local switch flips first and unconditionally: the athlete's intent must
 * not depend on the network, and a failed withdraw is retried the next time
 * they flip it or the day rolls over (a new day's write never carries it).
 */
export async function setMetricSharing(
  coupleId: string | null | undefined,
  uid: string | null | undefined,
  key: SharedMetricKey,
  on: boolean,
): Promise<void> {
  useSharingStore.getState().setShared(key, on);
  if (key === 'water') lastPublished = null;
  else lastSteps = null;

  if (!coupleId || !uid) return;
  try {
    if (on) {
      if (key === 'water') await syncHydrationNow(coupleId, uid);
    } else {
      await withdrawCoupleDaily(coupleId, uid, METRIC_FIELD[key]);
    }
  } catch {
    // Best-effort, as above.
  }
}

/**
 * Tell the partner a drink was just logged ("Bea just drank 250 ml 💧").
 *
 * Automatic, so it must never be a nuisance: `shouldShareDrink` decides
 * whether it is worth sending at all, and the `waterShare` rate limit allows
 * one per 90 minutes from its own bucket — it never spends the athlete's
 * manual reminders. A throttled or failed send is silent: an automatic update
 * has no business raising an error dialog.
 */
export async function shareDrink(input: {
  coupleId: string | null | undefined;
  uid: string | null | undefined;
  senderName: string;
  ml: number;
  /** What it was — named in the notification when it isn't water. */
  kind?: string;
  /** My total before this drink, and my goal — for the milestones. */
  beforeMl: number;
  goalMl: number;
}): Promise<void> {
  const { coupleId, uid } = input;
  if (!coupleId || !uid) return;
  const prefs = useSharingStore.getState();
  const plan = planDrinkNotice({
    paired: true,
    sharingWater: prefs.water,
    drinkUpdates: prefs.drinkUpdates,
    ml: input.ml,
    beforeMl: input.beforeMl,
    goalMl: input.goalMl,
  });
  if (!plan) return;
  try {
    await nudgePartner(coupleId, uid, input.senderName, 'drank', {
      ml: input.ml,
      drink: input.kind,
      milestone: plan.milestone,
      limit: plan.limit,
    });
  } catch {
    // Throttled or offline — the partner still sees the total live.
  }
}

/** Re-export so callers reading the partner's values have one import site. */
export { partnerStepsToday, partnerWaterToday };
