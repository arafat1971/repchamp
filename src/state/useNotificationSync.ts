/**
 * Keeps local notification schedules in sync with training + couple state.
 *
 * One place so Home, Settings, couple, and session finish all share the same
 * low-volume policy (see `syncLocalReminders` in lib/notifications.ts).
 */

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { daysSinceLastSession } from '@/domain/dormantReminder';
import { dayKey } from '@/domain/progression';
import { reminderHourFor } from '@/domain/reminderSchedule';
import { syncLocalReminders } from '@/lib/notifications';
import { useCouple } from '@/state/useCouple';
import { selectStreak, useProfileStore } from '@/state/profileStore';
import { useSettingsStore } from '@/state/settingsStore';

export function useNotificationSync(): void {
  const dailyReminder = useSettingsStore((s) => s.dailyReminder);
  const sessions = useProfileStore((s) => s.sessions);
  const couple = useCouple();

  const today = dayKey();
  const trainedToday = sessions.some((s) => s.day === today);
  /* The athlete's own streak, which the evening reminder names. Derived here
     rather than subscribed as a selector so it recomputes with `sessions`. */
  const streak = selectStreak({ sessions }, today);
  /* Days since the last recorded session, for the dormant slot. Max rather than
     last-element: `sessions` is not guaranteed sorted, and reading the wrong end
     of it would either fire a win-back push at an active athlete or never fire
     one at all. Null with no history — never-started is not dormant. */
  const lastDay = sessions.reduce((latest, s) => (s.day > latest ? s.day : latest), '') || null;
  const daysAway = daysSinceLastSession(lastDay, today);
  /* The hour the evening slots fire at, learned from the hours in `sessions`.
     Reduced to a number here so the effect below can depend on it: the schedule
     must follow a routine that moves, and nothing else in the dependency list
     changes when it does. */
  const reminderHour = reminderHourFor(sessions);

  /**
   * Bumped whenever the app returns to the foreground, to force a re-sync.
   *
   * `expo-notifications` bakes a notification's text in at *schedule* time, so
   * the weekly recap carries whatever `buildWeeklyRecap` returned on the last
   * sync — and that claim is a fact about training ("your best set has gone
   * from 8 to 14"), not a static string. Nothing below re-runs on its own while
   * the app sits closed, so a recap scheduled early in the week could fire on
   * Monday describing a week that had barely started. That is a stale progress
   * claim delivered as current, which is the fabrication `progressProof` exists
   * to refuse, arriving through the one channel nothing was checking.
   *
   * Re-syncing on foreground bounds the staleness to "since you last opened the
   * app" instead of "since you last trained". It cannot close the gap entirely
   * — nothing can, while the OS owns the pending notification — but an athlete
   * who never opens the app all week is not the one whose recap is wrong.
   *
   * Costs nothing when nothing changed: `syncLocalReminders` cancels and
   * rewrites the same identifiers, so a re-sync is idempotent.
   */
  const [foregroundTick, setForegroundTick] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegroundTick((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    void syncLocalReminders({
      dailyReminderEnabled: dailyReminder,
      trainedToday,
      coupleAtRisk: couple.paired && couple.atRisk,
      partnerName: couple.partner?.displayName ?? null,
      streak,
      sessions,
      daysSinceLastSession: daysAway,
    });
    /* `sessions` itself is intentionally not a dependency: it is a new array on
       every profile write, which would re-sync the schedules on each finished
       rep. Instead every part of it this sync reads is listed as a primitive.

       `trainedToday` and `streak` used to be that whole list, and the comment
       here said so. They stopped being it when the schedule started reading a
       third thing out of `sessions` — the *hours* the athlete trains at. Those
       move independently of both: someone who shifts from an evening routine to
       a 07:00 one breaks no streak and flips `trainedToday` exactly as before,
       so neither primitive changes and the effect never re-runs. The learned
       hour would then follow a moved routine only by accident, whenever a streak
       break happened to re-fire this — defeating the `recentLimit` window in
       `learnTrainingHour` that exists precisely to follow such a move.

       `reminderHour` is that third reading, reduced to a number, so it belongs
       here on the same terms as the other two.

       `foregroundTick` is not read by the sync at all — it is here purely to
       re-run it when the app is reopened, so the weekly recap's baked-in copy
       is rebuilt from current history. See its declaration above. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dailyReminder,
    trainedToday,
    streak,
    reminderHour,
    daysAway,
    foregroundTick,
    couple.paired,
    couple.atRisk,
    couple.partner?.displayName,
  ]);
}
