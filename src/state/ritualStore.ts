import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { cleanTicks, toggleTick, type HabitId } from '@/domain/ritual';
import { zustandStorage } from '@/lib/storage';

/**
 * Today's hand-ticked ritual habits, kept on the phone first — a tick must
 * stick without a signal — and published to the couple from there. A new day
 * starts empty: yesterday's stretch does not count for today.
 */
interface RitualState {
  day: string;
  ticks: HabitId[];
  toggle: (day: string, id: HabitId) => HabitId[];
}

export const useRitualStore = create<RitualState>()(
  persist(
    (set, get) => ({
      day: '',
      ticks: [],
      toggle: (day, id) => {
        const base = get().day === day ? get().ticks : [];
        const ticks = toggleTick(base, id);
        set({ day, ticks });
        return ticks;
      },
    }),
    {
      name: 'repchamp.ritual',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (p) => ({ day: '', ...(p as object), ticks: cleanTicks((p as { ticks?: unknown })?.ticks) }) as RitualState,
    },
  ),
);

/** Today's ticks — empty when the stored ones are from another day. */
export function ticksFor(state: Pick<RitualState, 'day' | 'ticks'>, day: string): HabitId[] {
  return state.day === day ? state.ticks : [];
}
