import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { cleanTicks, toggleTick, withRitualDay, type HabitId, type RitualDay } from '@/domain/ritual';
import { bindAction } from '@/domain/bondScope';
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
  /** Each day's scores as this phone last saw them — the week-on-week view. */
  history: Record<string, RitualDay>;
  record: (day: string, seen: RitualDay) => void;
  /** Which pairing `history` belongs to — see `domain/bondScope`. Ticks are mine alone and stay. */
  coupleId: string;
  bind: (coupleId: string) => void;
  /** The one-time "how it works" card on Today, together has been dismissed. */
  introSeen: boolean;
  dismissIntro: () => void;
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
      history: {},
      introSeen: false,
      dismissIntro: () => set({ introSeen: true }),
      coupleId: '',
      bind: (coupleId) => {
        const action = bindAction(get().coupleId, coupleId);
        if (action === 'adopt') set({ coupleId });
        if (action === 'reset') set({ coupleId, history: {} });
      },
      record: (day, seen) => {
        const next = withRitualDay(get().history, day, seen);
        if (next !== get().history) set({ history: next });
      },
    }),
    {
      name: 'repchamp.ritual',
      version: 4,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (p) =>
        ({ day: '', history: {}, coupleId: '', introSeen: false, ...(p as object), ticks: cleanTicks((p as { ticks?: unknown })?.ticks) }) as RitualState,
    },
  ),
);

/** Today's ticks — empty when the stored ones are from another day. */
export function ticksFor(state: Pick<RitualState, 'day' | 'ticks'>, day: string): HabitId[] {
  return state.day === day ? state.ticks : [];
}
