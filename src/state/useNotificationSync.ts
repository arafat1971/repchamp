/**
 * Keeps local notification schedules in sync with training + couple state.
 *
 * One place so Home, Settings, couple, and session finish all share the same
 * low-volume policy (see `syncLocalReminders` in lib/notifications.ts).
 */

import { useEffect } from 'react';

import { dayKey } from '@/domain/progression';
import { syncLocalReminders } from '@/lib/notifications';
import { useCouple } from '@/state/useCouple';
import { useProfileStore } from '@/state/profileStore';
import { useSettingsStore } from '@/state/settingsStore';

export function useNotificationSync(): void {
  const dailyReminder = useSettingsStore((s) => s.dailyReminder);
  const sessions = useProfileStore((s) => s.sessions);
  const couple = useCouple();

  const today = dayKey();
  const trainedToday = sessions.some((s) => s.day === today);

  useEffect(() => {
    void syncLocalReminders({
      dailyReminderEnabled: dailyReminder,
      trainedToday,
      coupleAtRisk: couple.paired && couple.atRisk,
      partnerName: couple.partner?.displayName ?? null,
    });
  }, [dailyReminder, trainedToday, couple.paired, couple.atRisk, couple.partner?.displayName]);
}
