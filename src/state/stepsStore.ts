/**
 * The step goal and the days behind today's count.
 *
 * Its own store for the same reason water has one: steps are not part of the
 * training record that `profileStore` pushes to the cloud. Every read that
 * `useStepsToday` makes lands here, so the week chart, streaks and badges fill
 * in from reads the app already makes — no extra sensor work.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dayKey } from '@/domain/progression';
import { DEFAULT_STEP_GOAL, sanitizeStepGoal } from '@/domain/steps';
import { recordStepDay, type StepDay } from '@/domain/stepsHistory';
import { zustandStorage } from '@/lib/storage';

export interface StepsStoreState {
  goal: number;
  /** Newest first. */
  history: StepDay[];
  /**
   * The partner's daily totals as this phone saw them. Partners only share
   * today's count, so their week is built here from what arrives each day.
   * Cleared when the partner changes.
   */
  partnerUid: string | null;
  partnerHistory: StepDay[];
  recordPartner: (uid: string, steps: number, goal: number, day?: string) => void;
  setGoal: (goal: number) => void;
  record: (steps: number, day?: string) => void;
  reset: () => void;
}

const initialState = {
  goal: DEFAULT_STEP_GOAL,
  history: [] as StepDay[],
  partnerUid: null as string | null,
  partnerHistory: [] as StepDay[],
};

export const useStepsStore = create<StepsStoreState>()(
  persist(
    (set, get) => ({
      ...initialState,
      setGoal: (goal) => {
        const g = sanitizeStepGoal(goal);
        const today = dayKey();
        const todayRec = get().history.find((d) => d.day === today);
        set((s) => ({
          goal: g,
          /* Today is re-measured against the new goal; past days keep theirs. */
          history: todayRec ? recordStepDay(s.history, today, todayRec.steps, g) : s.history,
        }));
      },
      record: (steps, day = dayKey()) => {
        const next = recordStepDay(get().history, day, steps, get().goal);
        const before = get().history;
        if (next.length === before.length && next.every((d, i) => d === before[i])) return;
        set({ history: next });
      },
      recordPartner: (uid, steps, goal, day = dayKey()) => {
        const base = get().partnerUid === uid ? get().partnerHistory : [];
        const next = recordStepDay(base, day, steps, goal);
        if (get().partnerUid === uid && next.length === base.length && next.every((d, i) => d === base[i])) return;
        set({ partnerUid: uid, partnerHistory: next });
      },
      reset: () => set({ ...initialState }),
    }),
    {
      name: 'repchamp.steps',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
