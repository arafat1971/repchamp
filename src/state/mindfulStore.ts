import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { cleanLog, withMindfulEntry, type MindfulEntry } from '@/domain/mindful';
import { zustandStorage } from '@/lib/storage';

/**
 * Finished yoga flows and meditations, kept on the phone so Train can say what
 * was done today and how many minutes went in this week. Only sessions that
 * count are logged: a flow skipped to the end is not one.
 */
interface MindfulState {
  log: MindfulEntry[];
  record: (entry: MindfulEntry, today: string) => void;
}

export const useMindfulStore = create<MindfulState>()(
  persist(
    (set, get) => ({
      log: [],
      record: (entry, today) => set({ log: withMindfulEntry(get().log, entry, today) }),
    }),
    {
      name: 'repchamp.mindful',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (p) => ({ ...(p as object), log: cleanLog((p as { log?: unknown })?.log) }) as MindfulState,
    },
  ),
);
