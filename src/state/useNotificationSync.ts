/**
 * Keeps local notification schedules in sync with training + couple state.
 *
 * One place so Home, Settings, couple, and session finish all share the same
 * low-volume policy (see `syncLocalReminders` in lib/notifications.ts).
 */

import { useEffect } from 'react';

import { daysSinceLastSession } from '@/domain/dormantReminder';
import { dayKey } from '@/domain/progression';
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
    /* `sessions` is intentionally not a dependency: it is a new array on every
       profile write, which would re-sync the schedules on each finished rep.
       `trainedToday` and `streak` are the parts of it this copy reads, and both
       are primitives that change only when the history meaningfully does. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dailyReminder,
    trainedToday,
    streak,
    couple.paired,
    couple.atRisk,
    couple.partner?.displayName,
  ]);
}
