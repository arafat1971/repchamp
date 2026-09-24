/**
 * Today's water, and the goal it is measured against.
 *
 * A store of its own rather than a slice of `profileStore`. That store is the
 * training record — it is pushed to the cloud profile, feeds the leaderboard,
 * and is persisted on every rep; water is none of those things, and putting it
 * there would churn the same blob on every tap and drag hydration into
 * `pushProfile` where it has no meaning.
 *
 * The log is append-only and carries a day on each entry, so nothing here
 * resets at midnight — see `domain/hydration.ts` for why that is the shape.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  DEFAULT_DAILY_GOAL_ML,
  DRINK_LOG_LIMIT,
  MAX_DAILY_ML,
  type DrinkEntry,
  type HydrationProgress,
  drinksOnDay,
  hydrationProgress,
  makeDrinkEntry,
  mlOnDay,
  sanitizeDrinkMl,
  sanitizeGoalMl,
} from '@/domain/hydration';
import { dayKey } from '@/domain/progression';
import { zustandStorage } from '@/lib/storage';

export interface HydrationState {
  /** Newest first, capped at `DRINK_LOG_LIMIT`. */
  drinks: DrinkEntry[];
  goalMl: number;
  /**
   * Log a drink. Returns the entry, or null when the amount was refused or
   * the day is already at its ceiling.
   *
   * Returning the entry is what lets the caller sync without recomputing: it
   * carries the day the entry actually landed on, which is the day the couple
   * write must be stamped with.
   */
  logDrink: (ml: number, kind?: string) => DrinkEntry | null;
  /** Remove one entry by id. */
  undoDrink: (id: string) => void;
  /** Remove the newest entry on a day. No-op when that day is empty. */
  undoLast: (day?: string) => void;
  setGoalMl: (ml: number) => void;
  reset: () => void;
}

const initialState = {
  drinks: [] as DrinkEntry[],
  goalMl: DEFAULT_DAILY_GOAL_ML,
};

export const useHydrationStore = create<HydrationState>()(
  persist(
    (set, get) => ({
      ...initialState,

      logDrink: (ml, kind) => {
        const amount = sanitizeDrinkMl(ml);
        if (amount === 0) return null;

        const today = dayKey();
        /* The daily ceiling is checked against what is already banked, so a
           tap that would cross it records nothing rather than being trimmed
           to fit — a partial log would claim the athlete drank an amount
           nobody chose. */
        if (mlOnDay(get().drinks, today) + amount > MAX_DAILY_ML) return null;

        const entry = makeDrinkEntry(amount, new Date(), kind);
        set((s) => ({ drinks: [entry, ...s.drinks].slice(0, DRINK_LOG_LIMIT) }));
        return entry;
      },

      undoDrink: (id) => set((s) => ({ drinks: s.drinks.filter((d) => d.id !== id) })),

      undoLast: (day = dayKey()) =>
        set((s) => {
          const newest = drinksOnDay(s.drinks, day)[0];
          if (!newest) return s;
          return { drinks: s.drinks.filter((d) => d.id !== newest.id) };
        }),

      setGoalMl: (ml) => set({ goalMl: sanitizeGoalMl(ml) }),

      reset: () => set({ ...initialState }),
    }),
    {
      name: 'repchamp.hydration',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

/** Millilitres drunk today. */
export function selectTodayMl(
  state: Pick<HydrationState, 'drinks'>,
  today = dayKey(),
): number {
  return mlOnDay(state.drinks, today);
}

/** Today's intake measured against the goal. */
export function selectTodayProgress(
  state: Pick<HydrationState, 'drinks' | 'goalMl'>,
  today = dayKey(),
): HydrationProgress {
  return hydrationProgress(state.drinks, state.goalMl, today);
}

/** Today's entries, newest first. Empty when nothing is logged yet. */
export function selectTodayDrinks(
  state: Pick<HydrationState, 'drinks'>,
  today = dayKey(),
): DrinkEntry[] {
  return drinksOnDay(state.drinks, today);
}
