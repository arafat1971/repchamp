import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/lib/storage';
import { DEFAULT_SHARING, type SharedMetricKey, type SharingPrefs } from '@/domain/partnerSharing';

/**
 * What this athlete shares with their partner.
 *
 * Its own store rather than more keys on `settingsStore`: those are device
 * behaviours (sound, haptics, reminders), this is a statement about what
 * another person may see, and it is read by the sync layer outside React —
 * keeping it small keeps `getState()` at the write site obvious.
 */
interface SharingState extends SharingPrefs {
  /** Tell the partner automatically when I log water ("just drank 250 ml"). */
  drinkUpdates: boolean;
  setShared: (key: SharedMetricKey, value: boolean) => void;
  setDrinkUpdates: (value: boolean) => void;
}

export const useSharingStore = create<SharingState>()(
  persist(
    (set) => ({
      ...DEFAULT_SHARING,
      drinkUpdates: true,
      setDrinkUpdates: (value) => set({ drinkUpdates: value }),
      setShared: (key, value) => set({ [key]: value } as Pick<SharingState, SharedMetricKey>),
    }),
    {
      name: 'repchamp.sharing',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

/** The prefs alone, for code outside React. */
export function sharingPrefs(): SharingPrefs {
  const { steps, water } = useSharingStore.getState();
  return { steps, water };
}
