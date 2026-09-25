import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { withDay } from '@/domain/duoStreak';
import { withTotals, type DayTotals } from '@/domain/week';
import { zustandStorage } from '@/lib/storage';

/**
 * The days both bears were full, and each day's water for both — as this
 * phone saw them. Feeds the streak, the meadow and the Sunday wrap.
 */
interface DuoStreakState {
  days: string[];
  week: Record<string, DayTotals>;
  record: (day: string) => void;
  recordTotals: (day: string, totals: DayTotals) => void;
}

export const useDuoStreakStore = create<DuoStreakState>()(
  persist(
    (set, get) => ({
      days: [],
      week: {},
      record: (day) => {
        if (get().days.includes(day)) return;
        set({ days: withDay(get().days, day) });
      },
      recordTotals: (day, totals) => {
        const prev = get().week[day];
        if (prev && prev.them >= totals.them && prev.me >= totals.me) return;
        set({ week: withTotals(get().week, day, totals) });
      },
    }),
    { name: 'repchamp.duo-streak', version: 2, storage: createJSONStorage(() => zustandStorage), migrate: (p) => ({ week: {}, ...(p as object) }) as DuoStreakState },
  ),
);
