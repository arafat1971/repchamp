import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { appendEntry, type MindfulEntry } from '@/domain/mindful';
import { zustandStorage } from '@/lib/storage';

/**
 * Every finished yoga flow and meditation, on this phone. The streak, the
 * week's minutes and each flow's best score are all read from it (see
 * `domain/mindful`), so there is one record and nothing to keep in sync.
 */
interface MindfulState {
  entries: MindfulEntry[];
  add: (entry: MindfulEntry) => void;
  /** The meditation length last chosen, per meditation, in minutes. */
  lengths: Record<string, number>;
  setLength: (id: string, minutes: number) => void;
}

export const useMindfulStore = create<MindfulState>()(
  persist(
    (set, get) => ({
      entries: [],
      add: (entry) => set({ entries: appendEntry(get().entries, entry) }),
      lengths: {},
      setLength: (id, minutes) => set({ lengths: { ...get().lengths, [id]: minutes } }),
    }),
    {
      name: 'repchamp.mindful',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
