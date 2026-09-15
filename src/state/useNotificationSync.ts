/**
 * Keeps local notification schedules in sync with training + couple state.
 *
 * One place so Home, Settings, couple, and session finish all share the same
 * low-volume policy (see `syncLocalReminders` in lib/notifications.ts).
 */

import { useEffect } from 'react';

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
       here on the same terms as the other two. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dailyReminder,
    trainedToday,
    streak,
    reminderHour,
    daysAway,
    couple.paired,
    couple.atRisk,
    couple.partner?.displayName,
  ]);
}
