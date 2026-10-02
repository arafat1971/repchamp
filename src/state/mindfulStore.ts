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
  /** Best camera-coach score per flow id, 0..100 — kept apart from the 28-day log so a best outlives it. */
  best: Record<string, number>;
  /** Records a finished camera-coach score; returns the previous best (null if none). */
  recordScore: (flowId: string, score: number) => number | null;
  /** The length last chosen per guided meditation, in minutes. */
  lengths: Record<string, number>;
  setLength: (id: string, minutes: number) => void;
}

export const useMindfulStore = create<MindfulState>()(
  persist(
    (set, get) => ({
      log: [],
      record: (entry, today) => set({ log: withMindfulEntry(get().log, entry, today) }),
      best: {},
      recordScore: (flowId, score) => {
        const prev = get().best[flowId] ?? null;
        if (prev === null || score > prev) set({ best: { ...get().best, [flowId]: score } });
        return prev;
      },
      lengths: {},
      setLength: (id, minutes) => set({ lengths: { ...get().lengths, [id]: minutes } }),
    }),
    {
      name: 'repchamp.mindful',
      version: 2,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (p) => ({ best: {}, lengths: {}, ...(p as object), log: cleanLog((p as { log?: unknown })?.log) }) as MindfulState,
    },
  ),
);
