import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { bindAction } from '@/domain/bondScope';
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
  /** Which pairing this history belongs to — see `domain/bondScope`. */
  coupleId: string;
  bind: (coupleId: string) => void;
}

export const useDuoStreakStore = create<DuoStreakState>()(
  persist(
    (set, get) => ({
      days: [],
      week: {},
      coupleId: '',
      bind: (coupleId) => {
        const action = bindAction(get().coupleId, coupleId);
        if (action === 'adopt') set({ coupleId });
        if (action === 'reset') set({ coupleId, days: [], week: {} });
      },
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
    { name: 'repchamp.duo-streak', version: 3, storage: createJSONStorage(() => zustandStorage), migrate: (p) => ({ week: {}, coupleId: '', ...(p as object) }) as DuoStreakState },
  ),
);
