import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { withDay } from '@/domain/duoStreak';
import { zustandStorage } from '@/lib/storage';

/** The days both bears were full, as this phone saw them. */
interface DuoStreakState {
  days: string[];
  record: (day: string) => void;
}

export const useDuoStreakStore = create<DuoStreakState>()(
  persist(
    (set, get) => ({
      days: [],
      record: (day) => {
        if (get().days.includes(day)) return;
        set({ days: withDay(get().days, day) });
      },
    }),
    { name: 'repchamp.duo-streak', version: 1, storage: createJSONStorage(() => zustandStorage) },
  ),
);
